# Research: can every sandbox send go through one dedicated SES tenant?

Ticket: [Silthus/posthog#226](https://github.com/Silthus/posthog/issues/226), part of map [#225](https://github.com/Silthus/posthog/issues/225).
Code links point at `master` commit `e7ba672`.
AWS facts come from the SES Developer Guide (DG) and the SES API v2 Reference (API).

## Answer

**Use Option A: one shared tenant for the sandbox sender.**
Associate the sandbox identity and the sandbox configuration set with that one tenant, and with no team tenant.
SES supports it with no per-team provisioning, and the code only needs a few targeted changes.
Per-team attribution in our own pipeline stays intact, because it keys on the tracking code and the team ID, not on the tenant.
What we give up is a per-team pause by AWS for sandbox traffic. The sandbox caps and our own per-team metrics cover that.

Option B works on paper, but it scales provisioning with the team count, leans on limits AWS does not document, and breaks code that lists every tenant of an identity.
It also buys little: AWS opens a reputation finding only after a minimum representative volume, which per-team sandbox traffic rarely reaches.

## SES mechanics

| Fact | Source |
| --- | --- |
| A tenant groups identities, configuration sets and templates. SES tracks reputation and enforces policy per tenant. | [DG: Tenants](https://docs.aws.amazon.com/ses/latest/dg/tenants.html) |
| `SendEmail` with `TenantName` succeeds only if every referenced resource (identity, configuration set, template) is associated with the tenant. | [API: SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html#SES-SendEmail-request-TenantName) |
| A tenant send must use a configuration set associated with that tenant. A tenant needs at least one verified identity and one configuration set before it can send. | [DG: Tenants, Limitations](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#limitations) |
| "A single resource can be associated with multiple tenants." This applies to identities and configuration sets. | [API: CreateTenantResourceAssociation](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_CreateTenantResourceAssociation.html) |
| SES refuses to delete an identity or configuration set that a tenant still references. | [DG: Assigning resources](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#assigning-resources-to-tenant) |
| Default quota: 10,000 tenants per Region, adjustable. Automatic approval goes up to 300,000 for qualifying accounts. | [DG: Limitations](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#limitations), [SES endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/ses.html) |
| AWS does not document a limit on associations per tenant or on tenants per resource. | Not found on any primary page |
| Non-send SES API actions are throttled at one request per second. The quota page uses v1 wording, so whether it covers the tenant APIs is unconfirmed. The tenant APIs document `TooManyRequestsException`. | [DG: Quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html#quotas-api) |
| Tenants cost extra per tenant per month. The pricing page lists $0.005 per tenant per month, with a footnote of 1,000 tenants included per account and Region. | [DG: Pricing](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#pricing), [SES pricing](https://aws.amazon.com/ses/pricing/) |
| Reputation policies: Standard (the default) pauses on high-impact findings, Strict pauses on any finding, None never pauses. A paused tenant fails every send. | [DG: Tenants](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#how-tenant-management-works) |
| Some findings need a minimum representative volume before they trigger. Metrics roll over 24 hours to 7 days. | [DG: Limitations](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#limitations) |
| The combined sending of all tenants still affects the account reputation. | [DG: Trust & Safety](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#integration-with-aws-trust-safety) |
| EventBridge events (`Sending Status Enabled/Disabled`, `Advisor Recommendation Status Open/Resolved`) carry the tenant ARN `.../tenant/{tenant-name}/{tenant-id}` in `resources[]`. | [DG: EventBridge](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#setting-up-eventbridge-notifications) |
| The reputation entity type is always `RESOURCE`, and a tenant is addressed by its ARN. | [API: ReputationEntity](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_ReputationEntity.html) |
| By default all tenants share the account suppression list. A tenant can opt into its own list with `SuppressionScope = TENANT`. | [DG: Tenant-level suppression](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list-tenant-level.html) |
| The general event schema has no tenant field. SES adds a `ses:tenant-name` tag to bounce and complaint notifications. `EmailTags` are independent of `TenantName`. | [DG: Event data](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html), [DG: Tenant-level suppression](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list-tenant-level.html#sending-email-suppression-list-tenant-level-identifying-bounces), [API: SendEmail](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html#SES-SendEmail-request-EmailTags) |
| VDM and CloudWatch can break metrics down by tenant (`TENANT_NAME`, `TenantName`). | [API: BatchGetMetricDataQuery](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_BatchGetMetricDataQuery.html), [DG: CloudWatch](https://docs.aws.amazon.com/ses/latest/dg/tenants.html#cloud-watch-metrics) |

The docs do not confirm the following, so test them in a non-production account:

- Which exception `SendEmail` returns for an unassociated resource or a paused tenant.
- Whether SES also checks the feedback-forwarding identity against the tenant, beyond the From identity.

## How the code uses tenants today

- **Send path.** Every SES send sets `TenantName = team-<teamId>` unconditionally, test sends included ([email.service.ts#L1085](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L1085)).
  - The configuration set comes from global worker config (`posthog-messaging` or the untracked set) ([email.service.ts#L882](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L882), [config.ts#L345](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/config.ts#L345)).
  - `FeedbackForwardingEmailAddress` is the From address ([email.service.ts#L1072](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L1072)).
- **Provisioning.**
  - `create_email_domain` creates `team-<id>` and associates the identity plus every set in `SES_TENANT_CONFIGURATION_SETS` with it ([providers/ses.py#L444](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/providers/ses.py#L444), [settings/ses.py#L26](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/posthog/settings/ses.py#L26)).
  - `migrate_ses_tenants` does the same for every email integration with `provider = ses` ([migrate_ses_tenants.py#L38](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/posthog/management/commands/migrate_ses_tenants.py#L38)).
  - The shared configuration sets are therefore already associated with every team tenant. That is the "one resource, many tenants" pattern, in production today.
- **Verification.** A domain counts as verified only when `team-<id>` is among the identity's tenants ([providers/ses.py#L655](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/providers/ses.py#L655)).
- **Reputation.**
  - `get_tenant_reputation(team_id)` reads `team-<id>` ([providers/ses.py#L315](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/providers/ses.py#L315)).
  - The EventBridge→SNS webhook extracts the team ID with the regex `\bteam-(\d+)\b`. It logs `ses_tenant_events_webhook_no_tenant` and drops any event it cannot match ([ses_tenant_events.py#L28](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/services/ses_tenant_events.py#L28)).
  - The sync mirrors the state into `TeamWorkflowsConfig.ses_tenant_*` ([ses_tenant_state.py#L61](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/services/ses_tenant_state.py#L61)).
  - The daily reconcile sweeps every team with an SES email integration ([tasks/ses_tenant_state.py#L32](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/tasks/ses_tenant_state.py#L32)).
- **Send gate.** The Node worker blocks a team's sends when its mirrored tenant status is `DISABLED` ([team-workflows-config.service.ts](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/managers/team-workflows-config.service.ts), called at [email.service.ts#L404](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L404)).
- **Tier.**
  - The tier reads the team's mirrored tenant state ([email_sending_tier.py#L82](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/services/email_sending_tier.py#L82)).
  - It also reads per-team app metrics `email_sent`, hard bounces and complaints ([email_sending_tier.py#L325](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/services/email_sending_tier.py#L325)).
- **Attribution of delivery events.**
  - SES events map back to a team through the tracking code (a MIME header plus the `ph_id` tag) and the hog function or flow ID, not through the tenant or the domain.
  - Suppression records and checks are per team ([email-tracking.service.ts#L506](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email-tracking.service.ts#L506), [email.service.ts#L485](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L485)).

## Option A: one shared sandbox tenant

**What stays per team.**
Suppression, app metrics (`email_sent`, bounces, complaints), the per-workflow auto-pause, the tier's internal rates, the staff kill switch and the per-team caps all key on `teamId` or the tracking code.
None of them reads the tenant, so they keep working for sandbox sends unchanged.

**What changes.**
AWS judges all sandbox traffic as one tenant.
A finding on that tenant pauses the sandbox sender for every team, and it never pauses a team's own-sender tenant.
AWS-side breakdowns (VDM, CloudWatch) show only the sandbox aggregate. The per-team view comes from our own app metrics.

**Code that assumes `team-<id>` or one integration per domain per team, and must change:**

1. **Send path.** Derive `TenantName` from the integration: the sandbox tenant name (a new setting) for the sandbox integration, `team-<id>` otherwise. The sandbox configuration set is chosen the same way.
   - Do not add the sandbox configuration set to `SES_TENANT_CONFIGURATION_SETS`. That list is associated with every team tenant.
2. **Webhook and state.** Events for the sandbox tenant do not match `team-(\d+)` and are dropped.
   - Add a branch that syncs one platform-level sandbox state.
   - Add a Node gate that turns a paused sandbox tenant into a clear skip message, the same way `getEmailSendingSuspension` does for a team. Without the gate, every sandbox send fails at SES with a raw error.
3. **Integration lifecycle.** The sandbox integration cannot use `EmailIntegration.create_native_integration`.
   - That method raises once a second organization adds the same domain ([email.py#L46](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/posthog/models/integration/email.py#L46)).
   - It calls `create_email_domain`, which would associate the shared identity with `team-<id>`, which is Option B by accident.
   - It needs a marker, such as its own `config.provider` value or a flag. The checks that match `provider = ses` or the domain must skip it:
     - `migrate_ses_tenants`, which would associate the identity with every team tenant.
     - `reconcile_ses_tenant_states`.
     - `verify()` / `verify_email_domain`, which would report `pending` because `team-<id>` is not associated.
     - The `post_delete` cleanup ([email.py#L172](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/posthog/models/integration/email.py#L172) → [integrations.py#L118](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/posthog/tasks/integrations.py#L118) → `delete_identity`, which removes every tenant association and then deletes the identity once no integration references the domain).
4. **Sender address.** `resolveFromEmailAddress` accepts any address on the integration's domain ([email.service.ts#L929](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/nodejs/src/cdp/services/messaging/email.service.ts#L929)). On a shared domain the sandbox sender must use a fixed address instead.
5. **Sending health (ISP breakdown).** `_isp_domains` lists every verified email integration's domain and withholds a domain that teams the caller cannot see also use ([hog_flow.py#L2242](https://github.com/Silthus/posthog/blob/e7ba67287e2314194800f9ba6a4d9e169c8a00c9/products/workflows/backend/presentation/views/hog_flow.py#L2242)).
   - The sandbox domain would always show as withheld, so exclude it there.
6. **Tier history.** Sandbox sends emit `email_sent` like any other send, so they count toward the tier's sending history.
   - The spec has to decide whether they should, and if not, emit them under a separate metric name or filter them out.
7. **Account suppression list (optional).** By default a hard bounce on a sandbox send lands on the account list shared by every tenant.
   - Setting `SuppressionScope = TENANT` on the sandbox tenant keeps those entries in the sandbox tenant.

**Provisioning cost.** One tenant, two associations (the identity and the configuration set), and one reputation policy.
This is a one-time infrastructure step with no change to tenant quota or tenant cost.

## Option B: the shared identity on every team tenant

**What it reuses.** Sends keep `TenantName = team-<id>`. The webhook, the reputation tab, the Node gate and the tier read sandbox reputation per team with no change.

**What it costs:**

- **Tenant count.** A tenant for every team that uses the sandbox, not only teams that verified a domain.
  - That count grows with sign-ups against a default quota of 10,000 per Region (adjustable to 300,000 with automatic approval).
  - Each tenant costs extra per month.
- **Associations.** Two per team: the identity and the sandbox configuration set.
  - Every new team triggers write calls throttled at roughly one per second.
  - AWS does not document a cap on how many tenants one identity may join.
- **Code that walks every tenant of the identity.**
  - `create_email_domain` lists every tenant of the identity for its foreign-tenant guard.
  - `delete_identity` deletes the associations one by one.
  - With the sandbox identity on every team tenant, both become unbounded loops. The guard's meaning ("this domain belongs to another organization") also no longer holds for that identity.
  - Team deletion has to remove the team's association, or associations pile up.
- **Mixed reputation.** Sandbox and own-sender traffic share the team tenant, so one team's sandbox findings can pause its later own-domain sending.
- **Little gain.** Per-team sandbox volume is usually below the representative volume that AWS needs for a finding, so the per-team AWS pause rarely fires.

## Not affected by the choice

Mailbox providers judge reputation by domain and IP, not by SES tenant.
Under both options, every team's sandbox mail builds the reputation of one shared sandbox subdomain.
Tenants isolate only AWS-side enforcement.
