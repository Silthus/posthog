// PROTOTYPE, throwaway. Sketches of what posthog-node would do inside `emails.send` for each path.
// Each path takes the same React element a Resend user already has: <Component {...props} />.
import type { ComponentType, ReactElement } from 'react';
import { createElement } from 'react';
import { render } from 'react-email';
import { decodeHTML } from 'entities';
import { emailContentHash, type FakePostHog, renderLiquid } from './fake-posthog';

export type EmailComponent<P extends object = any> = ComponentType<P> & { PreviewProps?: P };

export interface SendInput {
  react: ReactElement;
  to: string;
  subject: string;
  /** The template key in PostHog. Only the render-once and hybrid paths need it. */
  template: string;
  sourcePath: string;
}

export interface PathResult {
  recipientHtml?: string;
  error?: string;
  storedTemplate?: { html: string; contentHash: string; kind: string };
  sendRequest?: unknown;
  requests: string[];
}

const placeholder = (prop: string): string => `{{ variables.${prop} }}`;

function componentOf(element: ReactElement): EmailComponent {
  return element.type as EmailComponent;
}

function propsOf(element: ReactElement): Record<string, unknown> {
  return element.props as Record<string, unknown>;
}

function jsonRoundTrip(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value));
}

async function withTrace(posthog: FakePostHog, run: (result: PathResult) => Promise<void>): Promise<PathResult> {
  const logStart = posthog.log.length;
  const result: PathResult = { requests: [] };
  try {
    await run(result);
  } catch (error) {
    result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  result.requests = posthog.log.slice(logStart);
  return result;
}

/** A: render once with a Liquid placeholder for every prop, upload by key, send by key with the props as `data`. */
export function sendRenderOnce(posthog: FakePostHog, input: SendInput): Promise<PathResult> {
  return withTrace(posthog, async (result) => {
    const Component = componentOf(input.react);
    const props = propsOf(input.react);
    const propNames = new Set([...Object.keys(Component.PreviewProps ?? {}), ...Object.keys(props)]);
    const placeholderProps = Object.fromEntries([...propNames].map((name) => [name, placeholder(name)]));
    const html = await render(createElement(Component, placeholderProps));
    const content = { subject: input.subject, html };
    const contentHash = await emailContentHash(content);
    const request = { template: { key: input.template, hash: contentHash }, to: input.to, data: jsonRoundTrip(props) };
    let response = posthog.send(request);
    if (response.status === 409) {
      await posthog.upsertByKey(input.template, content, { sourcePath: input.sourcePath, kind: 'liquid' });
      response = posthog.send(request);
    }
    result.sendRequest = request;
    result.storedTemplate = { html, contentHash, kind: 'liquid' };
    if (response.status === 200) {
      result.recipientHtml = response.email.html;
    }
  });
}

/** B: render with the real props on every send and send the HTML inline. PostHog keeps no template. */
export function sendRenderPerSend(posthog: FakePostHog, input: SendInput): Promise<PathResult> {
  return withTrace(posthog, async (result) => {
    const html = await render(input.react);
    const text = await render(input.react, { plainText: true });
    const request = { to: input.to, subject: input.subject, html, text };
    const response = posthog.send(request);
    result.sendRequest = request;
    if (response.status === 200) {
      result.recipientHtml = response.email.html;
    }
  });
}

/**
 * C: render with the real props on every send, and also keep a library entry: the component rendered with its
 * PreviewProps, keyed and hashed. The send carries the inline HTML plus `template: { key, hash }`.
 */
export function sendHybrid(posthog: FakePostHog, input: SendInput): Promise<PathResult> {
  return withTrace(posthog, async (result) => {
    const Component = componentOf(input.react);
    const html = await render(input.react);
    const text = await render(input.react, { plainText: true });
    const previewHtml = await render(createElement(Component, Component.PreviewProps ?? {}));
    const previewContent = { subject: input.subject, html: previewHtml };
    const previewHash = await emailContentHash(previewContent);
    const request = { to: input.to, subject: input.subject, html, text, template: { key: input.template, hash: previewHash } };
    let response = posthog.send(request);
    if (response.status === 409) {
      await posthog.upsertByKey(input.template, previewContent, { sourcePath: input.sourcePath, kind: 'react-preview' });
      response = posthog.send(request);
    }
    result.sendRequest = request;
    result.storedTemplate = { html: previewHtml, contentHash: previewHash, kind: 'react-preview' };
    if (response.status === 200) {
      result.recipientHtml = response.email.html;
    }
  });
}

export interface SubstitutionCheck {
  substitutionOnly: boolean;
  reasons: string[];
}

/**
 * The mix: decide per component whether render once is safe. Only string props get a placeholder. The component
 * rendered with placeholders and filled by Liquid with the PreviewProps must equal the component rendered with the
 * PreviewProps. It proves the equality for the PreviewProps only, so a branch they don't reach stays unchecked.
 */
export async function checkSubstitutionOnly(Component: EmailComponent): Promise<SubstitutionCheck> {
  const previewProps = (Component.PreviewProps ?? {}) as Record<string, unknown>;
  const reasons = Object.entries(previewProps)
    .filter(([, value]) => typeof value !== 'string')
    .map(([name, value]) => `\`${name}\` is ${describe(value)}, so the component computes with it at render time`);
  if (reasons.length > 0) {
    return { substitutionOnly: false, reasons };
  }
  const placeholderProps = Object.fromEntries(Object.keys(previewProps).map((name) => [name, placeholder(name)]));
  try {
    const filled = renderLiquid(await render(createElement(Component, placeholderProps)), previewProps);
    const direct = await render(createElement(Component, previewProps));
    if (normalize(filled) !== normalize(direct)) {
      return { substitutionOnly: false, reasons: [`the Liquid fill differs from a direct render: ${firstDifference(filled, direct)}`] };
    }
  } catch (error) {
    return { substitutionOnly: false, reasons: [`rendering with placeholders throws: ${String(error)}`] };
  }
  return { substitutionOnly: true, reasons: [] };
}

function describe(value: unknown): string {
  if (value instanceof Date) return 'a Date';
  if (Array.isArray(value)) return 'an array';
  if (value && typeof value === 'object' && '$$typeof' in value) return 'a React element';
  return `a ${typeof value}`;
}

const PREVIEW_PADDING = /[\u00a0\u200b-\u200f\ufeff]+/g;

/** Compares what a reader sees: entities decoded, whitespace collapsed, and <Preview>'s invisible padding dropped. */
export function normalize(html: string): string {
  return decodeHTML(html.replace(/<!-- -->/g, ''))
    .replace(PREVIEW_PADDING, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function previewPaddingLength(html: string): number {
  return (decodeHTML(html).match(PREVIEW_PADDING) ?? []).reduce((total, run) => total + run.length, 0);
}

export function firstDifference(a: string, b: string): string {
  const left = normalize(a);
  const right = normalize(b);
  let index = 0;
  while (index < left.length && left[index] === right[index]) index++;
  const start = Math.max(0, index - 40);
  return `got "…${left.slice(start, index + 50)}…", expected "…${right.slice(start, index + 50)}…"`;
}
