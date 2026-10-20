// PROTOTYPE, throwaway. An in-memory stand-in for PostHog's code-managed templates and send route.
// The Liquid setup copies nodejs/src/cdp/utils/liquid.ts on PostHog/posthog master (outputEscape + decodeLiquidTags),
// and the content hash copies packages/node/src/email-content-hash.ts on posthog-js feat/node-emails-send,
// so what this fake stores and sends matches what the real stack would.
import { Liquid } from 'liquidjs';

export interface TemplateContent {
  subject: string;
  preheader?: string;
  html: string;
  text?: string;
}

export interface StoredTemplate extends TemplateContent {
  key: string;
  contentHash: string;
  managedBy: 'code';
  sourcePath?: string;
  kind: 'liquid' | 'react-preview';
}

export interface SentEmail {
  to: string;
  subject: string;
  html: string;
  templateKey?: string;
  templateHash?: string;
  requestBytes: number;
  route: 'send by key' | 'send inline' | 'send inline with template';
}

export type SendRequest =
  | { template: { key: string; hash: string }; to: string; data: Record<string, unknown> }
  | { to: string; subject: string; html: string; text?: string; template?: { key: string; hash: string } };

export type SendResponse =
  | { status: 200; email: SentEmail }
  | { status: 409; code: 'template_outdated' };

const liquid = new Liquid({ outputEscape: 'escape', templates: {} });

const decodeEntities = (tag: string): string =>
  tag
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');

const decodeLiquidTags = (template: string): string =>
  template.replace(/\{\{.*?\}\}|\{%.*?%\}/gs, (tag) => decodeEntities(tag));

export function renderLiquid(template: string, data: Record<string, unknown>): string {
  return liquid.parseAndRenderSync(decodeLiquidTags(template), { variables: data });
}

export async function emailContentHash(content: TemplateContent): Promise<string> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [encoder.encode('posthog-email-template-v1\n')];
  for (const part of ['subject', 'preheader', 'html', 'text'] as const) {
    const bytes = encoder.encode((content[part] ?? '').replace(/\r\n?/g, '\n'));
    chunks.push(encoder.encode(`${bytes.length}:`), bytes, encoder.encode('\n'));
  }
  const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
  return 'v1:' + Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class FakePostHog {
  readonly templates = new Map<string, StoredTemplate>();
  readonly publishedHashes = new Set<string>();
  readonly sent: SentEmail[] = [];
  readonly log: string[] = [];

  async upsertByKey(
    key: string,
    content: TemplateContent,
    meta: { sourcePath?: string; kind: StoredTemplate['kind'] },
  ): Promise<{ result: 'created' | 'updated' | 'unchanged'; contentHash: string }> {
    const contentHash = await emailContentHash(content);
    const existing = this.templates.get(key);
    const result = !existing ? 'created' : existing.contentHash === contentHash ? 'unchanged' : 'updated';
    this.templates.set(key, { key, contentHash, managedBy: 'code', ...meta, ...content });
    this.publishedHashes.add(contentHash);
    this.log.push(`PUT /messaging_templates/by_key/${key}/ -> ${result} (${contentHash.slice(0, 15)}…)`);
    return { result, contentHash };
  }

  send(request: SendRequest): SendResponse {
    const requestBytes = new TextEncoder().encode(JSON.stringify(request)).length;
    const response = this.handleSend(request, requestBytes);
    this.log.push(
      `POST /messaging/send/email/ (${requestBytes} B) -> ${response.status}${'code' in response ? ' ' + response.code : ''}`,
    );
    if (response.status === 200) {
      this.sent.push(response.email);
    }
    return response;
  }

  private handleSend(request: SendRequest, requestBytes: number): SendResponse {
    if ('data' in request) {
      const stored = this.templates.get(request.template.key);
      if (!stored || !this.publishedHashes.has(request.template.hash)) {
        return { status: 409, code: 'template_outdated' };
      }
      return {
        status: 200,
        email: {
          to: request.to,
          subject: renderLiquid(stored.subject, request.data),
          html: renderLiquid(stored.html, request.data),
          templateKey: stored.key,
          templateHash: stored.contentHash,
          requestBytes,
          route: 'send by key',
        },
      };
    }
    if (request.template && !this.publishedHashes.has(request.template.hash)) {
      return { status: 409, code: 'template_outdated' };
    }
    // Inline HTML is already final: it gets no Liquid pass, so a "{{" in a person's data stays literal.
    return {
      status: 200,
      email: {
        to: request.to,
        subject: request.subject,
        html: request.html,
        templateKey: request.template?.key,
        templateHash: request.template?.hash,
        requestBytes,
        route: request.template ? 'send inline with template' : 'send inline',
      },
    };
  }
}
