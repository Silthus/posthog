// Written for this prototype, not one of the react-email demos.
// It covers what the five demos don't: a conditional on a string prop and an optional prop.

import { Body, Container, Head, Heading, Html, Preview, Text } from 'react-email';

interface PlanReceiptProbeEmailProps {
  name: string;
  plan: string;
  coupon?: string;
}

export const PlanReceiptProbeEmail = ({ name, plan, coupon }: PlanReceiptProbeEmailProps) => (
  <Html>
    <Head />
    <Body style={{ fontFamily: 'sans-serif', background: '#f6f6f6' }}>
      <Preview>Your {plan} plan receipt</Preview>
      <Container style={{ background: '#fff', padding: 24 }}>
        <Heading>Thanks, {name}</Heading>
        {plan === 'pro' ? (
          <Text>You are on Pro. Priority support is included.</Text>
        ) : (
          <Text>You are on the free plan. Upgrade any time.</Text>
        )}
        {coupon && <Text>Coupon applied: {coupon}</Text>}
      </Container>
    </Body>
  </Html>
);

PlanReceiptProbeEmail.PreviewProps = {
  name: 'Alan',
  plan: 'free',
} satisfies PlanReceiptProbeEmailProps;

export default PlanReceiptProbeEmail;
