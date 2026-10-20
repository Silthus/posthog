// PROTOTYPE, throwaway. Runs every scenario through every path and collects what to show side by side.
import { render } from 'react-email';
import { emailContentHash, FakePostHog } from './fake-posthog';
import { type Scenario, scenarios } from './scenarios';
import {
  checkSubstitutionOnly,
  type EmailComponent,
  firstDifference,
  normalize,
  previewPaddingLength,
  type PathResult,
  type SubstitutionCheck,
  sendHybrid,
  sendRenderOnce,
  sendRenderPerSend,
  type SendInput,
} from './sdk-sketch';

export type PathName = 'renderOnce' | 'perSend' | 'hybrid';

export interface PathOutcome extends PathResult {
  matchesResend: boolean;
  difference?: string;
  secondSendBytes?: number;
  hashStableAcrossRenders?: boolean;
  previewPaddingDelta?: number;
}

export interface ScenarioOutcome {
  scenario: Scenario;
  resendHtml: string;
  check: SubstitutionCheck;
  mixPicks: PathName;
  paths: Record<PathName, PathOutcome>;
}

const senders: Record<PathName, (posthog: FakePostHog, input: SendInput) => Promise<PathResult>> = {
  renderOnce: sendRenderOnce,
  perSend: sendRenderPerSend,
  hybrid: sendHybrid,
};

async function runPath(name: PathName, scenario: Scenario, resendHtml: string): Promise<PathOutcome> {
  const posthog = new FakePostHog();
  const input: SendInput = {
    react: scenario.react,
    to: 'ada@example.com',
    subject: scenario.subject,
    template: scenario.key,
    sourcePath: scenario.sourcePath,
  };
  const first = await senders[name](posthog, input);
  const second = await senders[name](posthog, { ...input, to: 'grace@example.com' });
  const outcome: PathOutcome = {
    ...first,
    matchesResend: first.recipientHtml !== undefined && normalize(first.recipientHtml) === normalize(resendHtml),
    secondSendBytes: second.error ? undefined : bytesOf(second.sendRequest),
  };
  if (first.recipientHtml !== undefined && !outcome.matchesResend) {
    outcome.difference = firstDifference(first.recipientHtml, resendHtml);
  }
  if (first.recipientHtml !== undefined) {
    outcome.previewPaddingDelta = previewPaddingLength(first.recipientHtml) - previewPaddingLength(resendHtml);
  }
  if (first.storedTemplate && second.storedTemplate) {
    outcome.hashStableAcrossRenders = first.storedTemplate.contentHash === second.storedTemplate.contentHash;
  }
  outcome.requests = [...first.requests, '— second send, another recipient —', ...second.requests];
  return outcome;
}

function bytesOf(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export async function compareAll(): Promise<ScenarioOutcome[]> {
  const outcomes: ScenarioOutcome[] = [];
  for (const scenario of scenarios) {
    const resendHtml = await render(scenario.react);
    const check = await checkSubstitutionOnly(scenario.react.type as EmailComponent);
    outcomes.push({
      scenario,
      resendHtml,
      check,
      mixPicks: check.substitutionOnly ? 'renderOnce' : 'hybrid',
      paths: {
        renderOnce: await runPath('renderOnce', scenario, resendHtml),
        perSend: await runPath('perSend', scenario, resendHtml),
        hybrid: await runPath('hybrid', scenario, resendHtml),
      },
    });
  }
  return outcomes;
}

export { emailContentHash };

if (import.meta.main) {
  for (const outcome of await compareAll()) {
    console.log(`\n## ${outcome.scenario.title}`);
    console.log(`  check: ${outcome.check.substitutionOnly ? 'substitution only' : 'not substitution only'} ${outcome.check.reasons.join('; ')}`);
    for (const [name, path] of Object.entries(outcome.paths)) {
      console.log(
        `  ${name}: ${path.error ?? (path.matchesResend ? 'same as Resend' : 'DIFFERS ' + path.difference)} | 2nd send ${path.secondSendBytes ?? '-'} B | hash stable ${path.hashStableAcrossRenders ?? '-'} | preview padding ${path.previewPaddingDelta ?? '-'}`,
      );
      console.log(`    ${path.requests.join('\n    ')}`);
    }
  }
}
