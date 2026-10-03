# Workflows pricing and packaging: what would lift the growth ceilings?

Research for [#217](https://github.com/Silthus/posthog/issues/217), part of the Workflows growth map [#210](https://github.com/Silthus/posthog/issues/210).

**Scope.** Recommendations only. This document changes no prices.
**Evidence.** The code at `cf416e95b7c` (origin/master on 2026-10-03) and public pricing pages, fetched on 2026-10-03.
Every claim names its source.
Statements marked **(guess)** are judgment, not evidence.
No usage or revenue data was used. Real usage data arrives after 2026-11-02 and should re-check every guess here.

## Summary

PostHog meters Workflows in three different units for the same email, has prices for only two of its four channels, and sets sending caps without any link to the plan a team pays for.
Competitors either price on contacts with unlimited or generous sends (Loops, Customer.io, Resend marketing) or price per recipient at a lower rate than PostHog's entry tiers (Resend transactional).
The recommendations, in rough order of expected effect on activation (guess):

1. Let a paying team start above the lowest sending tier.
2. Show the sending allowance at the moment it limits someone, not only on the Reputation tab.
3. When a quota runs out, block only the channel that ran out, and say so with an upgrade path.
4. Count one email the same way everywhere: per delivered recipient, for billing, the cap and the UI meter.
5. Charge only for sends the provider accepted.
6. Give SMS and push a decided price and quota, and make the quota check match the bill.
7. Review the entry price per email against Resend and Customer.io, and lead with "no per-contact pricing".
8. Consider a larger free allowance paid for by a "Sent with PostHog" footer.
9. Consider bring-your-own sending as a paid packaging lever for Customer.io switchers.

## 1. How Workflows is metered today

### Billing units

| Channel                    | Usage key reported                                        | Public price                                       | Quota check before a run                                                                            |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Email                      | `workflow_emails_sent`                                    | Yes, "Emails" product                              | `workflow_emails`                                                                                   |
| Webhook / destination step | `workflow_billable_invocations`                           | Yes, "Destinations" add-on                         | `workflow_destinations_dispatched`                                                                  |
| Push                       | `workflow_push_sent`, and also counted under destinations | No push product; billed as a destination "for now" | `workflow_destinations_dispatched` (the `workflow_push` quota resource exists but no run checks it) |
| SMS                        | `workflow_sms_sent`                                       | No SMS product                                     | None                                                                                                |

Sources:

- The send step reports one billable record per executed, not-skipped step, keyed by channel: `nodejs/src/cdp/services/hogflows/actions/hog_function.ts` (`WORKFLOW_USAGE_KEYS`, and the block under "Add billable_invocation metric only if the function actually executed").
- The usage report sums `app_metrics2` rows: `posthog/tasks/usage_report.py`, `get_teams_with_workflow_emails_sent_in_period`, `..._push_sent_...`, `..._sms_sent_...`, and `get_teams_with_workflow_billable_invocations_in_period`, which counts `metric_kind IN ('fetch', 'push')`. So a push send lands in both the push total and the destinations total.
- Quota resources: `ee/billing/quota_limiting.py` (`QuotaResource.WORKFLOW_EMAILS`, `WORKFLOW_PUSH`, `WORKFLOW_DESTINATIONS`; there is no SMS resource).
- The pre-run quota check: `nodejs/src/cdp/services/hogflows/hogflow-quota-limiting.ts`. It checks only `workflow_emails` and `workflow_destinations_dispatched`, with the comment "Push sends bill as destinations for now". `function_sms` is not checked against any quota.
- Billing usage views list only "Workflow emails" and "Workflow destinations": `ee/billing/billing_types.py`, `frontend/src/scenes/billing/constants.ts`.
- SMS goes out through the team's own Twilio account (`nodejs/src/cdp/templates/_destinations/twilio/twilio.template.ts` reads `twilio_account.account_sid` from an integration), so the carrier cost sits with the customer.

### Public prices

From PostHog's public product catalog, the data behind `posthog.com/pricing` (`https://billing.posthog.com/api/products-v2?plan=standard`, product `workflows_emails`):

| Product               | Free per month    | Paid tiers (per unit, graduated)                                                                        |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| Emails                | 10,000 emails     | $0.003 to 50k, $0.0018 to 100k, $0.001 to 1M, $0.0005 to 10M, $0.000375 to 100M, then $0.00025          |
| Destinations (add-on) | 10,000 dispatches | $0.00075 to 50k, $0.00045 to 100k, $0.000225 to 1M, $0.00015 to 10M, $0.000075 to 100M, then $0.0000375 |

The free and paid plans list the same single feature (`workflows_emails`). Nothing in the catalog differs by plan except the price.

Worked examples, assuming the tiers bill graduated as listed:
50k emails a month costs about $120, 100k about $210, 1M about $1,110.

### Three counts for one email

| Who counts         | Unit                                         | Source                                                                                                                                  |
| ------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Billing            | One per send step, however many recipients   | `hog_function.ts`, `recordId` is `flow:<run>:<step>:<channel>`                                                                          |
| Sending cap        | One per recipient: 1 + cc + bcc              | `nodejs/src/cdp/services/messaging/email.service.ts`, comment "Charged per recipient, not per send: SES counts every to/cc/bcc address" |
| UI allowance meter | One per `email_sent` metric, so one per send | `products/workflows/backend/presentation/views/hog_flow.py`, `_team_email_sends_since`                                                  |

So a step with cc or bcc recipients reaches its cap sooner than the Reputation tab meter shows, and bills less than the cap counts.

### What the code suggests about failed sends (inference, not tested)

Only skipped steps escape billing: opt-outs, predicted hard bounces and paused email set `skipped`.
A send that ends in a provider error sets `result.error` and is not skipped, and for email `deliveredToRecipient` stays unset.
Reading `hog_function.ts`, such a step seems to produce a billable record.
That would include sends that fail because the sender domain is not verified, which [#211](https://github.com/Silthus/posthog/issues/211) found is a common first-run failure.
A test confirming this is a cheap next step.

### Quota blocks stop the whole workflow

`checkHogFlowQuotaLimits` blocks a run when the flow contains any email step and the email quota is spent, even if this run would only reach a webhook step.
The only trace is a `quota_limited` app metric (`hogflow-quota-limiting.ts`). Quick win [#224](https://github.com/Silthus/posthog/issues/224) covers telling the team.

## 2. Sending tiers and the plan

### How the cap works

- Eight tiers with default daily caps of 100, 1,000, 3,000, 10k, 30k, 100k, 300k and 1M emails, hourly caps from 50 to 200k, and batch audience caps equal to the daily caps: `posthog/settings/web.py` (`WORKFLOWS_EMAIL_TIER_*`), mirrored in `email.service.ts`.
- A team with no config row starts at tier 0: `products/workflows/backend/utils/email_sending_tiers.py`, `_resolve_team_email_sending_tier`.
- Promotion needs clean complaint and bounce rates, a minimum number of days at the current tier, and real use of the current cap on separate days: `products/workflows/backend/services/email_sending_tier.py`, `decide_tier` and `highest_qualifying_tier`. With the default minimum days per tier (3, 3, 3, 5, 5, 7, 7), the top tier is at least about five weeks away for a new team.
- Enforcement has a rollout mode (`off`, `shadow`, `enforce`) read from an environment setting. Which mode production runs is not visible in the code.

### Does the tier follow the plan?

No. Nothing in the tier resolution, the decision, or the sweep reads the billing plan, a card on file, or spend.
The only override is a staff allowlist of team IDs (`HOGFLOW_BATCH_TRIGGER_ELEVATED_TEAM_IDS`).

Two consequences follow from the defaults:

- At tier 0, a team can send at most about 3,000 emails in its first month at 100 a day, below the 10,000 free emails the price list includes.
- A team that adds a card and expects to send a real list gets the same 100-a-day start as an anonymous free team.

### Is the tier shown?

Partly. The Reputation tab shows "Tier N of M", sends in the last hour and day against the caps, and the batch audience limit (`products/workflows/frontend/Workflows/Reputation/WorkflowsReputation.tsx`).
Teams get an email and an in-app notice on a rate-driven demotion and a notice on promotion, only while enforcement is on (`products/workflows/backend/services/email_sending_tier_notifications.py`).
Nothing shows the tier where it limits someone: when a batch audience exceeds the cap, or in the workflow editor.

## 3. How competitors price and package the same job

|                          | PostHog Workflows                          | Customer.io                                                            | Loops                                                                             | Resend                                                        |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Priced on                | Emails sent, destination dispatches        | Profiles (people and objects), with message limits per plan            | Subscribed contacts                                                               | Transactional: emails sent. Marketing: contacts               |
| Free offer               | 10k emails and 10k dispatches a month      | Trial; startups under $10M raised get a year free                      | 1,000 newest contacts, 4,000 sends per rolling 30 days, "Powered by Loops" footer | 3,000 emails a month, 100 a day; marketing 1,000 contacts     |
| Entry paid price         | $0.003 per email from 10k to 50k           | Not listed on the page                                                 | Not listed on the page                                                            | Pro $20 for 50k emails, $35 for 100k; overage $0.90 per 1,000 |
| Included volume          | None beyond the free allowance             | Essentials: 5k profiles, 1M emails a month; extra 1,000 emails $0.12   | Unlimited sends on paid plans; transactional included                             | Per plan, up to 2.5M on listed Scale tiers                    |
| cc and bcc               | One send billed; cap counts each recipient | Not stated                                                             | Not stated                                                                        | Each To, CC and BCC recipient counts as a separate email      |
| New-account sending gate | Tier 0 at 100 a day, warmup over weeks     | Outbound sending blocked until a manual account review                 | Free plan 10 emails a second; paid 1,000 a second, uncapped volume                | Free 100 a day; paid plans have no daily quota                |
| Push, SMS                | Push billed as a destination, SMS unpriced | Push and in-app "Unlimited" on Essentials; SMS row with no price shown | Email only                                                                        | Email only                                                    |
| Feature gating           | None by plan                               | Premium and Enterprise add object types, support, HIPAA                | None: "All features included" on free                                             | Dedicated IP $30 a month on Scale                             |

Sources: [customer.io/pricing](https://customer.io/pricing), [loops.so/pricing](https://loops.so/pricing), [resend.com/pricing](https://resend.com/pricing), [Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits), PostHog catalog as above.
The Customer.io page renders as a flattened table, so some per-plan values could not be tied to a column; the table above uses only values the page states plainly.

What stands out:

- **Per-email price.** PostHog's first paid tier, $3 per 1,000, is about three times Resend's overage rate and well above what Customer.io charges past its included million. At 100k emails a month PostHog lists about $210 against $35 at Resend Pro.
- **Contacts are free at PostHog.** Every competitor that runs lifecycle or marketing email prices on contacts or profiles. PostHog charges nothing for the person list, which favors teams with large lists and low send frequency.
- **Paid means trusted elsewhere.** Resend lifts its daily quota on any paid plan. Customer.io gates outbound sending on a manual review, not a warmup ramp. PostHog's tier ignores payment.
- **Free tiers buy distribution.** Loops gives its free tier away in exchange for a branded footer.

## 4. Recommendations

Each one is a recommendation for billing and leadership. None is implemented by this map.

### R1. Let a paying team start above tier 0 (guess: tier 1 or 2)

**Why.** Tier 0 caps a new team below its own free allowance and treats a team with a card on file like an anonymous one. Teams switching from Customer.io arrive with a real list and hit 100 a day on day one.
Resend lifts its daily quota on any paid plan, and Customer.io uses a one-time review instead of a ramp.
Keep every reputation-driven demotion as it is, so a paid start only changes where the ramp begins.
**Trade-off.** The shared sending pool's reputation carries the risk. The starting tier and whether to add a manual review path for larger starts are deliverability calls, not pricing calls.

### R2. Show the sending allowance where it limits someone

**Why.** The Reputation tab already shows "Tier N of M" and the caps. A team meets the cap elsewhere: when it picks a batch audience larger than the tier allows, or when a workflow slows down.
Showing the allowance and the next step ("send steadily for N more days" or "add a card to start higher" if R1 lands) at those points turns a silent ceiling into a path.
This is mostly product work and could ship as a quick win.

### R3. When a quota runs out, block only that channel, and offer the upgrade

**Why.** Today a spent email quota stops every run of a flow that contains an email step, including runs that only reach a webhook. The team sees nothing, per #211 and #224.
Blocking per step keeps the rest of the automation alive, and a visible "quota reached, raise your billing limit" message is the upgrade moment.

### R4. Count one email the same way everywhere: per delivered recipient

**Why.** Billing counts per send step, the cap counts per recipient, and the meter counts per send. Resend and SES count each To, CC and BCC address.
One unit makes the cap, the meter and the bill agree, so a team can predict both its limit and its invoice.
**Trade-off.** Per-recipient billing raises the bill for steps with cc or bcc. Few lifecycle emails use them (guess), so the effect should be small.

### R5. Charge only for sends the provider accepted

**Why.** Reading the code, a send step that errors seems to bill, including sends that fail on an unverified domain. Charging for a send that never left is a poor first experience for exactly the teams the map wants to activate.
Confirm with a test first; if it holds, bill on `email_sent`, not on step execution.

### R6. Decide a price and a quota for SMS and push, and make the check match the bill

**Why.** SMS has a usage key but no price, no quota resource and no billing view. Push has its own key and quota resource, yet bills and is limited as a destination.
A team cannot see or plan these costs, and billing cannot package them.
A simple option (guess): price SMS and push as destination dispatches, since the carrier cost sits with the customer's own Twilio account or push credentials, and remove the unused keys. Customer.io lists push and in-app as unlimited on its entry plan, which argues against a premium push price.

### R7. Review the entry price per email, and lead with "no per-contact pricing"

**Why.** The $3 per 1,000 entry tier is the price a growing startup meets first, and it reads expensive next to Resend's $20 for 50k.
Options (guess, needs real usage data after 2026-11-02): lower the 10k to 100k tiers, or sell prepaid email blocks.
At the same time, PostHog is the only one of the four that does not charge for contacts. The pricing page and the Customer.io switching story should say so plainly, with a worked comparison for a large list.

### R8. Consider a larger free allowance paid for by a "Sent with PostHog" footer

**Why.** Loops funds its free tier with a "Powered by Loops" footer. The map already lists the footer as a candidate bet.
Tying a larger free allowance to the footer, removable on any paid plan, gives a growth loop and a reason to upgrade in one move.
**Trade-off.** A footer on transactional mail may put off engineering-led teams (guess). Test on lifecycle email first.

### R9. Consider bring-your-own sending as a paid lever for switchers

**Why.** The shared pool is the reason tiers exist. A team that brings its own SES or SMTP provider carries its own reputation, so it could skip the shared-pool ramp and pay a per-dispatch platform fee instead of the per-email price.
This targets Customer.io switchers, the map's second audience, and #211 found no bring-your-own sending today.
**Trade-off.** It is a large engineering bet and fits a separate map, not a pricing change alone.

## Open questions for real data (after 2026-11-02)

- How many teams reach tier 0's daily cap in their first week, and how many of those had a card on file.
- How often a quota block stops a run that would only have sent a webhook.
- How many billed email steps ended in a provider error.
- How many sends use cc or bcc.

Answers belong in the private note, not in this public file.

## Security note

One aspect of the metering mismatch has a security angle. Security note, ask Michael.
