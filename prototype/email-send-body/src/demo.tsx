// PROTOTYPE, throwaway. Runs every renderer through both wire shapes and prints what PostHog stores and sends.
import { FakePostHog, type SendRequestA } from './fake-posthog.ts';
import {
  type Body,
  hogOnServer,
  html,
  liquid,
  liquidOnServer,
  react,
  type Rendered,
  type SendOptions,
  text,
  toWireA,
} from './sdk.tsx';

function Welcome({ name, url }: { name: string; url: string }) {
  return (
    <html>
      <body>
        <h1>Welcome, {name}</h1>
        <p>
          Finish setup: <a href={url}>open PostHog</a>
        </p>
        <img src="https://example.com/logo.png" alt="" />
      </body>
    </html>
  );
}

/** A user's own renderer: any pure function returning Rendered. No registration. */
const receipt = (data: { plan: string; amount: string }): Rendered => ({
  html: `<p>You are on <b>${data.plan}</b>. You paid ${data.amount}.</p>`,
  text: `You are on ${data.plan}. You paid ${data.amount}.`,
});

const posthog = new FakePostHog();
const cut = (value: string | undefined, length = 70): string =>
  value === undefined ? '(none)' : JSON.stringify(value.length > length ? value.slice(0, length) + '…' : value);

function heading(title: string): void {
  console.log(`\n=== ${title} ${'='.repeat(Math.max(0, 70 - title.length))}`);
}

function printState(): void {
  console.log('  -- state --');
  for (const t of posthog.templates.values()) {
    const wf = posthog.workflows.get(t.workflowId)!;
    console.log(`  template ${t.key} [${t.managedBy}] -> ${wf.id}, ${wf.versions.length} version(s), html step ${cut(wf.versions.at(-1)!.html, 40)}`);
  }
}

async function sdkSend(label: string, options: SendOptions): Promise<void> {
  const wire = await toWireA(options);
  const result = posthog.sendA(wire as SendRequestA);
  console.log(`\n- ${label}`);
  console.log(`  wire body: ${wire.body ? `{ html: ${cut(wire.body.html, 40)}, text: ${cut(wire.body.text, 40)} }` : `none, data ${JSON.stringify(wire.data)}`}`);
  report(result);
}

function report(result: ReturnType<FakePostHog['sendA']>): void {
  if (result.error) {
    console.log(`  -> error ${result.error.statusCode} ${result.error.code}: ${result.error.message} Fix: ${result.error.fix}`);
    return;
  }
  const email = posthog.sent.at(-1)!;
  console.log(`  -> ${email.id} subject ${cut(email.subject, 40)} (workflow v${email.workflowVersion}, body ${email.bodyHash ?? 'stored'})`);
  console.log(`     html ${cut(email.html)}`);
  console.log(`     text ${cut(email.text)}`);
}

const base = { to: ['ada@example.com'] };

heading('1. One `body`, every renderer (wire A: always rendered)');
await sdkSend("body: text('...')", { ...base, template: 'password-reset', subject: 'Reset your password', body: text('Reset it here: https://example.com/r/1') });
await sdkSend("body: html('<p>..</p>')  text derived in the SDK", { ...base, template: 'password-reset', subject: 'Reset your password', body: html('<p>Reset it <a href="https://example.com/r/2">here</a>.</p>') });
await sdkSend("body: html('<p>..</p>', { text })", { ...base, template: 'password-reset', subject: 'Reset your password', body: html('<p>Reset it.</p>', { text: 'Reset it: https://example.com/r/3' }) });
await sdkSend('body: react(<Welcome/>)', { ...base, template: 'welcome', subject: 'Welcome to PostHog', body: react(<Welcome name="Ada" url="https://example.com/start" />) });
await sdkSend('body: liquid({ html }, data)  rendered in the SDK', { ...base, template: 'welcome-liquid', subject: 'Hi', body: liquid({ html: '<p>Hi {{ variables.name }}, ' + 'you have {{ variables.count | plus: 1 }} seats.</p>' }, { name: 'Ada & Co', count: 4 }) });
await sdkSend('body: receipt(data)  a plain pure function', { ...base, template: 'receipt', subject: 'Your receipt', body: receipt({ plan: 'Scale', amount: '$450' }) });
printState();
console.log('  password-reset ran three different bodies on one workflow with one version. The send carries the body hash.');

