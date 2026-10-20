// PROTOTYPE, throwaway. An in-memory PostHog that mirrors upstream's transactional path:
// - products/messaging/backend/services/transactional_email.py: one workflow per template, one run per send,
//   the template's content synced into the workflow as versions.
// - products/workflows/backend/services/transactional_email_workflows.py: trigger -> email step -> exit,
//   the email step's inputs use `templating: "liquid"`.
// - nodejs/src/cdp/services/hog-inputs.service.ts: every string leaf is Liquid, HTML-escaped except plain-text
//   fields (subject, text). Liquid output is never parsed again.
// - nodejs/src/cdp/consumers/cdp-cyclotron-worker-hogflow.consumer.ts personForFlow(): an api-triggered flow
//   sees no person properties.
// - email.service.ts: the html and text parts are sent only when non-empty.
import { createHash } from 'node:crypto';
import { Liquid } from 'liquidjs';
import { textFromHtml } from './sdk.tsx';
import type { SendError, SendResult } from './sdk.tsx';

export interface StepContent {
  subject: string;
  html: string;
  text: string;
}

interface Workflow {
  id: string;
  versions: StepContent[];
}

export interface StoredTemplate {
  key: string;
  managedBy: 'code' | 'ui';
  content: StepContent;
  workflowId: string;
  /** PR 2: the PreviewProps render, for the library preview only. Never synced to the workflow. */
  preview?: { html?: string; text: string };
}

export interface SentEmail {
  id: string;
  template: string;
  workflowVersion: number;
  bodyHash?: string;
  subject: string;
  html?: string;
  text?: string;
}

/** The managed-by-code workflow step: a fixed slot that prints the per-send body. Written once, never versioned. */
export const CODE_SLOT: StepContent = {
  subject: '{{ variables.__send.subject }}',
  html: '{{ variables.__send.html | raw }}',
  text: '{{ variables.__send.text }}',
};

const htmlLiquid = new Liquid({ outputEscape: 'escape' });
const plainLiquid = new Liquid();

// ---- Wire shapes ----

export interface RenderedBody {
  html?: string;
  text?: string;
}

/** Option A: the body is always rendered. Omitting it means "render the stored template with data". */
export interface SendRequestA {
  template: string;
  to: string[];
  subject?: string;
  body?: RenderedBody;
  data?: Record<string, unknown>;
}

/** Option B: a tagged union, one kind per renderer that PostHog runs. */
export type TaggedBody =
  | ({ kind: 'rendered' } & RenderedBody)
  | { kind: 'liquid'; html?: string; text?: string; data?: Record<string, unknown> }
  | { kind: 'hog'; html?: string; text?: string; data?: Record<string, unknown> };

export interface SendRequestB {
  template: string;
  to: string[];
  subject: string;
  body: TaggedBody;
}

/** Option B's server-side renderers. Each is a new public contract, validated and versioned forever. */
type ServerRenderer = (body: TaggedBody) => RenderedBody;

// FAKED: real Hog templating compiles `{expr}` to bytecode in Django. This only interpolates `{variables.x}`.
const fakeHog = (source: string, data: Record<string, unknown>, escape: boolean): string =>
  source.replace(/\{variables\.(\w+)\}/g, (_, name) => {
    const value = String(data[name] ?? '');
    return escape ? Bun.escapeHTML(value) : value;
  });

const SERVER_RENDERERS: Record<TaggedBody['kind'], ServerRenderer> = {
  rendered: (body) => body as RenderedBody,
  liquid: (body) => {
    const b = body as Extract<TaggedBody, { kind: 'liquid' }>;
    const scope = { variables: b.data ?? {} };
    return {
      html: b.html ? htmlLiquid.parseAndRenderSync(b.html, scope) : undefined,
      text: b.text ? plainLiquid.parseAndRenderSync(b.text, scope) : undefined,
    };
  },
  hog: (body) => {
    const b = body as Extract<TaggedBody, { kind: 'hog' }>;
    return {
      html: b.html ? fakeHog(b.html, b.data ?? {}, true) : undefined,
      text: b.text ? fakeHog(b.text, b.data ?? {}, false) : undefined,
    };
  },
};

// ---- The fake ----

const DOCS = 'https://posthog.com/docs/workflows/transactional-email';

const fail = (statusCode: number, name: string, code: string, message: string, why: string, fix: string): SendResult => ({
  data: null,
  error: { name, code, message, why, fix, statusCode, docsUrl: DOCS } satisfies SendError,
});

export class FakePostHog {
  readonly templates = new Map<string, StoredTemplate>();
  readonly workflows = new Map<string, Workflow>();
  readonly sent: SentEmail[] = [];
  readonly log: string[] = [];

