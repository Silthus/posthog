# What would it take to let behavior drive Workflows?

Research for [#215](https://github.com/Silthus/posthog/issues/215), part of the Workflows growth map [#210](https://github.com/Silthus/posthog/issues/210).
Evidence: the code on `master` at `ff2ef488281`.
Every path below is relative to the repo root.
Sizes are guesses (S: about a week, M: two to three weeks, L: a month or more for one engineer).
Anything marked **guess** was not confirmed in code.

## Short answer

| Capability                                     | Recommended option                                                                                                     | Size                           | Main risk                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Behavioral cohorts as Broadcast audiences      | Recalculate the cohort when the send starts, then pin that version for every page                                      | M                              | The send waits on a cohort calculation, so a slow or failing calculation delays or blocks the broadcast |
| Trigger on entering or leaving a cohort        | New `cohort` trigger fed by the realtime cohort membership stream that already exists                                  | M                              | Works only for realtime-eligible cohorts on teams the realtime pipeline covers                          |
| Trigger when a person goes inactive for N days | A cohort trigger on a realtime cohort "did not perform X in the last N days" (rides on the row above)                  | S on top of the cohort trigger | Same coverage limit, plus persons the realtime pipeline never saw                                       |
| Fallback for inactivity without realtime       | Daily `schedule` trigger with an audience on `persons.last_seen_at`, plus "One time" masking                           | S–M                            | `last_seen_at` is an opt-in team setting, so most audiences come back empty unless it is on             |
| Person-level feature flag condition            | New `feature_flag` condition in `conditional_branch`, evaluated in the CDP by calling the flags service for the person | S–M                            | A network call per evaluation on the run path, and the CDP needs a new service credential               |

The cohort trigger is the keystone.
The realtime cohort pipeline already emits per-person `entered`/`left` changes.
Nothing turns those changes into workflow runs yet.
Build it once, and "inactive for N days" becomes a cohort definition rather than a new engine.

## 1. Behavioral cohorts as Broadcast audiences

### Why they are rejected today

- A Broadcast is a HogFlow with a `batch` or `schedule` trigger.
  `HogFlowSerializer` calls `_reject_behavioral_cohorts_in_audience` for both
  (`products/workflows/backend/presentation/views/hog_flow.py:1259`, called at `:1477` and `:1484`).
  It also rejects `events`/`actions` filters in a batch audience outright.
- The rejection walks the cohort and its dependencies and flags any non-static cohort with a `behavioral` property
  (`products/workflows/backend/services/batch_audience_cohorts.py`).
  The UI mirrors it with `hideBehavioralCohorts` (`products/workflows/frontend/Broadcasts/steps/BroadcastRecipientsStep.tsx:169`).
- The audience query is a HogQL `persons` query (`products/workflows/backend/services/batch_audience.py:154`).
  A cohort filter becomes `IN COHORT`, which the `InCohortResolver` turns into a join on the **precalculated** membership:
  `raw_cohort_people WHERE cohort_id = … AND version = …` (`posthog/hogql/transforms/in_cohort.py:413`).
  It only calculates inline when the `inline-cohort-calculation` flag is on for the team and recent calculations were fast
  (`posthog/hogql/functions/cohort.py`, `inline_cohort_query`).
- Dynamic cohorts are recalculated by a Celery beat task, oldest `last_calculation` first, at most every 15 minutes, as far as parallel capacity allows
  (`posthog/tasks/calculate_cohort.py:175`, `get_cohort_calculation_candidates_queryset`, `enqueue_cohorts_to_calculate`).
  So the stored membership can be older than 15 minutes, by an amount nobody controls.

The code comment gives the reason as "can't evaluate event behavior the way it's intended".
My reading (**inference**): a behavioral cohort is usually relative to now ("performed X in the last 7 days").
Its stored membership is relative to the last calculation, so it drifts every hour it is not recalculated.
Property cohorts read the same stored table and share the staleness, but their criteria do not drift with time, so the error is smaller.

### Options

**A. Fresh snapshot at send time (recommended). Size M.**
When the batch job starts, recalculate each referenced dynamic behavioral cohort
(`increment_version_and_enqueue_calculate_cohort`, `posthog/tasks/calculate_cohort.py:416`), wait for it, and pin the resulting version for every audience page.

- Cost: one cohort calculation per send.
  It is the same query the periodic task already runs, so the extra ClickHouse load is one calculation per broadcast, not per page.
- Work: a "preparing audience" state on the batch job, a wait with timeout in the resolver, a version pin passed into the audience query, and UI copy for the wait.
- The version pin also fixes a latent issue (**inference**): today each page reads `Cohort.version` again, so a recalculation that lands mid-send can mix two snapshots.
- Main risk: the send now depends on a calculation.
  A slow or failing calculation delays or blocks the broadcast, and many scheduled broadcasts at the same hour spike calculation load.

**B. Inline calculation in the audience query. Size S, not recommended.**
Force the `inlineCohortCalculation` modifier on.
The audience pages with a cursor (`get_batch_audience_person_ids`), so the inline events scan runs again for every page and for the count preview.
Cost grows with audience size divided by page size.
Main risk: ClickHouse load and memory on large audiences.

**C. Read the realtime membership store. Size S–M.**
For realtime-eligible cohorts, membership is kept fresh by the realtime pipeline (section 2) and is queryable in HogQL as `cohort_membership` (`posthog/hogql/database/database.py:350`).
The audience query could read that instead of `raw_cohort_people`.
Main risk: coverage.
Only some behavioral shapes are realtime-eligible, and the pipeline only runs for teams in `REALTIME_COHORT_TEAM_ALLOWLIST` (default `none`, `posthog/settings/cohorts.py:7`).
Rollout status: ask Michael.

A good end state is C where the team has realtime cohorts, and A everywhere else.

## 2. Trigger on entering or leaving a cohort

### What exists

- **Realtime cohort pipeline.** `rust/cohort-stream-processor` evaluates realtime cohorts on the event stream and emits one `CohortMembershipChange` per person and cohort, with status `entered` or `left` (`rust/cohort-stream-processor/src/producer/mod.rs`).
  `origin` is empty on the live path and `seed`/`reconcile` for backfills.
- **Time-based leaving.** A deadline-ordered eviction queue and sweep loop move persons out when a window expires, with no new event (`rust/cohort-stream-processor/src/sweep/mod.rs`).
- **CDP side.** `CdpCohortMembershipConsumer` reads the `cohort_membership_changed` topic and upserts a Postgres `cohort_membership` table
  (`nodejs/src/cdp/consumers/cdp-cohort-membership.consumer.ts:152`, `:365`).
  `conditional_branch` reads that table for `inCohort` conditions (`nodejs/src/cdp/services/hogflows/actions/conditional_branch.ts`).
- **What is missing.** Nothing starts a workflow from a membership change.
  The code says it directly: "The matcher does not watch cohort membership, so a wait gated on a cohort advances at its deadline" (`conditional_branch.ts:232`).
  The trigger types are `event`, `webhook`, `manual`, `schedule`, `batch`, `tracking_pixel`, `internal-event` and the warehouse types (`nodejs/src/cdp/schema/hogflow.ts`).
  `internal-event` runs are person-less, so they are not a fit.
- **Which cohorts are realtime-eligible.** `_calculate_realtime_support` (`posthog/api/cohort.py:466`) requires bytecode for every leaf.
  Behavioral leaves only compile for `performed_event` and `performed_event_multiple`, with optional event property filters (`build_behavioral_event_expr`, `posthog/cdp/filters.py:611`).
  Negated leaves are evaluated (`rust/cohort-stream-processor/src/stage2/evaluator.rs`).
  Sequences, lifecycle filters ("stopped/restarted performing"), `person_metadata` and test-account filtering force the batch path.

### Option: a `cohort` trigger on the membership stream. Size M.

1. Trigger config `{type: 'cohort', cohort_id, on: 'entered' | 'left'}` in the Node schema, the Django serializer and the trigger picker.
   Validation accepts only realtime cohorts on teams in the allowlist, with an explanation otherwise.
2. A new consumer group on `cohort_membership_changed` (or a second handler in the membership consumer) that:
   - drops changes with an `origin` (seed and reconcile are state assertions, not transitions),
   - looks up active HogFlows for `(team_id, cohort_id, status)` from an in-memory index, like the HogFlow manager does for event triggers,
   - builds person invocations with `buildHogFlowInvocation`, the same helper the batch resolver uses (`nodejs/src/cdp/consumers/cdp-cyclotron-worker-batch-resolve.consumer.ts`),
   - applies trigger masking with `hogMasker.filterByMasking` (same file, `:367`), so a person who flaps in and out does not re-enroll each time,
   - enqueues to Cyclotron.
3. A matching "wake on membership change" for `wait_until_condition` is a natural follow-up, not part of this.

Main risks:

- **Coverage.** Only realtime-eligible cohorts on covered teams.
  Users will build a cohort with a sequence or lifecycle filter and find it cannot be a trigger.
  The picker has to say why.
- **Enrollment storms.** A new or edited cohort is seeded through backfill.
  If seed changes leaked into the trigger, every existing member would enter the workflow at once.
  The `origin` filter covers this, but it needs a test.
- **Missed transitions.** Corrections that only arrive through `reconcile` never fire a trigger.
  Merges move persons between ids (**guess**: the trigger needs the same rekey care the matcher already has for waits).

## 3. Trigger when a person goes inactive for N days

### What exists

- **Schedules.** `HogFlowScheduleService` in Node polls Django's `internal_process_due_schedules`, which creates batch jobs for due `HogFlowSchedule` rows
  (`nodejs/src/cdp/services/hogflow-schedule/hogflow-schedule.service.ts`, `products/workflows/backend/presentation/views/hog_flow.py:7613`).
  The batch resolver pages the audience and applies trigger masking, so "One time" or a TTL stops a daily schedule from re-enrolling the same person.
- **Last seen.** `persons.last_seen_at` exists in HogQL (`posthog/hogql/database/schema/persons.py:55`).
  Ingestion only writes it when the team turns on `person_last_seen_at_enabled`, and rounds it to the hour
  (`nodejs/src/ingestion/common/steps/event-processing/process-persons-step.ts:51`, `nodejs/src/ingestion/common/persons/person-property-service.ts:88`).
  Audience filters cannot target it yet: `person_metadata` only allows `created_at` (`posthog/hogql/property.py:82`).

### Option A: a realtime cohort plus the cohort trigger (recommended). Size S on top of section 2.

Define "inactive for N days" as a realtime cohort and trigger on it:
"did not perform `<event>` in the last N days" and trigger on `entered`,
or "performed `<event>` in the last N days" and trigger on `left`.
The sweep moves persons out when the window expires, so no event is needed to fire it.
The product work is a preset ("Person goes inactive for N days") that creates the hidden cohort for the user.

- Main risk: the coverage limit from section 2.
- Open question (**guess**): `build_behavioral_event_expr` requires a non-empty event name, so "any event" may not be expressible; a preset may have to pick a key event such as `$pageview`.
- Open question (**guess**): a person the realtime pipeline never saw (inactive since before the team's backfill) may never enter.

### Option B: a daily schedule on `last_seen_at`. Size S–M.

A `schedule` trigger that runs daily, with an audience `last_seen_at` between N+1 and N days ago, and "One time" masking.
Work: add `last_seen_at` to `PERSON_METADATA_FIELDS` and its taxonomy and Rust flags parity lists (the comment at `posthog/hogql/property.py:76` lists them), plus a preset in the trigger UI.

- Main risk: `last_seen_at` is opt-in per team.
  Teams that never turned it on get empty audiences, which looks like a broken workflow.
  The preset would have to turn the setting on and explain that history starts then.
- Also: day granularity, and a full persons scan per run.

### Rejected: a per-person timer

A delay job per person, reset on every event, would mean a Cyclotron write per ingested event for every team with such a workflow.
That cost is out of proportion to the feature.

## 4. Person-level feature flag condition

### What exists

- Workflow filters offer `EventFeatureFlags` (`products/workflows/frontend/Workflows/hogflows/filters/HogFlowFilters.tsx:97`, `:188`).
  That is the `$feature/<key>` property on the trigger event: the value the SDK saw at capture time, only on event triggers, and stale after a delay step.
- A `flag` property filter compiles to the constant `1` in `property_to_expr` (`posthog/hogql/property.py:1219`), because flag dependencies only make sense at flag-matching time.
  Any design must not route a flag condition through the normal property filter path, or it silently matches everyone.
- Batch audiences reject flag conditions up front (`reject_flag_conditions_in_audience`, `hog_flow.py:435`).
- The CDP has no flag evaluation client.
  Django has one for the Rust flags service: `get_flags_from_service` takes `distinct_id`, `flag_keys` and an internal, non-billable token (`posthog/api/services/flags_service.py:41`).
  There is also `batch_evaluate_flag_for_team`, which pages the persons a flag matches, used to build a static cohort from a flag (`flags_service.py:154`).

### Option: a `feature_flag` condition in `conditional_branch`. Size S–M.

A condition `{type: 'feature_flag', key, variant?}` evaluated in Node by calling the flags service `/flags` with the run's `distinct_id` and `flag_keys: [key]`.
Load it lazily and memoize per action, the same way `conditional_branch` loads cohort membership.
Work: a small flags client and config in the CDP, schema and serializer changes, and the condition editor.

- Main risk: a network call per evaluation on the run path, with its latency, its load on the flags service, and a failure mode the branch must handle (retry, then a defined default).
- Person-less runs (webhook without a person, warehouse rows, internal events) cannot use it.
- The CDP needs the flags service credential.
  It must call the flags service directly, because a new Django internal endpoint would add an `INTERNAL_API_SECRET` caller, which the repo rules forbid.
  How that credential reaches the CDP pods is a deployment decision: ask Michael.

Bonus, not asked: a flag as a Broadcast audience is reachable through `batch_evaluate_flag_for_team`, by snapshotting the flag's persons into a static cohort at send time.

## Suggested order

1. The `cohort` trigger (section 2), behind the realtime coverage check.
2. The "inactive for N days" preset on top of it (section 3, option A).
3. The `feature_flag` condition (section 4), independent and small.
4. Behavioral Broadcast audiences (section 1), option C first for realtime teams, then option A.

Open questions for Michael:

- Which teams and regions the realtime cohort pipeline covers today, and when it covers everyone. That decides whether sections 2 and 3A reach the teams this map targets.
- How a flags service credential reaches the CDP.
