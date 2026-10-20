// PROTOTYPE, throwaway. Compile-only: `bun run typecheck` passes only if every @ts-expect-error line is an error.
import { html, liquidOnServer, react, type Renderer, type SendOptions, text } from './sdk.tsx';

const envelope = { template: 'password-reset', to: ['ada@example.com'] };

export const fine: SendOptions[] = [
  { ...envelope, subject: 'Reset', body: text('Reset it') },
  { ...envelope, subject: 'Reset', body: html('<p>Reset it</p>') },
  { ...envelope, subject: 'Reset', body: { html: '<p>Reset it</p>', text: 'Reset it' } },
  { ...envelope, subject: 'Reset', body: react(<p>Reset it</p>) },
  { ...envelope, data: { name: 'Ada' } },
];

// @ts-expect-error A body with html and no text fallback does not compile.
export const noText: SendOptions = { ...envelope, subject: 'Reset', body: { html: '<p>Reset it</p>' } };

// @ts-expect-error A custom renderer must return a text fallback.
export const badRenderer: Renderer<[string]> = (markup) => ({ html: markup });

// @ts-expect-error A body send needs a subject.
export const noSubject: SendOptions = { ...envelope, body: text('Reset it') };

// @ts-expect-error A send is either a body or stored-template data, never both.
export const both: SendOptions = { ...envelope, subject: 'Reset', body: text('x'), data: { name: 'Ada' } };

// @ts-expect-error Under wire B, a server-side kind is not a Body. Allowing it means `text` can't be checked here.
export const serverKind: SendOptions = { ...envelope, subject: 'Hi', body: liquidOnServer({ html: '<p>Hi</p>' }, {}) };
