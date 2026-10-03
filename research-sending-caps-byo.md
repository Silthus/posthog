# Sending caps, warmup and bring-your-own sending in Workflows

Research for [#214](https://github.com/Silthus/posthog/issues/214), part of the Workflows growth map [#210](https://github.com/Silthus/posthog/issues/210).

**Question.** How do sending caps, warmup and the lack of bring-your-own sending affect a team's first real sends, and what would bring-your-own sending take?

**Evidence.** The code on `master` at the time of writing (paths below are repo-relative), and the public docs of Customer.io, Loops and Resend.
No usage data. Statements marked **guess** are reasoning, not evidence.

## Short answer

- Every team that sends workflow email starts at **tier 0: 100 emails a day, 50 an hour, and a batch audience of 100**. It climbs one tier at a time, at most once a day, after it holds a tier for 3 to 7 days and actually sends at least half of the tier's daily cap on 2 days. The fastest climb to the top tier takes about 5 weeks.
- The caps only apply when the rollout mode is `enforce`. The code default is `off` on both the Django and the Node side. The production value lives in deployment config outside this repo, so this note does not state it.
- **The first delivered message is rarely blocked.** A welcome or onboarding workflow fits under 100 a day (**guess** for an early-stage team). Sends over the cap are delayed, never dropped.
- **The first broadcast is where caps bite.** A broadcast or batch-triggered workflow with an email step and an audience over 100 cannot launch at tier 0. The only advice is "Add filters to narrow it". A team that wants to announce something to its existing users hits this on day one.
- **Customer.io switchers are hit hardest.** With a list in the tens of thousands, a single send to the whole list needs tier 4 or 5, which takes 2 to 3 weeks of real, growing sends. There is no request path, no ramp, and no way to bring an existing provider.
- **No bring-your-own sending exists.** All workflow email goes through one PostHog SES account. Customer.io lets you send through any SMTP server. Loops and Resend do not, but Resend is itself the provider.
- **Ranked options:** make caps visible (S), a "request a higher limit" path on existing staff controls (S), ramp large batches over days instead of rejecting them (M), protect transactional sends from marketing bursts (S to M), bring-your-own SMTP (M), bring-your-own SES through a cross-account role (L).

## 1. Current rules

### The table

| Rule                                 | Value (code default)                                                                                                                                                                                                                                  | Applies to                                                                                                                                  | When it is on                                                                           | What the user sees when a send hits it                                                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tier daily cap                       | 100 / 1k / 3k / 10k / 30k / 100k / 300k / 1M for tiers 0 to 7                                                                                                                                                                                         | All workflow and broadcast **email** of a team, per recipient (to, cc and bcc each count). Not SMS, push or webhooks. Test sends bypass it. | Mode `enforce`                                                                          | The send is delayed, not dropped. One `info` line in that run's log: "This project reached its email sending limit of … Retrying this email in …s."                                                                                              |
| Tier hourly cap                      | 50 / 200 / 600 / 2k / 6k / 20k / 60k / 200k                                                                                                                                                                                                           | Same                                                                                                                                        | Same                                                                                    | Same log line, naming the hourly cap                                                                                                                                                                                                             |
| Batch audience cap                   | Same as the daily cap per tier                                                                                                                                                                                                                        | Broadcasts and batch-triggered workflows **that contain an email step**                                                                     | Same. In `off` or `shadow` the flat ceiling of 500k applies (1M for allowlisted teams). | The launch is refused. Broadcast: "This audience is above the project's batch limit of N. Add filters to narrow it, then launch again." Workflow manual trigger: the same, plus "The limit rises as the project builds a clean sending history." |
| Promotion (warmup)                   | One tier per daily sweep. Dwell of 3, 3, 3, 5, 5, 7, 7 days at tiers 0 to 6. Needs 2 days with sends of at least 50% of the current daily cap, and clean 30-day rates (complaints at most 0.1%, hard bounces at most 2%, with minimum-volume floors). | Unpinned teams                                                                                                                              | Tiers are computed in every mode. Promotion notifications only in `enforce`.            | In-app notification "Workflow email sending limit raised"                                                                                                                                                                                        |
| Demotion                             | One tier down on bad 7-day rates, a workflow auto-pause, or a HIGH AWS reputation impact. 7-day cooldown between rate demotions.                                                                                                                      | Unpinned teams                                                                                                                              | Same                                                                                    | Email to admins plus in-app notification "Workflow email sending limit lowered"                                                                                                                                                                  |
| Inactivity decay                     | One tier down per 30 days without sends                                                                                                                                                                                                               | Teams above tier 0                                                                                                                          | Same                                                                                    | Nothing. Decay is silent by design.                                                                                                                                                                                                              |
| Staff suspension or AWS tenant pause | All email stops, tier drops to 0                                                                                                                                                                                                                      | The team                                                                                                                                    | Always                                                                                  | Run log: "Skipping send: email sending is suspended for this project. Contact support…" or "…our email provider paused sending for this project. Check the Reputation tab…"                                                                      |
| Staff pin                            | A staff-chosen tier, skipped by the sweep                                                                                                                                                                                                             | Teams pinned in Django admin, plus a settings allowlist pinned at the top tier                                                              | Always                                                                                  | Nothing beyond the new allowance                                                                                                                                                                                                                 |
| Per-workflow rate limit              | User-chosen count per minute or hour                                                                                                                                                                                                                  | One workflow                                                                                                                                | When the user sets it                                                                   | Run log: "Sending rate limit reached…"                                                                                                                                                                                                           |

Sources:

- Tier tables, dwell days, promotion bar, rollout mode: `posthog/settings/web.py` (block starting "Trust-tiered per-team caps on workflow email"), mirrored in `nodejs/src/cdp/config.ts` (`EMAIL_TEAM_SENDING_CAP_*`, default mode `off`).
- Tier resolution and limits: `products/workflows/backend/utils/email_sending_tiers.py`.
- Batch audience cap, email-step-only rule: `products/workflows/backend/utils/batch_trigger_limit.py`, applied in `products/workflows/backend/services/blast_radius.py` and `products/workflows/backend/models/hog_flow_batch_job/hog_flow_batch_job.py`.
- Promotion, demotion, decay, sweep: `products/workflows/backend/services/email_sending_tier.py`. The sweep runs daily at 07:15 UTC (`posthog/tasks/scheduled.py`).
- Notifications: `products/workflows/backend/services/email_sending_tier_notifications.py`.
- Staff controls: `products/workflows/backend/services/email_sending_controls.py`.
- Send-time cap, log lines, per-recipient charging: `nodejs/src/cdp/services/messaging/email.service.ts` (`claimTeamSendingBudget` and the block before the provider switch).
- UI copy for the audience cap: `products/workflows/frontend/Broadcasts/broadcastWizardLogic.ts`, `products/workflows/frontend/Broadcasts/steps/BroadcastRecipientsStep.tsx`, `products/workflows/frontend/Workflows/hogflows/HogFlowManualTriggerButton.tsx`.
- Allowance card: `products/workflows/frontend/Workflows/Reputation/WorkflowsReputation.tsx` (`SendingAllowanceCard`, shown only when `enforced`).

### How fast a new team climbs

Derived from the defaults, assuming clean rates and that the team sends at least half its cap on 2 days at every tier.
The sweep runs once a day, so real times are a few days longer.

| To reach     | Daily cap and batch audience | Fastest, in days |
| ------------ | ---------------------------- | ---------------- |
| Tier 1       | 1,000                        | 3                |
| Tier 2       | 3,000                        | 6                |
| Tier 3       | 10,000                       | 9                |
| Tier 4       | 30,000                       | 14               |
| Tier 5       | 100,000                      | 19               |
| Tier 6       | 300,000                      | 26               |
| Tier 7 (top) | 1,000,000                    | 33               |

Two details shape this:

- **Volume must be used, not just allowed.** Leaving tier 2 needs 2 days of at least 1,500 sends, and leaving tier 4 needs 2 days of at least 15,000. A team that sends one newsletter a week never climbs, because it never uses the tier on 2 days.
- **The tier anchor for a team that never changed tier is the team's creation date.** So the first dwell is already met for an older PostHog project, and only the 2 active days count.

### What the caps protect

The settings comment states the reason: all workflow email shares one SES account, so one team's complaints hurt every team's deliverability.
Each team already has its own SES tenant (`TenantName = team-<id>` in the send call), and AWS can pause one tenant instead of the account.
The tiers sit on top of that, so an unproven team cannot send a large blast before complaint feedback arrives.

Security note: one aspect of how the caps are enforced is worth a private look. Ask Michael.

## 2. User-visible gaps

1. **A delayed send is close to invisible.** The only signal is an `info` line in each run's log. The workflow Metrics tab has no "delayed" count, nothing notifies the team the first time a cap delays a send, and the allowance card sits in the Reputation tab.
2. **A first broadcast over 100 people cannot launch at all.** The audience cap rejects the launch and tells the user to filter. It does not offer to send over several days, and it does not say how long until the limit rises.
3. **No way to ask for more.** Only staff can pin a tier, through Django admin. The product shows no "request a higher limit" action, and the allowance card only says the allowance "grows with a clean sending record".
4. **No progress toward the next tier.** The card shows "Tier N of 7" and usage against the cap, but not what the next promotion needs (days left, sends needed on how many days).
5. **Marketing and transactional email share one bucket.** The fast lane only orders the queue. Once a broadcast drains the bucket at a low tier, a password reset or receipt also waits for the refill. At tier 0 the daily bucket refills about one email every 14 minutes.
6. **A team that pauses loses its tier without notice.** Decay is silent, so a seasonal sender finds out at its next campaign.
7. **Earlier sending history does not count.** The tier only reads PostHog's own send metrics. A team that sent cleanly from the same domain for years through another provider starts at tier 0.
8. **No bring-your-own sending.** A team that has a warmed domain, dedicated IPs, or an SES or SendGrid contract cannot use it. For a Customer.io switcher this is likely a blocker on its own (**guess**, consistent with #211).

The quota block from billing is a separate gap, tracked as the quick win [#224](https://github.com/Silthus/posthog/issues/224). Gaps 1 and 2 overlap with it, so that thread should know about this note.

## 3. Competitors, for a new paying account

|                         | PostHog Workflows                                       | Customer.io                                                                                                     | Loops                                                                                | Resend                                                                                                 |
| ----------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Start limit             | 100 a day, 50 an hour                                   | 500 a day for new Essentials accounts                                                                           | No account cap documented. Plan limits only (free: 4,000 sends per rolling 30 days). | Free: 100 a day and 3,000 a month. Paid: no daily quota.                                               |
| Ramp                    | Automatic, 8 tiers, about 5 weeks to the top            | Automatic: 10,000 a day after about 2 weeks, plan standard after about 6 weeks                                  | Advisory: start with onboarding email, add recent users in batches                   | Advisory schedule (new domain: 150 on day 1 to 2,000 on day 7). Resend says it warms up automatically. |
| At the limit            | Delays the send. Rejects a batch audience over the cap. | Stops sending more messages. Rolling 24-hour window.                                                            | Loops rate-limits and batches large sends itself                                     | Free: `daily_quota_exceeded` error until midnight UTC                                                  |
| Ramping one big send    | No                                                      | "Daily ramp" on one-time sends, up to 60 days                                                                   | Advised by hand                                                                      | Advised by hand                                                                                        |
| Asking for more         | Not in product (staff pin only)                         | Support can review and adjust limits                                                                            | Not documented                                                                       | Upgrade the plan, or ask support for a higher API rate                                                 |
| Bring your own provider | No                                                      | Yes: any SMTP server, plus native integrations for Mailgun, Mailjet, Mandrill, Postmark, SendGrid and SparkPost | No. SMTP only goes into Loops.                                                       | Not applicable: Resend is the provider                                                                 |

What Customer.io's bring-your-own costs the customer, from its docs:

- Sends through a custom SMTP server do not count against the plan's email allotment.
- Customer.io still tracks opens and clicks and keeps a copy of each email.
- With generic SMTP, delivered, bounced and spam data do not appear in Customer.io. Only the native integrations feed them back, through the provider's webhooks.
- Customer.io "may be limited in the support" it can give for deliverability errors.
- Whether the new-account sending limit applies to custom SMTP sends is not stated (**guess**: it does not, because those sends do not use Customer.io's infrastructure).

Sources:

- Customer.io plan features and new-account limits: <https://docs.customer.io/accounts/billing/plan-features/>
- Customer.io domain warming and daily ramp: <https://docs.customer.io/messaging/channels/email/deliverability/domain-warming/>
- Customer.io custom SMTP: <https://docs.customer.io/messaging/channels/email/deliverability/custom-smtp/use-your-smtp-server/>, SendGrid: <https://docs.customer.io/messaging/channels/email/deliverability/custom-smtp/triggered-lifecycle-email-with-sendgrid/>
- Loops large audiences: <https://loops.so/docs/deliverability/sending-to-large-audience>, sending domain: <https://loops.so/docs/sending-domain>, SMTP: <https://loops.so/docs/smtp>
- Resend quotas: <https://resend.com/docs/knowledge-base/account-quotas-and-limits>, warm-up: <https://resend.com/docs/knowledge-base/warming-up>, rate limits: <https://resend.com/docs/api-reference/rate-limit>

## 4. What bring-your-own sending would take

### Today's send path

- An email sender is an `Integration` of kind `email`, with `config.provider` set to `ses`, or `maildev` in development (`posthog/models/integration/email.py`). Creating one registers the domain in PostHog's SES account and creates the team's SES tenant (`products/workflows/backend/providers/ses.py`, `create_email_domain`).
- The Node email worker has one SES client built from environment credentials and switches on `integration.config.provider` (`ses`, `maildev`, `unsupported`) in `EmailService.executeSendEmail`.
- Each send names a configuration set (tracked or untracked) and the team's tenant.
- Delivery, bounce, complaint, open and click events come back from SES through SNS to the worker's SES webhook (`nodejs/src/cdp/services/messaging/helpers/ses.ts`, `email-tracking.service.ts`).
- Those events feed everything downstream: the workflow metrics, the suppression list, the per-workflow auto-pause, the tier sweep and the Reputation tab.

### Seams that already exist

- **The provider switch** in the worker and in `EmailIntegration` is a natural place for a new provider value.
- **Own-domain tracking.** `EmailTrackingMode` already has a `redirect` mode that rewrites links through PostHog and adds a pixel. Today production relies on SES events, but the mode gives opens and clicks without SES.
- **Cross-account AWS roles.** The S3 and Redshift integrations already create credentials through `sts:AssumeRole` with an external ID (`posthog/models/integration/aws.py`). A customer SES account could use the same pattern.
- **Bring-your-own already exists for SMS.** The Twilio integration sends from the customer's own Twilio account (`products/workflows/backend/providers/twilio.py`).
- **The tiers key on the shared account.** A send that does not touch PostHog's SES account does not need the tier caps. The audience cap already skips non-email batches for the same reason.

### Three shapes, and what each costs

|                                                     | Generic SMTP                                                                              | Bring-your-own SES (cross-account role)                                                                           | Native provider APIs (SendGrid, Postmark, Mailgun, Resend) |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Send path                                           | New `smtp` provider: an SMTP transport with credentials in `sensitive_config`             | Per-integration SES client from assumed-role credentials, the customer's own configuration set, no PostHog tenant | One adapter per provider                                   |
| Domain setup                                        | The customer's provider owns DKIM and SPF. PostHog only checks the sender address.        | The customer verifies the domain in its own SES account                                                           | The provider owns it                                       |
| Opens and clicks                                    | Through the `redirect` tracking mode                                                      | SES events, if the customer routes its configuration set to PostHog                                               | Provider webhooks or `redirect`                            |
| Bounces and complaints                              | **None** unless a provider webhook is added                                               | SES events through an event destination the customer creates                                                      | Provider webhooks                                          |
| Suppression, auto-pause, tier sweep, Reputation tab | Lose their input. The suppression list only stays current from PostHog-side unsubscribes. | Keep working once events flow. The Reputation tab would need to read the customer's account.                      | Keep working per provider once webhooks are mapped         |
| Tier caps                                           | Skip them                                                                                 | Skip them                                                                                                         | Skip them                                                  |
| Effort (**guess**)                                  | M                                                                                         | L                                                                                                                 | L for the first provider, M for each after it              |

**What PostHog gives up in deliverability control.**
With generic SMTP, PostHog no longer sees whether mail was delivered, bounced or marked as spam. That is the same trade Customer.io documents.
In return, a large migrating list no longer touches the shared SES account at all. That lowers the risk the caps exist for, so bring-your-own also protects every other team.

**Decisions a bring-your-own map would face.**

- Whether bring-your-own sends count against the Workflows quota and price (Customer.io does not count them). This is a pricing recommendation for billing and leadership, not a decision this map makes.
- Which shape comes first: SMTP for reach, or SES for full feedback.
- Whether a bring-your-own sender can be mixed with PostHog-sent senders in one project, and how the UI shows which one sends.

## 5. Options, ranked by effort

Effort is a **guess** from the code. Impact is a **guess** until the activation funnel ([#220](https://github.com/Silthus/posthog/issues/220)) has data.

1. **Make caps visible (S).** Record a delay metric next to `email_sent` so the Metrics tab shows delayed sends. Notify the team the first time a cap delays a send. Show the allowance and what the next tier needs where a broadcast or batch launch happens, not only in the Reputation tab. Helps both audiences. Fits the quick win [#224](https://github.com/Silthus/posthog/issues/224) or a sibling.
2. **A "request a higher limit" path (S).** A button on the allowance card and on the audience-cap error that opens a support request with the team's domain and sending history. Staff already pin tiers through `set_email_sending_tier`. This is the Customer.io model ("support can review and adjust limits") and the cheapest unblock for switchers.
3. **Protect transactional sends (S to M).** Give the fast lane its own headroom in the team bucket, so a broadcast at a low tier cannot hold up password resets.
4. **Ramp a large batch instead of rejecting it (M).** Accept an audience above the batch cap and let the send-time buckets pace it over days, with the expected finish date shown before launch. The send-time cap already delays and never drops, so the main work is long-parked jobs and clear progress. This matches Customer.io's "Daily ramp".
5. **Bring-your-own SMTP (M).** Customer.io parity for switchers with an existing provider. Skip the tiers for these senders. Accept the missing bounce and complaint feedback, and add provider webhooks later.
6. **Bring-your-own SES through a cross-account role (L).** Full feedback and reuse of the existing event pipeline, at the cost of customer-side AWS setup. Worth it only if switchers ask for SES by name.

**Recommendation.**
For activation of teams without a lifecycle tool, options 1 and 2 are enough: their first delivered message fits under tier 0, and the first broadcast is the one moment that needs a clear message and a way out.
For Customer.io switchers, options 2 and 4 handle most of the cap pain, and option 5 is the growth bet that deserves its own map.
