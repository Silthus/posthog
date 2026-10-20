// PROTOTYPE, throwaway. posthog-node's side: one `body`, filled by a pluggable pure renderer.
// The renderer contract is the `Rendered` type. A renderer is any function that returns it.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { convert } from 'html-to-text';
import { Liquid } from 'liquidjs';

/** What every renderer must produce. `text` is required, so TypeScript rejects a body with no text fallback. */
export interface Rendered {
  html?: string;
  text: string;
}

export type Body = Rendered | Promise<Rendered>;

export type Renderer<Args extends unknown[]> = (...args: Args) => Body;

/** One shared HTML-to-text step, so every HTML renderer derives its fallback the same way. */
export const textFromHtml = (markup: string): string =>
  convert(markup, {
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      ...['h1', 'h2', 'h3'].map((selector) => ({ selector, options: { uppercase: false } })),
    ],
  });

export const text: Renderer<[string]> = (plain) => ({ text: plain });

export const html: Renderer<[string, { text?: string }?]> = (markup, options) => ({
  html: markup,
  text: options?.text ?? textFromHtml(markup),
});

/** Renders in the SDK. The real one is prototype/react-email-templates/src/own-render.tsx (react-dom/server only). */
export const react: Renderer<[ReactElement, { text?: string }?]> = (element, options) => {
  const markup = '<!DOCTYPE html>' + renderToStaticMarkup(element).replace(/<link rel="preload" as="image"[^>]*>/g, '');
  return { html: markup, text: options?.text ?? textFromHtml(markup) };
};

// PostHog's Liquid settings (nodejs/src/cdp/utils/liquid.ts): HTML-escaped output. The SDK renders with the
// same engine and settings, so a template moves between the SDK and a stored template without changes.
const liquidEngine = new Liquid({ outputEscape: 'escape' });
const plainLiquidEngine = new Liquid();

export const liquid: Renderer<[{ html?: string; text?: string }, Record<string, unknown>]> = async (source, data) => {
  const scope = { variables: data };
  const renderedHtml = source.html ? await liquidEngine.parseAndRender(source.html, scope) : undefined;
  const renderedText = source.text ? await plainLiquidEngine.parseAndRender(source.text, scope) : undefined;
  const fallback = renderedText ?? (renderedHtml !== undefined ? textFromHtml(renderedHtml) : '');
  return { html: renderedHtml, text: fallback };
};

// ---- The send call ----

interface Envelope {
  template: string;
  to: string[];
  from?: string;
  replyTo?: string;
}

/** Either the code brings the body, or PostHog renders the stored template with `data`. Never both. */
export type SendOptions = Envelope &
  ({ subject: string; body: Body; data?: never } | { data: Record<string, unknown>; subject?: never; body?: never });

export interface SendError {
  name: string;
  code: string;
  message: string;
  why: string;
  fix: string;
  statusCode: number;
  docsUrl: string;
}

export type SendResult = { data: { id: string }; error: null } | { data: null; error: SendError };

/** Option A on the wire: the body always arrives rendered, or is absent. */
export interface WireRequestA {
  template: string;
  to: string[];
  from?: string;
  reply_to?: string;
  subject?: string;
  body?: { html?: string; text?: string };
  data?: Record<string, unknown>;
}

export async function toWireA(options: SendOptions): Promise<WireRequestA> {
  const envelope = { template: options.template, to: options.to, from: options.from, reply_to: options.replyTo };
  if (options.body === undefined) {
    return { ...envelope, data: options.data };
  }
  const body = await options.body;
  return { ...envelope, subject: options.subject, body: { html: body.html, text: body.text } };
}

// ---- Option B only: a renderer that does not render, it names a server-side kind ----

export interface ServerBody {
  kind: 'liquid' | 'hog';
  html?: string;
  text?: string;
  data?: Record<string, unknown>;
}

/** Under B, `liquidOnServer` returns source, not output. Its text fallback can't be checked here, only on the server. */
export const liquidOnServer = (source: { html?: string; text?: string }, data: Record<string, unknown>): ServerBody => ({
  kind: 'liquid',
  ...source,
  data,
});

export const hogOnServer = (source: { html?: string; text?: string }, data: Record<string, unknown>): ServerBody => ({
  kind: 'hog',
  ...source,
  data,
});