heading('2. Resend call sites, rewritten');
const resendMap: [string, string, Body][] = [
  ["resend: { html }", "body: html(h)", html('<p>Hello</p>')],
  ["resend: { html, text }", "body: { html, text }  or  html(h, { text })", { html: '<p>Hello</p>', text: 'Hello' }],
  ["resend: { text }", "body: text(t)  or  { text }", text('Hello')],
  ["resend: { react }", "body: react(<C/>)", react(<Welcome name="Ada" url="https://example.com" />)],
  ["resend: { react, text }", "body: react(<C/>, { text })", react(<Welcome name="Ada" url="https://example.com" />, { text: 'Welcome, Ada' })],
];
for (const [from, to, body] of resendMap) {
  const rendered = await body;
  console.log(`  ${from.padEnd(24)} -> ${to.padEnd(44)} text ${cut(rendered.text, 30)}`);
}
console.log("  resend: { template: { id, variables } } -> { template: 'key', data }  (no body: PostHog renders the stored template)");

heading('3. REST caller in another language sends html only');
report(posthog.sendA({ template: 'password-reset', to: ['bob@example.com'], subject: 'Reset', body: { html: '<p>Reset <a href="https://example.com/r/9">here</a></p>' } }));
console.log('  The server derived the text part with the same html-to-text call the SDK uses.');

heading('4. Per-send body is never parsed as Liquid again');
await sdkSend('react(<Welcome name="{{ 7 | times: 6 }}"/>)', { ...base, template: 'welcome', subject: 'Welcome {{ 1 | plus: 1 }}', body: react(<Welcome name="{{ 7 | times: 6 }}" url="https://example.com" />) });
console.log(`  html contains "42": ${posthog.sent.at(-1)!.html!.includes('42')}. Subject kept literal: ${posthog.sent.at(-1)!.subject === 'Welcome {{ 1 | plus: 1 }}'}.`);

heading('5. Server-side templates stay what they are today: a stored template + data');
posthog.createUiTemplate('weekly-digest', {
  subject: 'Your week, {{ variables.name }}',
  html: '<p>Hi {{ variables.name }} ({{ person.properties.email }}), you had {{ variables.events }} events.</p>',
  text: '',
});
await sdkSend("{ template: 'weekly-digest', data }  (UI-made Liquid template)", { ...base, template: 'weekly-digest', data: { name: 'Ada', events: 12 } });
console.log('  person.properties.email rendered empty: api-triggered flows get no person properties upstream (personForFlow).');
console.log('  html-only stored template: the worker sends no text part, so this path still breaks the text rule.');
await sdkSend('body sent to a UI-made template', { ...base, template: 'weekly-digest', subject: 'x', body: text('x') });
await sdkSend('no body for a code-managed template', { ...base, template: 'welcome', data: { name: 'Ada' } });
printState();

heading('6. Wire B: tagged union, PostHog renders liquid and hog per send');
const liquidSource = { html: '<p>Hi {{ variables.name }}, you have {{ variables.count | plus: 1 }} seats.</p>' };
const data = { name: 'Ada & Co', count: 4 };
report(posthog.sendB({ template: 'welcome-liquid', to: base.to, subject: 'Hi', body: liquidOnServer(liquidSource, data) }));
const aHtml = posthog.sent.find((e) => e.template === 'welcome-liquid')!.html;
console.log(`  same html as A's SDK-side liquid(): ${aHtml === posthog.sent.at(-1)!.html}`);
console.log(`  text part: ${cut(posthog.sent.at(-1)!.text)}  <- derived on the server, the SDK could not check it`);
report(posthog.sendB({ template: 'welcome-hog', to: base.to, subject: 'Hi', body: hogOnServer({ html: '<p>Hi {variables.name}</p>', text: 'Hi {variables.name}' }, data) }));
report(posthog.sendB({ template: 'welcome', to: base.to, subject: 'Hi', body: { kind: 'rendered', ...(await react(<Welcome name="Ada" url="https://example.com" />)) } }));
console.log('  B reaches the same slot as A. It only moves liquid and hog rendering from the SDK to cdp-api,');
console.log('  where each kind needs a validator, a render budget, an error mapping, and a text derive.');
printState();

heading('Request log');
for (const line of posthog.log) console.log('  ' + line);
