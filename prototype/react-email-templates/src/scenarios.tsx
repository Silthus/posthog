// PROTOTYPE, throwaway. One send per template: the props a real app would pass at send time.
import type { ReactElement } from 'react';
import DropboxResetPasswordEmail from '../emails/dropbox-reset-password';
import KoalaWelcomeEmail from '../emails/koala-welcome';
import PlanReceiptProbeEmail from '../emails/plan-receipt-probe';
import StackOverflowTipsEmail from '../emails/stack-overflow-tips';
import VercelInviteUserEmail from '../emails/vercel-invite-user';
import YelpRecentLoginEmail from '../emails/yelp-recent-login';

export interface Scenario {
  title: string;
  origin: string;
  covers: string;
  key: string;
  sourcePath: string;
  subject: string;
  react: ReactElement;
  jsx: string;
}

export const scenarios: Scenario[] = [
  {
    title: 'Welcome (Koala)',
    origin: 'react-email demo, Community/welcome/koala-welcome.tsx',
    covers: 'One string prop in text. The easy case.',
    key: 'koala-welcome',
    sourcePath: 'emails/koala-welcome.tsx',
    subject: 'Welcome to Koala',
    react: <KoalaWelcomeEmail userFirstname="Ada" />,
    jsx: '<KoalaWelcomeEmail userFirstname="Ada" />',
  },
  {
    title: 'Password reset (Dropbox)',
    origin: 'react-email demo, Community/reset-password/dropbox-reset-password.tsx',
    covers: 'A URL prop in an href, with "&" in its query string.',
    key: 'dropbox-reset-password',
    sourcePath: 'emails/dropbox-reset-password.tsx',
    subject: 'Reset your Dropbox password',
    react: (
      <DropboxResetPasswordEmail userFirstname="Ada" resetPasswordLink="https://example.com/reset?token=abc123&user=42" />
    ),
    jsx: '<DropboxResetPasswordEmail userFirstname="Ada" resetPasswordLink="https://example.com/reset?token=abc123&user=42" />',
  },
  {
    title: 'Team invite (Vercel)',
    origin: 'react-email demo, Community/notifications/vercel-invite-user.tsx',
    covers: 'Props in src, alt, mailto: and computed strings, and an apostrophe in a name.',
    key: 'vercel-invite-user',
    sourcePath: 'emails/vercel-invite-user.tsx',
    subject: "You're invited to Enigma",
    react: (
      <VercelInviteUserEmail
        username="ada"
        userImage="/static/vercel-user.png"
        invitedByUsername="Grace O'Brien"
        invitedByEmail="grace@example.com"
        teamName="Enigma"
        teamImage="/static/vercel-team.png"
        inviteLink="https://example.com/invite/xyz"
        inviteFromIp="203.0.113.7"
        inviteFromLocation="London, United Kingdom"
      />
    ),
    jsx: `<VercelInviteUserEmail username="ada" invitedByUsername="Grace O'Brien" teamName="Enigma" inviteLink="https://example.com/invite/xyz" … />`,
  },
  {
    title: 'Security alert (Yelp)',
    origin: 'react-email demo, Community/notifications/yelp-recent-login.tsx',
    covers: 'A Date prop formatted with Intl.DateTimeFormat inside the component.',
    key: 'yelp-recent-login',
    sourcePath: 'emails/yelp-recent-login.tsx',
    subject: 'New login to your Yelp account',
    react: (
      <YelpRecentLoginEmail
        userFirstName="Ada"
        loginDate={new Date('2026-10-20T09:15:00Z')}
        loginDevice="Firefox on Linux"
        loginLocation="Berlin, Germany"
        loginIp="198.51.100.4"
      />
    ),
    jsx: `<YelpRecentLoginEmail userFirstName="Ada" loginDate={new Date('2026-10-20T09:15:00Z')} loginDevice="Firefox on Linux" … />`,
  },
  {
    title: 'Tips list (Stack Overflow)',
    origin: 'react-email demo, Community/newsletters/stack-overflow-tips.tsx',
    covers: 'An array prop rendered with tips.map(...).',
    key: 'stack-overflow-tips',
    sourcePath: 'emails/stack-overflow-tips.tsx',
    subject: 'Find what you want, faster',
    react: (
      <StackOverflowTipsEmail
        tips={[
          { id: 1, description: 'Use quotes to search for an exact phrase.' },
          { id: 2, description: 'Use [tag] to search within a tag.' },
          { id: 3, description: 'Use is:question to see only questions.' },
        ]}
      />
    ),
    jsx: `<StackOverflowTipsEmail tips={[{ id: 1, description: 'Use quotes…' }, { id: 2, … }, { id: 3, … }]} />`,
  },
  {
    title: 'Plan receipt (probe)',
    origin: 'written for this prototype, emails/plan-receipt-probe.tsx',
    covers: "A conditional on a string prop (plan === 'pro') and an optional prop (coupon), with PreviewProps that reach neither. The name holds {{ to show that data stays literal.",
    key: 'plan-receipt',
    sourcePath: 'emails/plan-receipt-probe.tsx',
    subject: 'Your receipt',
    react: <PlanReceiptProbeEmail name="Ada {{ not liquid }}" plan="pro" coupon="WELCOME10" />,
    jsx: '<PlanReceiptProbeEmail name="Ada {{ not liquid }}" plan="pro" coupon="WELCOME10" />',
  },
];
