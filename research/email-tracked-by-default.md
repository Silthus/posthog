# Email from code: what “tracked on your users automatically” requires

## Answer

**The unconditional claim is not true today.** A send can be attributed to the recipient's email address rather than the application's user ID. Workflow metrics exist independently of person events, whose capture defaults off. Transactional messages track opens and clicks by default, but their generated workflow does not enable UTM tagging. A tracked click does not identify a new landing browser.

The smallest honest promise is: **“Send with the same user ID you use in PostHog, and see supported email engagement events alongside that user's product events, once engagement capture is enabled.”** This assumes the application already instruments product activity. Automatic cross-device landing identity, universal open detection and a replay of the email itself are not part of that promise.

This is research, not an implementation or a compliance determination. Recommendations below are proposals for the spec, not decisions already made by Michael.

## Sources and scope

Read on 2026-10-21. Product code was not changed and no services were started.

- **M**: fetched `upstream/master`, [`4803ff80061a128fd8c559b4b4c400325d58f8a2`](https://github.com/PostHog/posthog/tree/4803ff80061a128fd8c559b4b4c400325d58f8a2).
- **S**: fetched `origin/spec/code-managed-templates`, [`d746c355e2674b231051271f6a03ef377dcc162c`](https://github.com/Silthus/posthog/tree/d746c355e2674b231051271f6a03ef377dcc162c).
- **J**: supplementary browser SDK evidence from fetched `PostHog/posthog-js` `upstream/main`, [`3421250fdf3ab952879b359164cbd1cccfa63107`](https://github.com/PostHog/posthog-js/tree/3421250fdf3ab952879b359164cbd1cccfa63107).
- **N**: draft posthog-node email SDK, `origin/feat/node-emails-send`, [`87e9e95ca650a1294d348d9d5023d0772f268782`](https://github.com/Silthus/posthog-js/tree/87e9e95ca650a1294d348d9d5023d0772f268782). This is draft evidence, not a released SDK contract.

Every `M`, `S`, `J` or `N` citation below means `file:line` at that immutable snapshot. For example, `git show 4803ff80061a128fd8c559b4b4c400325d58f8a2:products/messaging/backend/services/transactional_email.py | nl -ba` reproduces an M citation. Source reading and existing test cases are evidence here; no tests were run and no live delivery or provider configuration was verified.

The route difference matters:

| Snapshot | Public send route                                                                                  | Identity and execution                                                                                                                                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M        | `POST /api/projects/{id}/messaging_templates/{uuid}/send/`                                         | Optional `identifiers.distinct_id`; one transactional workflow per template. `products/messaging/backend/presentation/views/message_templates.py:282-305,599-646`; `products/messaging/backend/services/transactional_email.py:196-211`.                                                                                                                                    |
| S        | Also `POST /api/projects/{id}/messaging/send/email/`, selecting `template: {key, hash?}` or `{id}` | Uses the shared serializer and send service, retaining the same email fallback. `products/messaging/backend/routes.py:24`; `products/messaging/backend/presentation/views/messaging_send.py:27-51,119-178`; `products/messaging/backend/presentation/views/transactional_email_api.py:35-58,217-240`; `products/messaging/backend/services/transactional_email.py:187-202`. |

Neither pinned snapshot implements grilling's rendered `body` contract. The body-send gaps below therefore describe work to carry into that route, not existing behavior.

## Who the email belongs to

### Current behavior

- M's serializer permits an absent, null or blank `distinct_id`. The service sets `payload.distinct_id = distinct_id or to`. An email address is a **distinct ID**, not a lookup of the person whose `email` property matches. The API does not retrieve that person's properties. Evidence: M `products/messaging/backend/presentation/views/message_templates.py:282-305`; `products/messaging/backend/services/transactional_email.py:203-209`.
- CDP puts that value into the synthetic `$transactional_email` trigger and queues a workflow. That trigger is workflow input, not itself a product analytics capture. Evidence: M `nodejs/src/cdp/cdp-api.ts:1168-1189,1195-1217`.
- When a supported engagement event is captured, it uses that distinct ID. Person ingestion looks up a person by team and distinct ID, creating one if needed. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:721-743`; `nodejs/src/ingestion/common/persons/person-property-service.ts:46-69`.

**If the app later identifies the user by its own ID, the mail history does not automatically follow.** Suppose mail is captured under `recipient@example.com`, while the browser has anonymous ID `browser-a` and calls `identify('app-user')`. The browser links `browser-a` to `app-user`, not the email address. Ingestion merges only the IDs named in an identify/alias operation; it does not match an `email` property. The result is normally separate identities, not a person being automatically split. If capture was off, the send need not have created an email-address person in the first place. Evidence: J `packages/browser/src/posthog-core.ts:3333-3368`; M `nodejs/src/ingestion/common/persons/person-merge-service.ts:110-150`; `nodejs/src/ingestion/common/persons/person-property-service.ts:46-69`.

A merge is possible when the two IDs are already mapped together or an explicit, valid identify/alias names them. It is not unconditional: identity protections can refuse merges involving already identified people. Reusing email as the app's canonical distinct ID also works, but that is an application identity choice, not something sending infers. Evidence: M `nodejs/src/ingestion/common/persons/person-merge-service.ts:110-150`.

### SDK recommendation

**Require a nonblank `distinctId` for the new body-send contract if it carries the automatic-person promise.** Send `identifiers.distinct_id` with exactly the same stable recipient ID as the app's existing capture/identify calls. Keep the existing optional REST/draft behavior for compatibility, but describe an omitted ID as email-only attribution, not automatic correlation.

Do not infer it from `to`, a person's email property, or the last user handled by a shared server client. A server client sends for many recipients, including background jobs. A trusted request-local recipient context could supply it later, but only through an explicit integration. The migration skill should reuse the application's existing ID expression or flag the call site for a person to finish, not manufacture an alias.

Today's draft does less: `distinctId?: string`, serialized only when supplied, with no email-to-person resolution. Evidence: N `packages/node/src/emails.ts:32-42,384-390`.

## Engagement events: collection is not capture

### Defaults and who controls them

The model declares an opt-in `default=False`; the worker also returns false when no config row exists. **There is an onboarding exception:** admins see engagement capture preselected on, and continuing the sending-rules step saves that selection. Storage/runtime default-off must not be confused with the onboarding choice. Evidence: M `products/workflows/backend/models/team_workflows_config.py:12-14`; `nodejs/src/cdp/services/managers/team-workflows-config.service.ts:29-42,65-71`; `products/workflows/frontend/setupGuide/wizard/workflowsOnboardingWizardLogic.ts:442-456,626-640`.

An effective project admin or higher can enable it in **Settings → Workflows → Engagement events**, through the email-step enable banner, or during onboarding. The API supports `PATCH /api/environments/{id}/` with `{"workflows_config":{"capture_workflows_engagement_events":true}}`; API credentials also need `project:write`. The backend admin check remains authoritative even where a switch is shown to a member. Evidence: M `frontend/src/scenes/settings/SettingsMap.tsx:1812-1824`; `products/workflows/frontend/Workflows/hogflows/steps/components/HogFlowFunctionConfiguration.tsx:323-358`; `posthog/api/team/team_config.py:154,159-174`; `posthog/api/team/settings_validation.py:209-225`; `posthog/api/team/viewsets.py:138-153`; `products/workflows/backend/test/test_team_workflows_config.py:38-65`.

### Which signals become person events

| Signal                                 | Captured event                                              |
| -------------------------------------- | ----------------------------------------------------------- |
| Send succeeds / fails                  | `$workflows_email_sent` / `$workflows_email_failed`         |
| Provider delivery                      | `$workflows_email_delivered`                                |
| Provider open / click                  | `$workflows_email_opened` / `$workflows_email_link_clicked` |
| Bounce / blocked, including complaints | `$workflows_email_bounced` / `$workflows_email_blocked`     |

These are an explicit allowlist, not every internal metric. Normal send completion and provider callbacks check both recipient identity and the engagement setting; editor test sends are excluded. Workflow metrics are recorded independently before the capture gate. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:691-743`; `nodejs/src/cdp/services/messaging/email-tracking.service.ts:89-100,309-342`; `nodejs/src/cdp/services/messaging/helpers/ses.ts:177-188,728-780`.

The send event carries workflow/action ID, destination, subject and tracking-enabled state. Callback events carry workflow/action ID, optional workflow version, destination and subject; clicks add URL/index, and bounces or complaints add their classification. The current payloads do not contain the proposed per-message `$email_message_id`. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:721-743`; `nodejs/src/cdp/services/messaging/email-tracking.service.ts:330-340`; `nodejs/src/cdp/services/messaging/helpers/ses.ts:730-780`.

A separate limit on “everything”: preference-page unsubscribe and tracking-consent events use the recipient's **email address** as distinct ID, not the send's canonical app ID. Requiring `distinctId` on sends alone does not fix that path. These signals are outside the core transactional-send promise; include an explicit identity-mapping follow-up if the launch promise includes them. Evidence: M `products/messaging/backend/presentation/views/recipient_preferences.py:34-73,85-102`.

### Why opt-in, and what enabling it costs

**Proven:** the introduction explicitly described opt-in capture alongside existing metrics and warned that captured events count toward normal event usage. That is present in the original model/settings and still in today's settings copy. **Inference:** keeping it off avoids surprise analytics volume, cost and event-stream noise. Neither the inspected code nor introduction establishes those as the author's complete motivation, or establishes consent as the reason for default-off. Historical evidence: commit `e001466cc9af0f009ea4835c92301ebb8efa2ed8`, `products/workflows/backend/models/team_workflows_config.py:14-16`, `frontend/src/scenes/settings/SettingsMap.tsx:1241-1245`; current M `frontend/src/scenes/settings/SettingsMap.tsx:1822`.

These captured events follow ordinary Product Analytics billing: `$workflows_email_*` is not on the nonbillable-event list, so the usage resolver returns `events`. The internal capture transport is not a billing exemption. That is separate from workflow/email execution usage, which counts the email's `billable_invocation` metric rather than its opens and clicks. Evidence: M `nodejs/src/ingestion/common/usage-records/billable-events.ts:13-41`; `nodejs/src/common/services/internal-capture.ts:31-62`; `nodejs/src/cdp/services/hogflows/billing-utils.ts:8-25`; `posthog/tasks/usage_report.py:2451-2466`.

On-by-default code capture therefore adds normal analytics usage for supported send outcomes and subsequent engagement callbacks, at the project's applicable plan. It is not a fixed charge per email: callbacks and repeated engagement determine volume. Existing workflow metrics and send billing do not disappear. A project-wide flip also changes existing marketing/broadcast event streams and can affect downstream insights or event-driven behavior; current callbacks consult the setting when they arrive, not a send-time snapshot. Evidence for scope and timing: M `nodejs/src/cdp/services/managers/team-workflows-config.service.ts:65-71`; `nodejs/src/cdp/services/messaging/email.service.ts:721-743`; `nodejs/src/cdp/services/messaging/email-tracking.service.ts:328-342`.

**Recommendation:** do not silently flip the project-wide switch from the SDK. Either keep the explicit admin opt-in and qualify the promise, or design an authorized code-send-specific default, disclose normal analytics usage and preserve an opt-out. That policy must survive queueing and callbacks; changing only the send handler would leave delivery/open/click capture gated off. Price changes or a new billing exemption are separate product decisions, not prerequisites hidden in this research.

## Opens, clicks, consent and UTMs

### Independent controls

There are separate decisions: emit customer events, track opens/clicks, enforce recipient tracking consent, and append UTMs. Enabling one does not enable the others. Evidence: M `products/workflows/backend/models/team_workflows_config.py:12-20`; `nodejs/src/cdp/services/messaging/email.service.ts:612-637,721-743,898-943`.

| Email step / team mode                                                                 | Open and click tracking decision                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `tracking_enabled: false`, any category                                                | Off at message level. This wins before the category check.               |
| Transactional; step tracking absent or true; consent mode `off`, `opt_in` or `opt_out` | On. The transactional category returns before recipient-consent lookup.  |
| Marketing; consent mode `off`                                                          | On unless disabled at message level.                                     |
| Marketing; `opt_in`                                                                    | On only for explicitly opted-in recipients.                              |
| Marketing; `opt_out`                                                                   | On unless a recipient opted out. Consent lookup errors choose untracked. |

Evidence for the table: M `nodejs/src/cdp/services/messaging/email.service.ts:898-943`; existing cases in `nodejs/src/cdp/services/messaging/email.service.test.ts:1675-1737`.

The generated transactional workflow sets `message_category_type: 'transactional'` and omits `tracking_enabled`, so tracking is on even when the team's marketing consent mode is on. Neither public send serializer exposes a per-send tracking override. Evidence: M `products/workflows/backend/services/transactional_email_workflows.py:34-82`; `products/messaging/backend/presentation/views/message_templates.py:294-305`; S `products/messaging/backend/presentation/views/messaging_send.py:50-51` and `transactional_email_api.py:47-58` in the same directory.

This describes what the code does. Its transactional-category exemption is **not** proof that all tracking in any transactional message is lawful. A product promise must preserve a way to send untracked and must not silently treat marketing content as transactional.

### Production versus local tracking

Production SES is the source of opens and clicks. PostHog prepares links for SES attribution and carries the recipient ID in the callback correlation header. The local maildev path uses PostHog's redirect/pixel handlers instead. Production's handlers deliberately do not emit a second open/click event. Evidence: M `nodejs/src/cdp/services/messaging/email-tracking.service.ts:146-210,557-589`; `nodejs/src/cdp/services/messaging/email.service.ts:1077-1158`; `nodejs/src/cdp/services/messaging/helpers/ses.ts:700-780`.

Person-linked provider callbacks require the configured provider event destination to return the original tracking header. The short fallback tag does not carry the distinct ID. A local test therefore cannot prove production person attribution. Verify the production callback path and both tracked/untracked provider configurations before making the claim. The message-level off decision needs the matching untracked provider configuration to guarantee provider-level tracking is off. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:1087-1096,1135-1158,946-967`; `nodejs/src/cdp/services/messaging/helpers/ses.ts:700-715`.

HTML links can opt out individually with `clicktracking="off"` or `data-ph-no-track`; SES preparation translates those to its no-track marker. Opening an HTML email is not guaranteed to produce a signal, and a link callback is not proof of a human product session. Plain-text messages have no HTML open pixel or HTML UTM rewrite. Evidence for implementation boundaries: M `nodejs/src/cdp/services/messaging/email-tracking.service.ts:178-208,557-589`; `nodejs/src/cdp/services/messaging/email.service.ts:1098-1132`; `nodejs/src/cdp/services/messaging/helpers/utm.ts:141-166`.

### UTM defaults

**Fresh transactional sends have no automatic UTMs.** Their generated action does not set `utm_tags_enabled`, while the worker requires it to be exactly true. Action configuration reaches the worker as metadata without an injected UTM default. Evidence: M `products/workflows/backend/services/transactional_email_workflows.py:34-82`; `nodejs/src/cdp/services/hogflows/hogflow-functions.service.ts:35-62`; `nodejs/src/cdp/services/messaging/email.service.ts:612-637`. The S graph has the same relevant configuration.

If enabled on the step, the defaults are:

| Parameter      | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| `utm_source`   | `posthog`                                                  |
| `utm_medium`   | `email`                                                    |
| `utm_campaign` | Workflow name, falling back to the synthetic function name |
| `utm_content`  | Email action name, or empty (then not added)               |

Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:620-635`.

The helper only adds missing, nonempty parameters to absolute HTTP(S) HTML anchor URLs. It preserves supplied UTM values and skips the configured PostHog host, unresolved Liquid URLs, non-HTTP(S)/relative links and anchors with `data-ph-no-utm`. There is no default `utm_term`. It does not rewrite text bodies. Evidence: M `nodejs/src/cdp/services/messaging/helpers/utm.ts:6-13,68-96,117-166`.

UTMs are independent of open/click consent: the worker adds them even when tracking is off, if UTM tagging is on. An existing test explicitly checks that combination. They label a campaign, not a person. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:612-637`; `nodejs/src/cdp/services/messaging/email.service.test.ts:1568-1596`.

## From the click to product activity

**No general automatic identity transfer exists in the pinned path.** In production, PostHog does not put `distinct_id` in public pixel/redirect codes. SES links retain the real destination for provider rewriting. PostHog's own redirect simply redirects to `target`; it neither sets an application cookie nor bootstraps the destination SDK. Evidence: M `nodejs/src/cdp/services/messaging/email-tracking.service.ts:146-161,186-205,574-589`.

Consequences:

- A browser already identified to the same app ID can naturally produce product activity on the same person, subject to its existing consent and SDK setup.
- A new browser starts with its own identity. A later normal login/identify can link its anonymous activity to the app ID, if the email used that same app ID. That is existing app instrumentation doing the work.
- UTMs can automatically supply campaign properties when posthog-js runs with campaign capture enabled. They do not join a browser identity to the email recipient. Evidence: J `packages/browser/src/posthog-core.ts:323,1825-1841,3333-3368`; `packages/browser/src/posthog-persistence.ts:1643-1659`.

### What a stronger bridge would require

The smallest safe first release is **not** to transfer identity through a mail link. Require the send's canonical app ID, reuse the application's existing identify/bootstrap and scope the claim accordingly. Browser bootstrap is already available, but the application has to supply its trusted identity; it is not an email-click resolver. Evidence: J `packages/browser/src/posthog-core.ts:1001-1055`.

If anonymous landing correlation is a launch requirement, it is a separate cross-repository contract: an explicit, destination-scoped opaque click reference, server-side validation/resolution, consent-aware posthog-js support before attribution-sensitive capture, and cleanup so the reference is not propagated. Signing raw IDs provides integrity, not confidentiality. Do not put raw email addresses or canonical user IDs in links. Do not automatically identify or alias a browser as the recipient simply because someone opened a forwarded link. Preserve an already authenticated identity and keep campaign/click attribution separate from authentication.

This is a design boundary, not a proposed protocol or security analysis. Exact authorization, expiry, forwarding and consent behavior needs a separate design review. If it remains out of scope, say “email activity alongside product activity for identified users,” not “every landing session wired up with no app work.”

## Where the person sees it

- **Person timeline:** yes, when captured under that person's mapped ID and within the chosen date range. The Events tab uses a general `EventsQuery` filtered by person ID, with no email-event exclusion. Its initial window is only the last day. Evidence: M `products/persons/frontend/logics/personsLogic.tsx:72-87`; `products/persons/frontend/pages/PersonScene.tsx:382-413`.
- **Funnels and insights:** yes, as standard events. The engagement setting explicitly advertises these uses. A person-based email-to-product funnel does not require a browser session ID, but it does require the two event streams to resolve to the same person. Evidence: M `frontend/src/scenes/settings/SettingsMap.tsx:1822`; `products/workflows/frontend/Workflows/hogflows/steps/components/HogFlowFunctionConfiguration.tsx:338-341`.
- **Replay:** sending or opening email creates neither a browser recording nor a session. Send and provider-event payloads lack `$session_id` and `$window_id`; replay event filtering requires a nonempty matching session ID. **Player exception:** alongside an existing recording, the player loads sessionless, non-web events for the same person within the recording's time window plus a short margin. An email event can therefore appear there by person/time association, without being linked to that browser session. Evidence: M `nodejs/src/cdp/services/messaging/email.service.ts:727-743`; `nodejs/src/cdp/services/messaging/email-tracking.service.ts:330-340`; `posthog/session_recordings/queries/sub_queries/events_subquery.py:89-90,869-879`; `frontend/src/scenes/session-recordings/player/sessionEventsDataLogic.ts:181-234`.

For “email events next to product activity,” the missing pieces are capture and consistent identity, not a new timeline or funnel engine. A product recording still needs the existing replay SDK/consent setup. Rich per-email debugging also needs the planned message ID and message-content/status linkage; do not fabricate a browser session ID for an asynchronous provider event.

## Smallest gaps in the agreed PR order

The following is an overlay on [Grill Resend parity](https://github.com/Silthus/posthog/issues/525), not a reorder or a new hidden-workflow design. Its resolution puts attribution, body route, skill v0, SDK PR 1, idempotency, then skill v1/Wizard first. Later status and preview work must not be prerequisites for basic person-linked engagement.

| Existing slice                                             | Smallest tracking addition / boundary                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send attribution on the current route                      | Keep operator/product-usage telemetry separate from recipient analytics. The `transactional email api send` event is not a recipient's `$workflows_email_sent`. Do not use it to claim that an email appears on a customer person.                                                                                                                                                                                         |
| Body route                                                 | Preserve the caller's canonical `distinct_id` through Django, CDP and the fixed email slot. Decide a code-send-specific engagement-capture policy without switching all existing workflows on. Carry that policy with the send so delayed provider callbacks use it too. Preserve tracking/UTM settings during template sync and allow explicit tracking-off.                                                              |
| Skill v0                                                   | Inspect the app's existing identify/capture ID and reuse it in REST sends. Explain the engagement toggle and analytics-usage implications; obtain the project's authorized choice rather than silently changing a project-wide setting. Verify callback attribution, not just inbox delivery.                                                                                                                              |
| posthog-node PR 1                                          | Require a canonical `distinctId` for the promised body-send mode; serialize it unchanged. Make any compatibility email-only fallback explicit. Reuse the worker's tracking and UTM helpers for rendered bodies; do not invent SDK tracking URLs or duplicate capture. Propose UTM-on for new code templates only, with stable key-based campaign defaults and overrides/opt-out, rather than rewriting existing templates. |
| Idempotency                                                | A replayed request must not create another send or duplicate the accepted-send correlation. Do not make analytics availability a stronger delivery acknowledgement than the queue contract.                                                                                                                                                                                                                                |
| Skill v1 and Wizard                                        | Migrate IDs along with sends. An unmappable ID or an uninstrumented destination is a reported hand-off, not a fabricated automatic join. Demonstrate send → supported engagement → existing identified product event on one person.                                                                                                                                                                                        |
| Checks / attachments, then sender limits                   | Preserve the accepted recipient identity and tracking choice; these features are not a reason to loosen consent or alter identity.                                                                                                                                                                                                                                                                                         |
| Status record / `emails.get(id)`                           | Add the planned `$email_message_id` correlation consistently to send/failure and provider events. Keep operational status independent of optional customer event capture. A status record does not itself make a replay or identify a browser.                                                                                                                                                                             |
| posthog-node PR 2 / preview upload                         | Keep preview renders out of customer engagement; do not reset a template's tracking choices on upload.                                                                                                                                                                                                                                                                                                                     |
| Separate follow-up only if the broader promise is retained | The privacy-reviewed browser click bridge. Without it, constrain the launch claim to existing identified product activity.                                                                                                                                                                                                                                                                                                 |

The irreducible gap set is **canonical recipient identity; an explicit scoped engagement policy; safe tracking/UTM defaults on the body path; and honest landing/replay boundaries**. Consistent per-message IDs complete the debugging story in the already-planned status slice. No new timeline or funnel engine is needed.

## What the architecture prototype must include

[Shape the architecture of Resend parity](https://github.com/Silthus/posthog/issues/526) must show more than SDK → send route → worker → provider:

- **Identity contract:** application user ID → `distinctId` → `identifiers.distinct_id` → invocation event → sent and callback engagement. Recipient address and person ID are different concepts. The fallback is an explicit weaker mode.
- **Independent policies:** event capture, message tracking, recipient consent and UTMs. A project-wide default change affects marketing and broadcasts too; code-send defaults need their own scope and callback propagation. Template upload/sync must not erase the choices.
- **Separate outputs:** operational workflow metrics/status, recipient analytics events and PostHog's own API-usage attribution. They are not interchangeable acknowledgements or billing streams.
- **Production callback prerequisites:** the recipient correlation survives the provider round trip; local redirect/pixel tests do not prove that.
- **Person → product boundary:** already identified browser / existing application identify is the first-release route. Add posthog-js and a click-attribution contract only if new-browser automatic linking is actually in scope. No implicit alias from a forwarded link.
- **Visibility and correlation:** timeline and person funnels consume standard events; email content is a message asset; replay needs a real recorded browser session. Attach the planned message ID to each relevant signal rather than fabricating a browser session for an asynchronous event.
- **Evidence plan:** absent/explicit ID, existing/new browser, engagement off/on, tracked/untracked transactional body, consent modes, preserved UTM/opt-out links, callback identity, and idempotent retry. Source-level tests prove policy; a synthetic end-to-end provider send must prove the production-shaped path without customer material.

The latest visible architecture round already adds a send-policy seam, `EmailSendCommand` and an idempotent enqueue seam before feature slices, and describes a ClickHouse status reader. This report does not revert that status-store decision or resolve the prototype's open choices. Put these tracking fields and boundaries into those seams. Evidence: the resolution of [Grill Resend parity](https://github.com/Silthus/posthog/issues/525) and the “Architecture round 2” comment on [Shape the architecture of Resend parity](https://github.com/Silthus/posthog/issues/526).

## References

- [Research ticket: email tracked on the person by default](https://github.com/Silthus/posthog/issues/532).
- [Workflow engagement events documentation](https://posthog.com/docs/workflows/engagement-events). Documentation was checked through the PostHog docs tool; pinned implementation is authoritative for this report.
- [Grill Resend parity](https://github.com/Silthus/posthog/issues/525).
- [Shape the architecture of Resend parity](https://github.com/Silthus/posthog/issues/526).
