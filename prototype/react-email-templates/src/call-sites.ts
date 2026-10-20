// PROTOTYPE, throwaway. The developer's call site for each path, next to Resend's.
export interface CallSite {
  id: string;
  title: string;
  code: string;
  notes: string[];
}

export const callSites: CallSite[] = [
  {
    id: 'resend',
    title: 'Resend today',
    code: `import { Resend } from 'resend'
import { WelcomeEmail } from './emails/welcome'

const resend = new Resend(process.env.RESEND_API_KEY)

const { data, error } = await resend.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name="Ada" />,
})`,
    notes: ['The SDK renders the element to HTML on every send and posts only HTML.', 'Resend keeps no template for it.'],
  },
  {
    id: 'renderOnce',
    title: 'A. Render once with Liquid placeholders',
    code: `import { PostHog } from 'posthog-node'
import { WelcomeEmail } from './emails/welcome'

const posthog = new PostHog(KEY, { secretKey: process.env.POSTHOG_SECRET_KEY })

const { data, error } = await posthog.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  template: posthog.emails.reactTemplate(WelcomeEmail, {
    key: 'welcome',
    subject: 'Welcome to {{ variables.name }}',
  }),
  data: { name: 'Ada' },
})`,
    notes: [
      'The SDK renders WelcomeEmail once, with every prop set to "{{ variables.<prop> }}", hashes it, and uploads it by key when PostHog lacks that hash.',
      'Each send posts only the key, the hash and data. PostHog fills the Liquid.',
      'Props become data. Data must be JSON: no Date, no React elements, no functions.',
    ],
  },
  {
    id: 'perSend',
    title: 'B. Render per send',
    code: `const { data, error } = await posthog.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name="Ada" />,
})`,
    notes: [
      'Same as Resend, character for character, apart from the client.',
      'The SDK renders HTML and plain text and posts both. The send route needs inline subject, html and text.',
      'PostHog keeps no template: nothing in the library, no preview, no edit with your agent, no content hash.',
    ],
  },
  {
    id: 'hybrid',
    title: 'C. Hybrid: render per send, listed in the library',
    code: `const { data, error } = await posthog.emails.send({
  from: 'Acme <hello@acme.com>',
  to: 'ada@example.com',
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name="Ada" />,
  template: 'welcome',
})`,
    notes: [
      'B plus one field. The SDK renders the real props for the recipient, and renders WelcomeEmail.PreviewProps once per process for the library.',
      'The send posts the inline HTML and text plus template: { key, hash }. The hash is the preview render, so it changes only when the component changes.',
      'A hash PostHog lacks answers 409; the SDK uploads the preview render with its source path and retries once, as posthog-node does for HTML files.',
      'Without template, it is B.',
    ],
  },
];