  /** Today's UI path: a stored Liquid template made transactional. */
  createUiTemplate(key: string, content: StepContent): void {
    const workflowId = this.createWorkflow(content);
    this.templates.set(key, { key, managedBy: 'ui', content, workflowId });
  }

  /** Option A's route. */
  sendA(request: SendRequestA): SendResult {
    this.log.push(`POST /emails (A) template=${request.template} body=${request.body ? 'rendered' : 'none'}`);
    if (!request.body) {
      return this.sendStored(request.template, request.to, request.data ?? {});
    }
    if (!request.subject) {
      return fail(422, 'missing_required_field', 'subject_required', 'A send with a body needs a subject.',
        'The subject is part of each send when the code brings the body.', 'Pass `subject`.');
    }
    return this.sendBody(request.template, request.to, request.subject, request.body);
  }

  /** Option B's route: render per kind on the server, then the same slot as A. */
  sendB(request: SendRequestB): SendResult {
    this.log.push(`POST /emails (B) template=${request.template} kind=${request.body.kind}`);
    const renderer = SERVER_RENDERERS[request.body.kind];
    if (!renderer) {
      return fail(422, 'validation_error', 'unknown_body_kind', `Unknown body kind.`, 'No renderer has that name.', 'Use a listed kind.');
    }
    return this.sendBody(request.template, request.to, request.subject, renderer(request.body));
  }

  private sendStored(key: string, to: string[], data: Record<string, unknown>): SendResult {
    const template = this.templates.get(key);
    if (!template) {
      return fail(404, 'not_found', 'template_not_found', `No template "${key}".`,
        'A send without a body renders a stored template, and none has this key.', 'Pass `body`, or create the template in PostHog.');
    }
    if (template.managedBy === 'code') {
      return fail(422, 'validation_error', 'body_required', `"${key}" is managed by code.`,
        'Its content lives in your code, so each send brings the body.', 'Pass `body`.');
    }
    return this.run(template, to, data);
  }

  private sendBody(key: string, to: string[], subject: string, body: RenderedBody): SendResult {
    if (!body.html && !body.text) {
      return fail(422, 'validation_error', 'body_empty', 'The body is empty.', 'An email needs html or text.', 'Pass `body.html` or `body.text`.');
    }
    const template = this.templates.get(key) ?? this.createCodeTemplate(key);
    if (template.managedBy !== 'code') {
      return fail(409, 'validation_error', 'template_not_code_managed', `"${key}" is edited in PostHog.`,
        'Its content lives in PostHog, so a send can not replace it.', 'Drop `body` and pass `data`, or use another key.');
    }
    // The one place a REST caller's html-only body gets its text fallback. Same library as the SDK.
    const text = body.text ?? (body.html ? textFromHtml(body.html) : '');
    const send = { subject, html: body.html ?? '', text };
    return this.run(template, to, { __send: send }, hashBody(send));
  }

  private createCodeTemplate(key: string): StoredTemplate {
    const template: StoredTemplate = { key, managedBy: 'code', content: CODE_SLOT, workflowId: this.createWorkflow(CODE_SLOT) };
    this.templates.set(key, template);
    this.log.push(`  created "Managed by code" template ${key} + workflow ${template.workflowId} (slot)`);
    return template;
  }

  private createWorkflow(content: StepContent): string {
    const id = `wf_${this.workflows.size + 1}`;
    this.workflows.set(id, { id, versions: [content] });
    return id;
  }

  /** The worker: renders the workflow's email step with Liquid, as hog-inputs.service.ts does. */
  private run(template: StoredTemplate, to: string[], variables: Record<string, unknown>, bodyHash?: string): SendResult {
    if (to.length !== 1) {
      return fail(422, 'validation_error', 'one_recipient', 'Send to one recipient.', 'Each send runs the workflow once for one person.', 'Call send once per recipient.');
    }
    const workflow = this.workflows.get(template.workflowId)!;
    const step = workflow.versions.at(-1)!;
    const globals = { variables, person: { properties: {} } };
    const subject = plainLiquid.parseAndRenderSync(step.subject, globals);
    const html = htmlLiquid.parseAndRenderSync(step.html, globals);
    const text = plainLiquid.parseAndRenderSync(step.text, globals);
    const email: SentEmail = {
      id: `msg_${this.sent.length + 1}`,
      template: template.key,
      workflowVersion: workflow.versions.length,
      bodyHash,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    };
    this.sent.push(email);
    this.log.push(`  ran ${workflow.id} v${email.workflowVersion} -> ${email.id}`);
    return { data: { id: email.id }, error: null };
  }
}

function hashBody(body: StepContent): string {
  return 'b1:' + createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
}
