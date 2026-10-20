// PROTOTYPE, throwaway. `bun run optional-prop`: render once with an optional prop, across four sends in a row.
// The placeholder render depends on which props a call passes, so each variant is its own template content.
import { FakePostHog } from './fake-posthog';
import { sendRenderOnce } from './sdk-sketch';
import PlanReceiptProbeEmail from '../emails/plan-receipt-probe';

const posthog = new FakePostHog();
const sends = [{ coupon: 'WELCOME10' }, {}, { coupon: 'WELCOME10' }];

for (const extraProps of sends) {
  const result = await sendRenderOnce(posthog, {
    react: <PlanReceiptProbeEmail name="Ada" plan="pro" {...extraProps} />,
    to: 'ada@example.com',
    subject: 'Your receipt',
    template: 'plan-receipt',
    sourcePath: 'emails/plan-receipt-probe.tsx',
  });
  const couponLine = (result.recipientHtml ?? '').replace(/<!-- -->/g, '').match(/Coupon applied:[^<]*/)?.[0];
  console.log(`send with ${JSON.stringify(extraProps)}`);
  console.log(`  ${result.requests.join('\n  ')}`);
  console.log(`  recipient sees: ${couponLine ?? '(no coupon line)'}\n`);
}
