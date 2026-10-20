# Sender-scoped project secret API keys

## Result

A `phs_` key cannot currently be restricted to particular email senders or domains. The smallest extension is a sender-integration allowlist on the key, enforced against the template's saved workflow sender and carried through to the email worker. A domain allowlist is almost the same implementation and better matches a promise expressed as “this key can never send from the production domain.” Neither needs a new authentication scheme.

Separate staging and production projects are useful isolation, but not a domain policy: projects in the same organization may verify the same sending domain. A members-only test mode is a different feature. To keep mail off the production domain, it must use the dedicated sandbox sender, not merely restrict recipients.

This is a research recommendation, not a product decision or implementation. The evidence and proposed contracts below separate current behavior from possible changes.

## Sources and snapshot

Read on October 20, 2026, after fetching `upstream/master` and the fork branch:

| Ref                                     | Repository                                                                                              | Commit                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| M: `upstream/master`                    | `PostHog/posthog`                                                                                       | `2099bfc9e6f83a10e0ed9a32df94c27efe516f07` |
| B: `origin/spec/code-managed-templates` | `Silthus/posthog`, proposed in [PostHog/posthog#118924](https://github.com/PostHog/posthog/pull/118924) | `d746c355e2674b231051271f6a03ef377dcc162c` |

Evidence links are commit-pinned. `file:line` ranges refer to M unless marked B. `origin/master` was not used as evidence. This is static source research: tests below were read, not run; no production configuration, AWS behavior, deployment, or deliverability was verified.

## 1. Keys today

### Model and lifecycle

`ProjectSecretAPIKey` is team-owned, not user-owned. Its fields are `id`, `team`, `label`, `mask_value`, unique nullable `secure_value`, `created_at`, nullable `created_by`, `last_used_at`, `last_rolled_at`, and nullable array `scopes`. `(team, label)` is unique. There is no sender, domain, resource-ID allowlist, or expiry field on this model. The model explicitly says its scopes are project-wide and do not honor per-object RBAC. Evidence: [`posthog/models/project_secret_api_key.py:14-62`][key-model] (identical in B).

The authenticator reads a `phs_` Bearer token, finds its SHA-256 hash, attaches the key to a synthetic user and the successful authenticator, and updates last-used at most hourly. This is not a real `User` and not the legacy `TeamSecretTokenAuthentication`, even though that legacy credential shares the prefix. Evidence: [`posthog/auth.py:426-439`][key-extract], [`posthog/auth.py:502-569`][key-auth].

Creation takes explicit scopes, rejects `*` and unassignable scope/action pairs, and checks the caller holds newly added scopes. It hashes and masks the generated value and returns plaintext only on creation/roll. Rolling changes the hash, mask and timestamp on the same row. Evidence: [`posthog/api/project_secret_api_key.py:112-241`][key-api]. Key management is a separate, management-permission-protected view, not a capability granted to a sending key: [`posthog/api/project_secret_api_key.py:284-307`][key-management].

### How send authorization works

The actual send scope in **both snapshots is `hog_flow:write`, not `email_send:write`**. The assignable PSAK scope list contains that pair. On M the template view permits PSAKs only on `send`; B permits `send` and `upload`, while B's new messaging view permits `send_email`. Evidence: [`posthog/scopes.py:247-278`][scopes], [M `message_templates.py:362-395`][master-view-auth], [B `message_templates.py:465-482`][branch-template-auth], [B `messaging_send.py:119-125`][branch-send-auth].

`TeamAndOrgViewSetMixin` adds `APIScopePermission`. It retains session, personal-key and OAuth authenticators in addition to the view's PSAK authenticator. The permission checks the action opt-in, exact key-team match, then required scopes. A wrong scope gets `API key missing required scope 'hog_flow:write'`; a different project gets a project-access denial. Evidence: [`posthog/api/routing.py:280-330`][routing-auth], [`posthog/permissions.py:879-924`][scope-check].

For user-backed requests, the send code requires editor access to the backing workflow. PSAKs deliberately skip that per-workflow check because their authority is the key's project-wide scope. Evidence: [B `transactional_email_api.py:182-229`][branch-shared-send]; M has the corresponding check in [`message_templates.py:499-516`][master-editor]. A sender restriction therefore has to be an explicit key policy, not an assumption that the creator's personal RBAC follows the key.

### Existing resource-scoping precedents

- **Personal API keys:** user-owned, with `scopes`, nullable integer-array `scoped_teams`, and nullable string-array `scoped_organizations`. Permission helpers treat null/empty tenant lists as unrestricted within the user's accessible tenants and enforce nonempty lists on requests. These are concrete resource-ID allowlists, but at tenant scope, not sender scope. Evidence: [`posthog/models/personal_api_key.py:34-51`][personal-model], [`posthog/permissions.py:798-830`][tenant-helpers], [`posthog/permissions.py:954-978`][tenant-enforcement].
- **OAuth credentials:** also carry `scoped_teams` and `scoped_organizations`; they use the same tenant enforcement. Evidence: [`posthog/models/oauth.py:584-596`][oauth-model], tenant helpers above.
- **Internal service JWTs:** the transactional send token is scoped to a team and one workflow. This is an existing individual-resource restriction, but an internal credential minted by Django, not a user-created API key or a sender policy. Evidence: [`posthog/plugins/plugin_server_api.py:267-282`][internal-send].

No sender-ID/domain restriction exists in the inspected PSAK model, send serializers, scope permission, or final native email service. This is a bounded finding, not a claim that PostHog has no other specialized tokens.

## 2. Senders today

### Storage and ownership

A native sender is an `Integration` with `kind="email"`. `resend` and `twilio` are other integration kinds, not the native SES sender or its domain registry. The integration has a team FK, external `integration_id`, JSON `config`, encrypted `sensitive_config`, metadata and errors; uniqueness is `(team, kind, integration_id)`. Evidence: [`posthog/models/integration/model.py:127-215`][integration-model].

Native creation lowercases the full address and stores it as `integration_id`. Its config contains `email`, `domain`, `mail_from_subdomain`, `reply_to`, `name`, `provider` (normally `ses`) and `verified`. There is no separate native sending-domain FK on this row. The sender's owner is the team; domain reuse is constrained at organization level by the creation service. Evidence: [`posthog/models/integration/email.py:31-86`][integration-create].

Verification asks SES for identity, DKIM, MAIL FROM and DMARC readiness and the team's tenant association. On success, it marks matching domain/provider integrations verified **within that team**, reloads workers, and sets a default if none exists. Evidence: [`products/workflows/backend/providers/ses.py:679-698`][ses-verification], [`posthog/models/integration/email.py:128-175`][integration-verify]. The default is the nullable plain integer `TeamWorkflowsConfig.default_email_integration_id`, not a domain or a key setting: [`products/workflows/backend/models/team_workflows_config.py:53-56`][default-config].

### How `from` is chosen

Neither send serializer accepts `from`. M's `POST /api/projects/{id}/messaging_templates/{uuid}/send/` accepts `to`, `identifiers` and `message_data`. B retains it and adds `POST /api/projects/{id}/messaging/send/email/`, adding a template reference `{key, hash?}` or `{id}`. Evidence: [M `message_templates.py:277-309`][master-send-schema], [B `routes.py:10-24`][branch-routes], [B `messaging_send.py:27-51,127-178`][branch-send].

The sender is an input in the backing workflow's email step, `from.integrationId`. Making a template transactional accepts optional `from_integration_id`; omitted means the project's verified default. The helper checks the integration belongs to this team, is `email`, and is verified. Later content synchronization retains the existing workflow sender, falling back to the default only if none remains. Evidence: [`products/workflows/backend/services/transactional_email_workflows.py:34-73,102-169`][workflow-sender] (B has the same behavior, with one extra comment after line 102); [`products/messaging/backend/services/transactional_email.py:147-173`][sync-sender].

At send time, Django finds the active linked workflow and sends CDP only the recipient, distinct ID and variables. There is no key or sender policy in that internal payload. Evidence: [`products/messaging/backend/services/transactional_email.py:176-227`][send-service], [`nodejs/src/cdp/services/hogflows/transactional-email.ts:5-11`][internal-schema].

The worker selects the integration, checks exact invocation-team ownership, checks `kind=email` and verified/configured state, then resolves the effective From address. A custom address on the **exact same verified domain** is allowed; invalid/off-domain overrides fall back to the integration's own address. A sender-integration restriction would consequently not be an exact mailbox restriction. Evidence: [`nodejs/src/cdp/services/messaging/email.service.ts:389-391,468-480`][worker-integration], [`email.service.ts:938-999`][worker-from]. The queue also supports `from.integrationIds` rotation; the selector chooses among those IDs. Evidence: [`nodejs/src/cdp/schema/cyclotron.ts:149-173`][email-schema], [`email-sender-selection.ts:8-19`][sender-selection].

### Code-managed templates in B

The upload schema has no sender field. A first upload creates a template and makes it transactional with `from_integration_id=None`, so the verified project default becomes its saved workflow sender. No default yields `sender_unavailable` and asks the caller to verify/set one. Later uploads update content and preserve the sender, including an adopted GUI template's alternate sender. Evidence: [B `message_templates.py:331-394`][branch-upload-schema], [B `template_uploads.py:71-134`][branch-upload], [B `test_template_upload.py:107-110,169-208`][branch-upload-tests].

The template stores the linked workflow UUID and code-management metadata, not its own sender column. The content hash is not a sender authorization token. Evidence: [B `models/message_template.py:16-71`][branch-template-model], [B `template_uploads.py:137-153`][branch-upload-hash]. Changing the default does not retarget existing linked workflows. A restriction must inspect the saved sender even when the request has no sender field.

## 3. Staging and production today

**Use separate projects for supported tenant separation, not a request environment label.** Normal creation makes a Project and passthrough Team with the same ID and organization. Team still has historical “environment” terminology and parent/project fields. However, the project-environments view rejects every request with “Multiple environments per project are no longer available.” Evidence: [`posthog/models/project.py:46-81`][project-model], [`posthog/models/team/team.py:272-277,312-332`][team-model], [`posthog/api/team/viewsets.py:608-619`][deprecated-environments].

Do not confuse this with feature-flag evaluation contexts named `production` or `staging`: those select which flags evaluate, not which email identities a key can use. Evidence: [`products/feature_flags/backend/models/evaluation_context.py:14-35`][evaluation-context]. Parent-team compatibility also remains in generic request scoping, which canonicalizes some data access to the parent. That is not evidence of a supported, independent staging email boundary. Any future nested-environment support needs an explicit sending-policy inheritance rule: [`posthog/api/routing.py:197-245`][canonical-team].

**Can two projects verify the same domain?** Yes, if they belong to the same organization. Native creation permits this and supplies all organization team IDs to SES; it rejects a domain already registered in another organization. SES provisioning permits friendly same-organization tenant associations and associates the requesting team's tenant. Each team's verification still checks its own association. Evidence: [`posthog/models/integration/email.py:44-65`][integration-create], [`products/workflows/backend/providers/ses.py:470-508`][ses-create]. Tests explicitly cover same-org reuse and different-org rejection: [`posthog/models/test/integration/test_email.py:33-71`][domain-tests].

**Can staging send from a production domain?** If its project has a verified sender on that domain, its sending key can use a transactional template linked to that sender. There is no staging/domain distinction in the checks above. What does stop a send is a different project's integration ID, missing/unverified sender, or the existing workflow/flag/quota/suspension/suppression guards, not the environment's name. Evidence: [worker ownership][worker-integration], [verification/From checks][worker-from], [API flag][master-flag], [CDP active-workflow/quota checks][cdp-send], [worker suspension/suppression][worker-guards].

Thus an operational arrangement today is a separate staging project with **only a separate staging domain verified** and its own credentials. It is not a durable prohibition against a future administrator adding the production domain in that same organization. “Never sends from production” must be a stated server-enforced policy; a key label or default sender alone cannot supply it.

## 4. Smallest design options

Everything in this section is proposed. Existing fields and enforcement points above are the starting evidence, not implemented behavior.

| Option                                       | Smallest model change                                                                                                                                                                                                           | Where enforcement belongs                                                                                                                                                                                    | Agent-visible refusal                                                                                                                                                                         | Key-creation UI                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Key restricted to sender integrations** | Nullable integer-ID array on `ProjectSecretAPIKey`, e.g. `allowed_email_sender_integration_ids`. `null` preserves unrestricted legacy keys; a supplied list grants only those IDs.                                              | Resolve the saved workflow sender in the shared send path; check all candidate IDs before enqueue. Persist trusted policy with the job and check the actual selected integration at the final email service. | HTTP 403 `sender_not_allowed`: template sender is not permitted by this key; ask a project admin to change the template's sender or issue the right restricted key.                           | Existing project-key modal, under email scope: “All verified senders” or “Selected senders”. Multi-select this project's verified native senders with address + domain, and show the restriction in the key list/reveal. |
| **B. Key restricted to domains**             | Nullable normalized string array on the key, e.g. `allowed_email_sender_domains`; no new Domain table needed for v1.                                                                                                            | Same path as A, checking the selected integration and final effective From domain, after normal verification and team checks.                                                                                | HTTP 403 `sender_domain_not_allowed`: resolved From domain is not permitted by this key; fix sender configuration or use a key approved for that domain.                                      | Same modal, group this project's verified native integrations into distinct domain choices. “All verified domains” or “Selected domains”. No arbitrary domain grants and no wildcards in v1.                             |
| **C. Project-wide sending allowlist**        | Nullable sender/domain allowlist on `TeamWorkflowsConfig`, not `Team`.                                                                                                                                                          | Final email service for **all** UI/API/workflow sends. Precheck the API for helpful synchronous errors; refresh policy through the existing team/config loading path.                                        | HTTP 403 `project_sender_not_allowed` for API prechecks; asynchronous workflow sends fail with the same reason before the provider call.                                                      | Key creation shows inherited project policy read-only. Edit the policy in Channels/Workflows settings under project management permissions. No new per-key input.                                                        |
| **D. Sandbox-only test key/mode**            | A key policy such as `email_sending_mode="sandbox_only"`, plus the managed sandbox integration/provider and membership/cap machinery specified in the sandbox map. Reuse that feature rather than invent a second trial sender. | Sender check as A/B; final service requires the sandbox sender and checks **every To/CC/BCC** against current verified organization membership before delivery.                                              | HTTP 403 `sandbox_sender_required` or `sandbox_recipient_not_allowed` on a precheck; final enforcement blocks/records refusal, never reroutes the recipient. Unknown membership state blocks. | “Sandbox only” when creating an email key. Explain verified organization members only and show the fixed sandbox sender. No automatic upgrade to live sending when a domain is verified.                                 |

### Trade-offs and recommendation

- **A reuses today's resource IDs and sender picker vocabulary.** It binds a key to specific sender configurations; deleting/recreating a sender needs an explicit regrant. It still permits other mailbox local-parts on that integration's domain because the worker already does. If “certain senders” means exact email addresses, A is insufficient without a separate effective-address restriction. Selecting a staging mailbox on the production domain is not domain isolation; use a distinct approved staging domain.
- **B best matches Resend's domain-scoped `sending_access`.** The [official create-key API](https://resend.com/docs/api-reference/api-keys/create-api-key) accepts `permission="sending_access"` and `domain_id` to limit sending to one domain. PostHog's domain is currently config rather than a first-class resource, so v1 can use canonical exact domain strings. Recreating a sender on an allowed domain stays permitted. Treat subdomains as distinct choices, with no suffix matching; define case/IDNA normalization once and share the contract across Python and Node.
- **C gives the stronger project-wide promise.** It also constrains sends made by a session or another key. It cannot distinguish a staging key from a production key inside one project. Use it when staging is a separate project and “even another credential must not send live mail” is the requirement.
- **D limits trial recipients, not production credentials.** Restricting recipients while retaining the production From still sends mail using the production domain. Use the dedicated PostHog-owned identity if the goal is to keep test traffic off that domain. The [sandbox sender map](https://github.com/Silthus/posthog/issues/225) specifies the owned sender, verified-member rule over To/CC/BCC, no rerouting and independent caps. That is a proposed/draft stack, not behavior assumed to exist in M or B. Existing worker `isTest` handling is not this contract: test sends still use the email provider, including its SES tenant ([`email.service.ts:1107-1120`][provider-test]).

For D, the existing membership source is `OrganizationMembership.organization` + `user`, with `User.email`, `is_email_verified` and `is_active`; invitations or matching an email domain are not verified membership. Reuse those records rather than creating a recipient allowlist that can drift ([membership][membership-model], [user state][user-verification]).

**Recommendation for the next smallest slice:** A, a key-to-integration allowlist, if the product promise is “this staging credential may use these selected senders.” Keep the existing `hog_flow:write` scope and add a restriction, not a generic RBAC framework. If Michael wants the public promise to name domains, choose B instead; the end-to-end enforcement work is largely shared. C is a complementary project guardrail, not a prerequisite. D remains the separate first-email experience.

Every key-level promise assumes staging actually uses the restricted credential. It cannot make a production key safe to deploy into staging. Likewise, API-send restriction alone is not a promise that the key cannot edit shared code-managed content. B allows uploads with `hog_flow:write`; decide and document whether sender restrictions constrain authoring as well as delivery. Do not advertise “send-only” while that scope also authorizes upload.

### Fail-closed semantics to settle before implementation

1. `null` means explicitly unrestricted for compatibility; `[]` means no allowed senders, never “all”. The UI can forbid saving a selected-senders mode with an empty list. Missing IDs after deletion remain denied; neither deletion nor rolling a key may convert a restricted key into an unrestricted one.
2. Validate grants against this key's exact team, `kind=email` and verified state. Do not expose sender details from other projects in errors. For A, mailbox overrides cannot broaden the selected integration; for B, evaluate the final resolved domain, not untrusted request strings.
3. A changed default must not silently broaden grants. An initial upload whose default is disallowed should return the same clear sender refusal, not pick another sender or create a partially usable template. Existing/adopted templates need the same check if authoring is restricted. Granting a new allowed sender is an admin action, not an agent retry strategy.
4. Define queued-send behavior when a key is edited, deleted or rolled. The smallest contract is an authorization snapshot at acceptance, preserved across retries. Immediate revocation of already accepted jobs needs an additional key-policy lookup/version check at delivery; do not imply that from a snapshot-only design.
5. Do not let `message_data`/Liquid variables supply the authorization policy. It is server-owned execution metadata. Unknown/malformed restricted-policy state fails closed. Ordinary legacy jobs need an explicit backward-compatible unrestricted representation; staged rollout must not lose policy on an older worker.

## 5. Enforcement and implementation seams

### Why a view-only check is too small

Django currently checks the template and active workflow, but CDP independently loads the workflow before queuing. Persisted workflow invocations are reloaded by function ID, and the email service can choose among configured sender IDs. A comparison with the current project default or a one-time workflow read in Django is not an end-to-end delivery guarantee. Evidence: [Django send payload][send-service], [`nodejs/src/cdp/cdp-api.ts:1142-1197`][cdp-send], [`hogflow-executor.service.ts:86-108`][invocation-state], [`cdp-cyclotron-worker-hogflow.consumer.ts:87-106`][reload-flow], [sender selection][sender-selection].

For A/B, preflight the resolved template sender for a synchronous 403, pass the restriction on the authenticated internal send, preserve it as non-templated persisted invocation metadata through the workflow-to-email handoff/retries, and enforce it next to the existing worker integration/From checks. Reject at CDP before enqueue too if its loaded graph is not authorized. A later state change can still produce a queued invocation that is denied by the worker; do not describe API acceptance as a guarantee of delivery.

### Files for A, the sender-integration option

| Area                          | Files to touch                                                                                                                                                                                                                                            | Constraint                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Key storage                   | `posthog/models/project_secret_api_key.py`; new additive migration under `posthog/migrations/`                                                                                                                                                            | Add nullable policy field; preserve existing rows. No sender FK that turns deletion into unrestricted null. No new fields on the hot Team table.                                                                                                                                                                                                                                     |
| Key CRUD                      | `posthog/api/project_secret_api_key.py`; its API tests                                                                                                                                                                                                    | Declare serializer field/help text, validate team/verified/native IDs, explicitly persist it in the hand-written `.create`, preserve on roll and omitted PATCH. Keep existing management permissions.                                                                                                                                                                                |
| Sender resolution             | `products/workflows/backend/services/transactional_email_workflows.py`; `products/workflows/backend/facade/contracts.py` and `api.py`                                                                                                                     | Expose effective workflow sender candidates through the product facade, not a direct cross-product model import. Cover directly edited graphs/rotation or reject unsupported graph shape clearly.                                                                                                                                                                                    |
| Shared API send               | `products/messaging/backend/services/transactional_email.py`; B `presentation/views/transactional_email_api.py`, `messaging_send.py`, `message_templates.py`; messaging facade API/contracts                                                              | Extract policy from the authenticated key, pass a typed policy to the shared service. Cover the UUID and key/id routes, including hash-warning paths. Add 403 mapping instead of collapsing refusal to 400 or 503.                                                                                                                                                                   |
| Upload, if included in policy | B `products/messaging/backend/services/template_uploads.py` and shared template save/sync paths                                                                                                                                                           | Check chosen default on first upload and preserved sender on later/adopted uploads; fail atomically. Authoring scope is a separate product decision, not automatically solved by a delivery guard.                                                                                                                                                                                   |
| Internal dispatch             | `posthog/plugins/plugin_server_api.py`; `nodejs/src/cdp/services/hogflows/transactional-email.ts`; `nodejs/src/cdp/cdp-api.ts`                                                                                                                            | Extend the trusted request schema/response mapping, keep per-call team/workflow JWT auth. Do not add a fleet-wide secret or public caller-supplied grant field.                                                                                                                                                                                                                      |
| Durable execution             | `nodejs/src/cdp/types.ts`; `schema/cyclotron.ts`; `services/hogflows/hogflow-executor.service.ts`; `services/hogflows/actions/hog_function.ts` and `hogflow-functions.service.ts`; `services/job-queue/job-queue-postgres-v2.ts` and `job-queue-kafka.ts` | Policy must survive dequeue, email-function invocation construction, reschedule, retry and rerun semantics. Storing it only on an in-memory `hogFlow` or in Liquid variables is insufficient. Persist within the serialized state/metadata contract, not an arbitrary top-level property that serializers discard ([queue evidence][queue-serialization], [handoff][email-handoff]). |
| Final send                    | `nodejs/src/cdp/services/messaging/email.service.ts`, `email-sender-selection.ts` and focused tests                                                                                                                                                       | Enforce after selecting the real integration and resolving From, before any provider request. Keep verification, tenant, suppression and quota guards. Never silently replace a denied sender.                                                                                                                                                                                       |
| Key UI                        | `frontend/src/scenes/settings/project/ProjectSecretAPIKeys.tsx`, `projectSecretAPIKeysLogic.tsx`, generated API types                                                                                                                                     | Add verified-sender selection, form defaults/submission/edit hydration, visible scope summary. Existing modal only has label/scopes: [UI lines 17-123][key-ui], [logic lines 292-334,404-411][key-ui-logic]. Reuse current LemonUI.                                                                                                                                                  |

### Auth, migrations, OpenAPI and MCP constraints

- **Keep scope and resource restriction separate.** Existing `hog_flow:write` plus PSAK action/team guards remain required. Adding a new dedicated send-only scope is a distinct API change requiring backend/frontend scope-list parity, compatibility for existing keys, and an upload permission decision. A sender allowlist does not require it. [Scope registry][scopes], [permission gate][scope-check].
- **Use the synthetic key identity.** Read the key from the successful authenticator; never require a real user's FK/role to enforce a service credential. Normal session/PAK/OAuth RBAC stays as-is. [Authenticator][key-auth], [shared send/editor check][branch-shared-send].
- **Migrate additively and roll out enforcement before exposing restricted keys.** Schema first, policy-carrying producer/consumer support next, then UI/creation enablement. An old consumer must not discard a restriction and send anyway. Follow the existing [safe migration guidance][migration-guide]; no speculative migration number, destructive replacement, Team-column addition or production backfill is needed for nullable key metadata.
- **OpenAPI is serializer-owned.** Regenerate with `.codex/with-flox hogli build:openapi` ([type pipeline][type-pipeline]); do not hand-edit generated TypeScript/Zod. Add the key fields and 403 error responses to schemas on both send routes. The B error envelope already supports `code`, `detail`, `attr`, `why`, `fix`, `docs_url`: [B `transactional_email_api.py:67-93`][branch-errors]. Use `attr=null` for a stored-sender policy failure because the caller did not submit `from`.
- **MCP is opt-in, not a reason to widen key management.** B's `products/workflows/mcp/email_templates.yaml:124-163` exposes upload and send through the corresponding OpenAPI operations ([source][mcp-tools]). Update tool descriptions and regenerate using the [repository's MCP pipeline][mcp-pipeline] if API shapes change. The key-creation UI can consume the new key serializer without adding a key-management MCP tool. A user-backed MCP call is governed by that user's credential, not by another PSAK's restriction. Only a project-wide policy supplies a common restriction across those credentials.
- **Agent repair must stay within authority.** Add a documented stable error anchor; distinguish invalid grant input (400), missing scope/wrong project (existing 403), sender policy refusal (new 403), and later worker refusal. Do not treat `sender_not_allowed` as `template_outdated`, and do not have an SDK upload/retry or automatically widen a key to repair it. Existing service maps non-202/non-429 CDP responses to unavailability, so policy refusals need a deliberate mapping change ([`transactional_email.py:216-225`][send-service]).

Proposed synchronous error, not a response currently implemented:

```json
{
  "type": "permission_denied",
  "code": "sender_not_allowed",
  "detail": "This key cannot send from the template's configured sender.",
  "attr": null,
  "why": "The project secret API key is restricted to selected email senders.",
  "fix": "Ask a project admin to select an allowed sender for this template or issue the right restricted key."
}
```

Add `docs_url` only once its matching documentation anchor exists. A server refusal should not echo an API key or another project's sender identity.

### Focused proof obligations for a future implementation

No product tests were added or run for this report. The implementation needs outside-in tests for:

- Correct-scope restricted key + allowed saved sender succeeds; disallowed sender is 403 and no invocation is queued, on both API routes.
- Missing/wrong scope and wrong project remain denied; user-backed RBAC and unrestricted legacy keys behave as before.
- First upload's default, adopted alternate sender, default changes, selected-sender deletion/recreation and rotation all obey the stated policy.
- Final worker checks deny an unauthorized selected sender even after an intervening workflow change; metadata survives queue roundtrip and retries. Allowed same-domain mailbox overrides and rejected off-domain overrides remain intentional.
- Key create/edit/roll retain restrictions; omitted PATCH does not clear them; `[]` cannot become “all”. Granting another team's/non-email/unverified IDs is rejected.
- For C, UI/workflow sends are also constrained. For D, any unverified/nonmember To/CC/BCC or unknown membership state blocks; test sends cannot bypass policy/caps; own-domain sender use is denied for sandbox-only keys.

## Decision for the next grilling round

Choose the promise before choosing the column: **selected sender configurations (A), selected exact domains (B), or a project-wide staging prohibition (C)**. A is the smallest extension of today's resource model; B is the closest Resend contract; C is needed if the promise must survive using a different credential in the staging project. Keep the members-only sandbox sender (D) separate unless the intended staging behavior is explicitly sandbox-only.

## References

- [Research ticket: sender-scoped keys](https://github.com/Silthus/posthog/issues/524)
- [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
- [Official project secret API key docs](https://posthog.com/docs/api/project-secret-api-keys), useful for the existing creation flow, with the pinned source authoritative for the scope/route details above.
- [Resend create API key](https://resend.com/docs/api-reference/api-keys/create-api-key), permission and domain restriction parameters, read October 20, 2026.
- [Map: first email before domain verification](https://github.com/Silthus/posthog/issues/225), design context, not evidence of a deployed sandbox feature.

[key-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/project_secret_api_key.py#L14-L62
[key-extract]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/auth.py#L426-L439
[key-auth]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/auth.py#L502-L569
[key-api]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/api/project_secret_api_key.py#L112-L241
[key-management]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/api/project_secret_api_key.py#L284-L307
[scopes]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/scopes.py#L247-L278
[master-view-auth]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/presentation/views/message_templates.py#L362-L395
[branch-template-auth]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/message_templates.py#L465-L482
[branch-send-auth]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/messaging_send.py#L119-L125
[routing-auth]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/api/routing.py#L280-L330
[scope-check]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/permissions.py#L879-L924
[branch-shared-send]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/transactional_email_api.py#L182-L240
[master-editor]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/presentation/views/message_templates.py#L499-L516
[personal-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/personal_api_key.py#L34-L51
[tenant-helpers]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/permissions.py#L798-L830
[tenant-enforcement]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/permissions.py#L954-L978
[oauth-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/oauth.py#L584-L596
[internal-send]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/plugins/plugin_server_api.py#L267-L282
[integration-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/integration/model.py#L127-L215
[integration-create]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/integration/email.py#L31-L86
[ses-verification]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/workflows/backend/providers/ses.py#L679-L698
[integration-verify]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/integration/email.py#L128-L175
[default-config]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/workflows/backend/models/team_workflows_config.py#L53-L56
[master-send-schema]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/presentation/views/message_templates.py#L277-L309
[branch-routes]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/routes.py#L10-L24
[branch-send]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/messaging_send.py#L27-L178
[workflow-sender]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/workflows/backend/services/transactional_email_workflows.py#L34-L169
[sync-sender]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/services/transactional_email.py#L147-L173
[send-service]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/services/transactional_email.py#L176-L227
[internal-schema]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/hogflows/transactional-email.ts#L5-L11
[worker-integration]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/messaging/email.service.ts#L389-L480
[worker-from]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/messaging/email.service.ts#L938-L999
[email-schema]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/schema/cyclotron.ts#L149-L173
[sender-selection]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/messaging/email-sender-selection.ts#L8-L19
[branch-upload-schema]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/message_templates.py#L331-L394
[branch-upload]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/services/template_uploads.py#L71-L134
[branch-upload-tests]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/tests/api/test_template_upload.py#L107-L208
[branch-template-model]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/models/message_template.py#L16-L71
[branch-upload-hash]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/services/template_uploads.py#L137-L153
[project-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/project.py#L46-L81
[team-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/team/team.py#L272-L332
[deprecated-environments]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/api/team/viewsets.py#L608-L619
[evaluation-context]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/feature_flags/backend/models/evaluation_context.py#L14-L35
[canonical-team]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/api/routing.py#L197-L245
[ses-create]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/workflows/backend/providers/ses.py#L470-L508
[domain-tests]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/test/integration/test_email.py#L33-L71
[master-flag]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/products/messaging/backend/presentation/views/message_templates.py#L644-L652
[cdp-send]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/cdp-api.ts#L1142-L1197
[worker-guards]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/messaging/email.service.ts#L398-L500
[provider-test]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/messaging/email.service.ts#L1107-L1120
[invocation-state]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/hogflows/hogflow-executor.service.ts#L86-L108
[reload-flow]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/consumers/cdp-cyclotron-worker-hogflow.consumer.ts#L87-L106
[key-ui]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/frontend/src/scenes/settings/project/ProjectSecretAPIKeys.tsx#L17-L123
[key-ui-logic]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/frontend/src/scenes/settings/project/projectSecretAPIKeysLogic.tsx#L292-L411
[migration-guide]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/docs/published/handbook/engineering/safe-django-migrations.md
[branch-errors]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/messaging/backend/presentation/views/transactional_email_api.py#L67-L93
[mcp-tools]: https://github.com/Silthus/posthog/blob/d746c355e2674b231051271f6a03ef377dcc162c/products/workflows/mcp/email_templates.yaml#L124-L163
[queue-serialization]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/job-queue/job-queue-postgres-v2.ts#L290-L363
[email-handoff]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/nodejs/src/cdp/services/hogflows/actions/hog_function.ts#L150-L213
[type-pipeline]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/docs/published/handbook/engineering/type-system.md#L35-L78
[mcp-pipeline]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/docs/published/handbook/engineering/ai/implementing-mcp-tools.md#L430-L463
[membership-model]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/organization.py#L742-L763
[user-verification]: https://github.com/PostHog/posthog/blob/2099bfc9e6f83a10e0ed9a32df94c27efe516f07/posthog/models/user.py#L253-L266
