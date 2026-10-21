# Email recipient identity lookup

**Question:** Can `posthog.emails.send({ key, to, distinctId?, content })` infer its recipient's distinct ID from `to`?

**Recommendation:** Make `distinctId` optional, ignore ambient requester context, and support only **best-effort server lookup**.
Use an explicit recipient ID when attribution must be correct, particularly immediately after `identify` or for shared or recently changed addresses.
A unique email-property match is useful evidence, not proof of account ownership.

A bounded, ambiguity-aware lookup can improve today's email-address fallback.
Copying the conversations helper unchanged cannot provide that contract: it deliberately chooses a first person and discards ambiguity.
If the bounded lookup cannot be completed, keep delivery independent of enrichment and fall back to `to`, as today.
Do not advertise guaranteed inference or silently merge people.

## Evidence and scope

Researched on 2026-10-21 for [#534](https://github.com/Silthus/posthog/issues/534).
All PostHog paths and line numbers below refer to fetched `upstream/master`, commit `55ff8895ea1a50034d7e24adc471730099df8c88` (**P**).
The report branch starts at that commit; product code was not changed.
The posthog-js checkout was read by ref without switching its branch:

- **M:** `origin/main`, `338d82d0949bf65e3e571335e73756d970b4ef56`.
- **E:** `origin/feat/node-emails-send`, `87e9e95ca650a1294d348d9d5023d0772f268782`.

`Verified` means source inspection, including reading existing tests, not executing them.
`Proposed` and `inference` identify recommendations or consequences rather than existing behavior.
No production queries, runtime benchmarks, integration tests, or live email sends were performed.
Configured limits below come from public code, not observed traffic.

The current task's API and capture-policy decisions are inputs to this research.
They supersede the older explicit `emailOnly` union in #526; they are not presented as implementation on P.
This report supplies requirements for #531, not a replacement implementation spec.

## 1. The SDK pattern

### Verified

| Surface                                  | Omitted ID with context             | Omitted ID without context                                                          | Evidence on M                                                                                   |
| ---------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `capture`                                | Uses the context's ID               | Generates a UUIDv7 locally for this event and sets `$process_person_profile: false` | `packages/node/src/client.ts:3221-3237`; optional type at `packages/node/src/types.ts:45-47`    |
| `getFeatureFlagResult`                   | Uses context                        | Warns and returns `undefined`, without evaluation                                   | `packages/node/src/client.ts:1425-1433,1867-1891`                                               |
| `getAllFlags` / `getAllFlagsAndPayloads` | Use context                         | Warn and return empty results                                                       | `packages/node/src/client.ts:2046-2064,2100-2115`                                               |
| `evaluateFlags`                          | Uses context                        | Warns and returns an empty snapshot                                                 | `packages/node/src/client.ts:2264-2283`                                                         |
| `withContext`                            | Carries supplied/inherited identity | Does not manufacture an ID                                                          | `packages/node/src/extensions/context/context.ts:4-36`; `packages/node/src/client.ts:2770-2797` |
| Express middleware                       | Propagates `x-posthog-distinct-id`  | No header means no context identity                                                 | `packages/node/src/extensions/express.ts:36-70`                                                 |

An explicit nonempty capture ID wins over context.
Capture uses truthiness, so `''` falls through; context-aware flags retain an explicit `''` and reject it as missing instead.
A capture-generated ID is not installed into context, so later ID-less captures generate their own IDs.
The outgoing event already contains `distinct_id`; the server is not asked to infer it (`M:packages/core/src/posthog-core-stateless.ts:641-660`).

Do not generalize the flags row to deprecated methods.
`getFeatureFlag`, `getFeatureFlagPayload`, and `isFeatureEnabled` still require a string argument and bypass the context resolver (`M:packages/node/src/client.ts:1718-1746,1788-1822,1979-2001`).
The edge entrypoint also lacks Node's context implementation (`M:packages/node/src/entrypoints/index.edge.ts:11-13`).

Express propagates identity headers; it does not inspect an email address, authenticated-user object, cookie, or IP to infer identity.
A context containing only session or request properties supplies no distinct ID.
Browser tracing forwards its existing local identity, while ordinary browser initialization creates an anonymous UUID locally (`M:packages/browser/src/extensions/tracing-headers.ts:89-103`; `M:packages/browser/src/posthog-core.ts:1032-1046`).
These inspected SDK mechanisms establish **local resolution or explicit omission**, not a server-inference precedent.
This is not an exhaustive audit of every PostHog language SDK.

**The existing email feature already ignores context.**
Its adapter receives no context accessor, and its body includes `identifiers` only when the caller supplied `distinctId !== undefined` (`E:packages/node/src/client.ts:692-702`; `E:packages/node/src/emails.ts:384-390`).
Omission sends no identifiers, inside or outside `withContext`, and generates no anonymous ID.
An empty string is currently forwarded.
The JSDoc describes recipient attribution, not loading person properties for rendering (`E:packages/node/src/emails.ts:32-42`).

### Proposed contract

Keep that email exception explicit in the option docs and both send overloads:

> `distinctId` identifies the recipient. Unlike `capture` and context-aware flag methods, `emails.send` never reads identity from `withContext` or tracing headers. When omitted, the SDK sends no distinct ID. The server attempts best-effort email lookup and otherwise uses the recipient address for attribution. Pass the recipient's ID when attribution must be reliable. Template data is supplied explicitly.

The requester can invite or notify somebody else.
Automatically taking the requester's context would therefore introduce wrong-recipient attribution.
Test an invite sent under requester A's context to recipient B, omitted ID inside and outside context, explicit B overriding omission, and a context with session properties but no identity.
Reject a blank override on the new API rather than making its meaning depend on truthiness; preserve existing template-route compatibility separately.

## 2. Lookup primitives, cost, and placement

### Verified primitives

`products/conversations/backend/person_lookup.py:18-23,33-77` does one team-scoped HogQL query over `persons`, matching `lower(properties.email) IN {emails}` with parameterized, lowercased inputs.
It sorts identified people first, then oldest `created_at`, then UUID; it keeps only the first UUID for each address.
It then fetches those UUIDs and their distinct IDs through personhog.
The helper batches addresses, but has no email-result cache.

It matches only the property key **`email`**, not `$email`, `Email`, or a custom key.
Values are case-insensitive; neither whitespace normalization nor provider-specific alias handling is performed there (`person_lookup.py:18-23,49-65`).
Do not strip plus tags or dots, or expand to other property keys without a separate contract.

The persons API's `?email=` is different: it adds an **exact**, case-sensitive `email` property filter and orders newest first (`posthog/api/person.py:756-759,804`; `posthog/hogql/property.py:868-876`).
It uses `ActorsQueryRunner.calculate()`, bypassing the insight-cache wrapper; optional totals add another query, and list serialization hydrates people afterward (`posthog/api/person.py:875-899,943-944`).
The separate `search=` path has other identifier and property behavior; it is not the `?email=` contract (`posthog/api/person.py:806-870`).
Do not make an internal HTTP request to the full persons list endpoint for each email.

These paths fit the data-access split: **ClickHouse/HogQL selects property matches; personhog resolves current identity and distinct IDs** (`docs/internal/person-data-access.md:9-29,33-39`).
New code must not search person properties through personhog or query person tables directly through ORM/raw SQL.
The legacy list hydration is not a model for new property loading (`docs/internal/person-data-access.md:54-59`).

### Materialization and bounds

The conventional materialized name is `pmat_email`, subject to collision suffixes (`ee/clickhouse/materialized_columns/columns.py:681-700`).
The lower bloom-filter skip index indexes `lower(column)`, or its nullable equivalent (`ee/clickhouse/materialized_columns/columns.py:358-381`).
Index availability is discovered from actual metadata, not guaranteed by the property name; materialization can be disabled (`ee/clickhouse/materialized_columns/columns.py:66-75,98-168`; `posthog/clickhouse/materialized_columns.py:31-51`).
A skip index can prune granules. It is not a unique email index or evidence of constant-time lookup.

An existing test explicitly materializes email with the lower bloom index, runs the helper, and checks `EXPLAIN` on its generated person-filter subquery (`products/conversations/backend/api/tests/test_tickets.py:2082-2109`).
That is useful test coverage **when configured**, not proof that every deployment has the index or that the proposed ambiguity query meets a latency budget.
The HogQL virtual table preserves latest-version person semantics while allowing candidate filtering (`posthog/hogql/database/schema/persons.py:100-156`).

There is also a correctness limit: the helper supplies no SQL `LIMIT`, and normal HogQL execution inserts a default **100-row** limit (`posthog/hogql/query.py:237-247`; `posthog/hogql/constants.py:145-150`).
An arbitrary address batch, or many duplicates for one address, can consume that window.
A new lookup must detect ambiguity before discarding rows and bound results **per address**, not treat a truncated global result as complete.
For a single send, at most two eligible identified candidates are enough to distinguish unique from ambiguous, provided that eligibility is applied before that bound.
That is a proposed query shape, not an implemented or benchmarked query.

### Cost and design load

For a nonempty helper result selecting U UUIDs, the current path costs one property-data query plus UUID RPC batches, then distinct-ID RPC batches for surviving people.
At the default batch size B=250, this is `1 + ceil(U/B) + ceil(V/B)`, where V is the number of surviving UUIDs; the two latter terms are RPC counts, not ClickHouse queries.
A miss avoids the identity RPCs.
Cold property-metadata compilation can add system-metadata reads (`posthog/models/person/util.py:77-143,188-205,483-512`; `posthog/settings/personhog.py:21-24`; `ee/clickhouse/materialized_columns/columns.py:98-168`).
The helper currently requests all distinct IDs; new attribution should use the existing positive `distinct_id_limit`, not hydrate an unbounded ID set.
No latency was measured.

Current single-recipient transactional sends are throttled at **600/minute and 20,000/hour** per throttle identity, with additional project-secret-key team aggregate throttles at those limits (`products/messaging/backend/presentation/views/message_templates.py:294-305,339-358,392-400`).
One uncached lookup per omitted ID therefore adds up to 600 property queries/minute in that burst budget, plus identity RPCs on hits.
These are code limits, not usage figures or a global fleet cap; the new body route must explicitly inherit the intended budget.

Campaign audience settings default to **500,000**, with an elevated **1,000,000** ceiling; email-tier enforcement can lower the team limit (`posthog/settings/web.py:1088-1103`; `products/workflows/backend/utils/batch_trigger_limit.py:33-53`).
A naive lookup for every recipient would add O(N) property queries at those design sizes.
Existing person-audience runs already resolve their person anchor and backfill an associated distinct ID, so they should not re-infer identity from email (`nodejs/src/cdp/consumers/cdp-cyclotron-worker-hogflow.consumer.ts:150-205`).
Row/account audiences deliberately skip person resolution (`:135-149`); do not broaden this code-send feature to them.
Any future email-only bulk path needs bounded batches and per-address ambiguity handling first.

### Proposed placement

Prefer **Django before enqueueing** for the first code-send implementation, using the sanctioned HogQL and personhog primitives already available there.
Resolve once, pass the resulting ID in the command, and freeze it in the accepted run.
Use an explicit overall lookup budget, including RPC retry time, with fallback on miss, ambiguity, timeout, or error.
Do not make successful enrichment a condition of email acceptance; existing admission and durable-queue requirements remain unchanged.
Today cdp-api constructs the invocation's event from the supplied ID and returns 202 after queueing (`nodejs/src/cdp/cdp-api.ts:1150,1168-1202,1217`).

This placement adds request latency and analytical-store dependency to enrichment.
It is a recommendation conditional on the production-shape proofs below, not a claim that the request path is already fast enough.
The smaller safe release, if those proofs do not hold, is optional explicit recipient ID plus the current address fallback, without advertising inference.

Resolving in the worker after 202 keeps that latency out of admission and may allow ingestion to catch up.
But queue delay is not a freshness guarantee, and Node would need a sanctioned property-search boundary rather than a new raw person-table query.
It would also have to persist the resolution before SES, retries, and any captured signal.
That is a larger first change.
Do not add a shared persistent email cache in v1: negative entries prolong misses and positive entries can preserve obsolete ownership.
The existing one-minute person-ID/distinct-ID cache is not an email search index (`nodejs/src/cdp/services/managers/persons-manager.service.ts:42-50`).

## 3. Correctness and fallback

### Verified limits and proposed responses

| Case                                          | What the code establishes                                                                                                                                  | Proposed response                                                                                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome email just after `identify`           | Person properties reach ClickHouse asynchronously, even though personhog identity reads are read-after-write (`docs/internal/person-data-access.md:33-39`) | No retry/sleep guarantee. Pass the known recipient ID; a property-search miss uses `to`.                                                                                        |
| Several people share an address               | Conversations chooses identified first, then oldest, and discards alternatives (`person_lookup.py:18-23,62-67`)                                            | Accept exactly one matching identified candidate. Ignore unidentified email-only stubs; two identified candidates are ambiguous and fall back. Do not choose an account by age. |
| No match, unavailable lookup, or deleted UUID | Helper returns no person when the selected UUID is absent (`person_lookup.py:69-77`)                                                                       | Use `to`; do not fail delivery, create an alias, or try an arbitrary second person.                                                                                             |
| Address changed                               | HogQL deduplicates versions, but its property view can lag current identity (`posthog/hogql/database/schema/persons.py:100-156`; data-access doc above)    | A unique stale match can still be wrong. Explicit ID is the reliable override; do not present uniqueness as ownership proof.                                                    |

The identified-only rule is a conservative **proposal**, not conversations' behavior: that helper can return an unidentified person when no identified person matches.
It intentionally leaves more misses rather than guessing an account.
Even a fresh, unique identified match can be a shared mailbox; the feature is attribution convenience, not identity verification or authorization.

### Which distinct ID?

A person UUID is not a distinct ID.
The email tracking resolver explicitly warns against using `person.id` because that would create a phantom identity (`nodejs/src/cdp/services/messaging/email-tracking.service.ts:102-115`).
Resolve the selected UUID through personhog with a positive ID bound, recheck that the person still exists/is eligible, and use an associated distinct ID.
The existing Node person manager requests one ID per person (`nodejs/src/cdp/services/managers/persons-manager.service.ts:133-159`).

The bounded personhog implementation prefers IDs not resembling anonymous IDs and then row order, within a capped scan; the unbounded path has no ordering guarantee (`rust/personhog-replica/src/storage/postgres/distinct_id.rs:83-111,178-197`).
That is a selection heuristic, **not a canonical application-user-ID contract**.
An associated ID joins the currently selected person, but only the caller knows which product account it intended.
Explicit `distinctId` wins without email lookup or a match requirement.

### What carries over from conversations?

Conversations first respects an already identified ticket identity, limits fallback by channel identity trust, and isolates lookup failures (`products/conversations/backend/events.py:268-335`).
Carry over team scope, explicit identity precedence, bounded enrichment, and failure isolation.
Do not copy inbound-channel rules as proof that an outbound address has a unique account owner.

The important difference: this fallback resolves **organization groups**, while ticket-created capture still uses `ticket.distinct_id` (`products/conversations/backend/events.py:476-505`).
It is not an existing guarantee that email search rewrites analytics identity to the right application user.
The test preferring an identified person over an email-only stub proves that deliberate enrichment preference, not duplicate-account correctness (`products/conversations/backend/api/tests/test_tickets.py:2058-2080`).

Today Django sends `distinct_id or to` (`products/messaging/backend/services/transactional_email.py:196-211`).
With engagement capture enabled, a miss therefore attributes to the email-address distinct ID, potentially a separate person from the app's identity.
Merely sharing an `email` property does not establish the distinct-ID association described by the person-data contract.
Do not promise automatic merging or later repair.
Queueing the synthetic send event alone is not proof that a person was created; analytics capture is a separate output (`nodejs/src/cdp/cdp-api.ts:1168-1197`; `nodejs/src/cdp/services/messaging/email.service.ts:721-742`).

## 4. Resolve once at send time

**Verified:** sent/failed events read the invocation's event distinct ID, and SES tracking receives that same identity through the signed tracking header (`nodejs/src/cdp/services/messaging/email.service.ts:721-742,1087-1095`; `nodejs/src/cdp/services/messaging/helpers/ses.ts:700-734`).
Current master still consults the team's live engagement setting; it does not yet carry the proposed scoped capture-policy snapshot (`nodejs/src/cdp/services/messaging/email-tracking.service.ts:328-342`; `nodejs/src/cdp/services/messaging/helpers/tracking-code.ts:50-59,78-98`).
The inspected event construction does not yet add `$email_message_id` (`email.service.ts:732-742`; `email-tracking.service.ts:335-339`).

**Proposed:** freeze the resolved distinct ID, capture-policy choice, and message ID with the accepted send.
The worker and tracking header must use those values together.
Do not perform email search when delivery/open/click callbacks arrive: a late match cannot repair an already captured sent event, and a changed address could split one message's signals between people.
It also multiplies lookup load per callback.
An ID string snapshot cannot prevent later normal person merges or splits; it prevents this feature from choosing a new ID from a changed email property.

Production opens/clicks currently use SES feedback and the signed header; direct pixel/redirect capture is a dev/test path (`nodejs/src/cdp/services/messaging/email-tracking.service.ts:146-161,557-568`).
Preserve this distinction rather than adding raw recipient identity to production tracking URLs.
If another provider later uses direct callbacks, it needs the same frozen send contract before that path captures events.

`$email_message_id` must correlate relevant analytics events with operational status regardless of whether the recipient was explicitly identified, inferred, or addressed by email.
Capture disabled means no recipient analytics events, not no operational status.
If capture is fully disabled and no other send behavior needs recipient identity, lookup can be skipped without adding a public mode.

Keep #526's status record separate from identity resolution.
Its planned ClickHouse `queued` row is asynchronous and the reader can temporarily return no row; its retention is also independent of callback arrival.
Neither status visibility nor an active Cyclotron job should be a prerequisite for attributing a callback whose signed send snapshot is available.
Do not turn the status table into an email-to-person map or another durable identity store.
These status/policy statements are architecture requirements from #526, not claims about P.

## 5. Smallest requirements for #531 and #526

Preserve #525's feature order; keep #526's mechanical seam refactors ahead of it.
Do not insert a new public identity-mode API, global address registry, automatic alias/merge, or callback-time repair system.

1. **Send attribution:** keep API-usage attribution separate from recipient analytics and operational status. An inferred recipient is not the developer/requester.
2. **Body route:** accept optional nonblank recipient `distinctId`; explicit ID bypasses lookup. Add a team-scoped, bounded HogQL candidate search and bounded personhog ID resolution for omission, with the conservative uniqueness rule and `to` fallback above. Freeze identity and scoped capture policy in the existing send command/run/header seams. Keep the old template route's omission behavior compatible unless deliberately migrated. Capture's default remains governed by #526/#533, not by this lookup decision.
3. **Skill v0:** describe best effort and teach explicit recipient ID when known, especially welcome emails. Never suggest copying the requester's ID for an invite.
4. **posthog-node PR 1:** preserve context independence, omission on the wire, and explicit template data. Document the exception beside context-aware capture and add the recipient-versus-requester tests from section 1. Keep the chosen `key`/`content` API; no new `emailOnly` switch is needed.
5. **Idempotency on the existing store:** fingerprint caller inputs, including explicit ID versus omission, not mutable lookup output. Accepted replay must reuse the original message ID, frozen identity, and policy. It must not enqueue again or adopt a new attribution identity after email data changes. Because Django lookup precedes cdp-api's replay seam, do not feed a fresh lookup result into the fingerprint; skipping redundant Django lookup on replay needs coordination with that seam, not a second store. The existing accepted run remains authoritative.
6. **Skill v1 and Wizard:** prove send, delivery/engagement, and product activity join the intended person, plus an invite where requester and recipient differ. The setup agent should retain a known app recipient ID during migration instead of discarding it in favor of email search.
7. **Attachments and prequeue checks:** leave admission/delivery-policy responsibilities intact. Identity enrichment failure is not an admission rejection and does not bypass sender, suppression, quota, or durable-queue checks.
8. **Key limits, status record, SDK PR 2:** retain a bounded code-send query budget as traffic expands. Join status/events by message ID, never recipient address; status read lag must not alter capture. Reuse known campaign person anchors rather than introducing per-recipient email queries.

**#526 must show** the successful explicit/unique-match path and every fallback path across Django, cdp-api, Cyclotron, EmailService, SES feedback, and tracking.
Its command and accepted-run diagrams must distinguish the caller's optional identity input from the frozen attribution result.
Show a timeout that still queues, duplicate identified matches that do not pick the oldest account, a welcome-email miss, a stale/changed-email limitation, and a callback after policy change or queue cleanup.
Show that idempotent replay after a changed email match retains the original send.
The prototype must label which behavior is implemented and which is still an owed proof.

### Proof gaps

Production read access is expected on **2026-11-02**.
These production-shape proofs remain owed; no production values belong in this public report:

- **Index and query plan:** actual email materialization/index availability and `EXPLAIN`, rows/bytes scanned, and execution time for the proposed latest-person, identified-only, ambiguity-aware predicate. The current helper's index test does not cover that new predicate.
- **Request budget and dependency load:** end-to-end HogQL plus personhog latency, retry/timeout behavior, and aggregate load at the configured code-send throttles, including multiple callers/projects. Establish a concrete lookup deadline and verify fallback meets the send-acceptance budget.
- **Freshness and correctness:** identify-to-search lag, unique/duplicate/no-match shapes, changed-address behavior, deleted/merged candidates, and person distinct-ID cardinality. Use findings privately to decide whether best-effort lookup is useful enough; publish no customer data or internal rates.
- **Bulk shape:** bounded address batches, completeness under duplicate-heavy input, the default-limit trap, and resource cost near applicable campaign limits. Confirm existing person-audience sends incur no new email queries.

Separately, implementation still owes **local integration proofs**, not production observations: omitted ID under requester context; every lookup fallback; bounded ID selection; unchanged rendering data; enqueue failure versus enrichment failure; replay after a changed match; and identical message ID/identity/policy across sent and feedback with capture on/off, policy changes, missing status rows, and cleaned-up jobs.
Existing context and email tests were read, not run (`M:packages/node/src/__tests__/context.spec.ts:93-102,159-174,343-459`; `E:packages/node/src/__tests__/emails.spec.ts:92-114`).
No implementation or latency claim is proved merely by this research commit.

## References

- [P: PostHog source baseline](https://github.com/PostHog/posthog/tree/55ff8895ea1a50034d7e24adc471730099df8c88).
- [M: posthog-js main baseline](https://github.com/PostHog/posthog-js/tree/338d82d0949bf65e3e571335e73756d970b4ef56).
- [E: posthog-js email feature baseline](https://github.com/PostHog/posthog-js/tree/87e9e95ca650a1294d348d9d5023d0772f268782).
- [#525: scope and PR order](https://github.com/Silthus/posthog/issues/525).
- [#526: architecture prototype and status/capture contracts](https://github.com/Silthus/posthog/issues/526).
- [#531: spec and implementation-ticket handoff](https://github.com/Silthus/posthog/issues/531).
- [#532: prior email tracking research](https://github.com/Silthus/posthog/issues/532).
- [#533: engagement-event treatment and capture default](https://github.com/Silthus/posthog/issues/533).
