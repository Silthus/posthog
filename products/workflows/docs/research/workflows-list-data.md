# What can the workflows list show and filter on?

Research for [Silthus/posthog#146](https://github.com/Silthus/posthog/issues/146) (map [#144](https://github.com/Silthus/posthog/issues/144)).
Source: the repo at commit `74299d1d61f` (master, 2026-09-25). All paths are repo-relative. Line numbers are from that commit.
Every claim cites the source file that owns it. The seeding JSON examples are built from the validation code and test fixtures. They were not posted against a running stack.

## Gist

- **The list is server-paginated and server-filtered.** `GET /api/projects/:id/hog_flows/` with limit/offset (default 100, max 500; the UI sends 30). Server filters are `search`, `status`, `type`, `trigger`, `created_by`, `origin_product`, `broadcast_eligible`, plus exact `id`/`created_at`/`updated_at`. The order is fixed at `-updated_at, -id`. There is no `ordering` param.
- **Each list row is heavy.** The web list uses `HogFlowMinimalSerializer`, which returns the full `actions`, `edges` and `draft` per row. So anything derived from one workflow's own steps is free on the client, for the loaded rows: type, channels, email subjects, sender integration ids, trigger details.
- **Email facts live in `action.config.inputs.email.value`**: `subject`, `preheader`, `html`/`text`, `to`, and `from = {integrationId, integrationIds?, email?, name?}`. The real sender address is the email `Integration.config.{email, name, domain}` that `integrationId` points at, unless `from.email` overrides it. Showing "from which address" costs one extra fetch of the team's email integrations.
- **No folders, no tags on workflows.** `HogFlow` has neither, and it is not synced to the project tree (`FileSystem`). Only workflow templates (`HogFlowTemplate`) have `tags` and a `scope` (`team`/`organization`/`global`).
- **The Library tab shows email message templates (`MessageTemplate`), not workflow templates.** Workflow templates appear only in the "Create a workflow" modal. Neither template list has server-side search or filters.
- **"Last 7 days" is one HogQL query per row.** A batched totals endpoint exists (`GET hog_flows/metrics/global?after=-7d`), but it returns succeeded/failed totals per workflow, not a daily series.
- **Needs backend work:** folders, tags, sort orders, facet counts, grouping across pages, multi-value status/trigger filters, filtering by channel or sender, and "which workflows use message template X" (not reliably stored).

## Free today vs needs work

"Free" means it is on the current list payload, or one cheap extra call away, with no backend change.

| Fact or filter | Status | Source / what is missing |
|---|---|---|
| Name, description, status, version, created_at, updated_at | Free | `HogFlowMinimalSerializer` fields |
| Created by (id, uuid, name, email, avatar) | Free | `created_by` as `UserBasicSerializer` |
| Owner from description (`Owner: @dana`) and `::` name prefixes | Free (client parse) | `name`, `description` |
| Type (Messaging / Automation / Loop / Broadcast) | Free | `origin_product` + action types; server `type` filter exists |
| Trigger type and details (event names, schedule, webhook, batch audience) | Free | `trigger` and the trigger action's `config` |
| Dispatch channels per workflow (email, SMS, push, Slack, webhook, other destination) with counts | Free | `actions[].type` + `config.template_id` |
| Email subject, preheader, body text per email step | Free | `config.inputs.email.value.*` |
| Sender integration id(s) and override address/name per email step | Free | `config.inputs.email.value.from` |
| Sender address/domain/display name resolved | One extra call | `Integration` rows of kind `email` (`config.email`, `config.name`, `config.domain`) |
| Message category (marketing/transactional) per messaging step | Free (id + type); name needs one call | `config.message_category_id`, `config.message_category_type`; names from `messaging_categories` |
| Draft pending changes | Free | `draft` on the row |
| Email sending paused | Needs API field | `email_sending_paused_*` is only on the detail serializer |
| Billable action types | Free | `billable_action_types` |
| Search by name/description, then step name and email subject/preheader/body | Free (server) | `?search=` |
| Filter status, type, trigger type, created by | Free (server, single value) | `status` exact, `trigger` JSON containment, `type` accepts a comma list |
| Last 7 days sparkline per row | Free, but N queries | `AppMetricsSparkline` per row |
| Last 7 days totals for all workflows in one call | Free | `GET hog_flows/metrics/global?after=-7d` (succeeded/failed only) |
| Workflow templates with tags and scope | Free, one call, client filtering | `GET hog_flow_templates/` |
| Email message templates | Free, one call, client filtering | `GET messaging_templates/` |
| Multi-value status or trigger filters | Needs API | `status` is an exact match; `trigger` takes one JSON object |
| Filter by channel ("sends SMS"), sender address/domain, destination template, category | Needs API | JSON queries over `actions` (the `type` filter shows the pattern) |
| Facet counts per filter value | Needs API | No aggregate endpoint; or load everything (max 500 per page) |
| Group across all workflows | Needs API or load-all | Grouping works only within the loaded page |
| Sort by name, created, status, volume, last run | Needs API | Order fixed to `-updated_at` |
| Folders | Needs API + model | No `FileSystemSyncMixin` on `HogFlow`; manifest declares a `workflows` file-system type that nothing writes |
| Tags on workflows | Needs API + model | No field, no `TaggedItem` |
| Templates and workflows in one tree | Needs design + API | Two separate endpoints; message templates have no scope or tags |
| Which workflows use message template X | Needs API + data | Web editor copies content and stores no reference; API callers may leave `config.template_uuid` as provenance |

---

## A. Backend

### A1. HogFlow model

File: `products/workflows/backend/models/hog_flow/hog_flow.py`, class `HogFlow(UUIDTModel)`, table `posthog_hogflow`.
Indexes on `(status, team)` and `(version, team)`. Unique constraint on `(team, version, id)`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | from `UUIDTModel` |
| `name` | CharField(400), nullable | |
| `description` | TextField, default `""` | |
| `version` | IntegerField, default 1 | |
| `team` | FK `posthog.Team` | tenant key |
| `status` | CharField, `State` | `draft` (default), `active`, `archived`. No soft-delete flag. Delete is a hard delete. |
| `origin_product` | CharField(40), nullable | `OriginProduct`: `loops`, `broadcasts`. Null for flows built in the workflows UI or API. |
| `created_at` / `updated_at` | DateTime | auto |
| `created_by` | FK `posthog.User`, SET_NULL | |
| `trigger` | JSON | copied from the single `type: "trigger"` action's `config`; read-only on the serializer |
| `trigger_masking` | JSON, nullable | `{hash, ttl, threshold?}` dedup/throttle |
| `conversion` | JSON, nullable | `{filters, events, window, bytecode}` |
| `exit_condition` | CharField | `exit_on_conversion` (default), `exit_on_trigger_not_matched`, `exit_on_trigger_not_matched_or_conversion`, `exit_only_at_end` |
| `email_sending_rate_limit` | JSON, nullable | `{count, period: "minute"\|"hour"}` |
| `email_sending_paused_at` / `_reason` / `_by` / `_resumed_at` / `_warned_at` | pause state | read-only |
| `edges` | JSON | `[{from, to, type: "continue"\|"branch", index?}]` |
| `actions` | JSON | list of step nodes (section A3) |
| `encrypted_inputs` | encrypted JSON | secret inputs split out of `actions` |
| `abort_action` | CharField, nullable | |
| `variables` | JSON list | `{key, type, default}`, total under 5 KB |
| `billable_action_types` | JSON list | computed on save |
| `draft` / `draft_updated_at` / `draft_encrypted_inputs` | staged edits for active flows | |
| `action_redirects` | JSON, nullable | skip-forward map for deleted steps |

Not on the model: **tags, folder or file-system fields, a `deleted` flag**. There is no `FileSystemSyncMixin` and no `get_file_system_representation` anywhere in `products/workflows/backend` (no hits for `FileSystem` or `file_system` outside tests).
Signals: `post_save`/`post_delete` reload the flow on the CDP workers (`hog_flow_saved`). Saves that touch only `draft`/`draft_updated_at` skip the reload.
Related models in `products/workflows/backend/models/`: `hog_flow_revision.py`, `hog_flow_batch_job/`, `hog_flow_schedule/`, `team_workflows_config.py`, `workflow_proposal.py`, `hog_flow/hog_flow_template.py`.

Constants in the same file:

- `SUPPORTED_ACTION_TYPES`: `trigger`, `function`, `function_email`, `function_sms`, `function_push`, `delay`, `wait_until_condition`, `wait_until_time_window`, `conditional_branch`, `random_cohort_branch`, `exit`. It must stay in sync with `nodejs/src/cdp/schema/hogflow.ts` and `products/workflows/frontend/Workflows/hogflows/steps/types.ts`.
- `TRIGGER_TYPES`: `event`, `schedule`, `manual`, `batch`, `tracking_pixel`, `webhook`, `data-warehouse-table`, `data-warehouse-view`, `internal-event`.
- `WORKFLOW_SAFE_INTERNAL_EVENTS`: `$slack_message_received`, `$github_event_received`.
- `BILLABLE_ACTION_TYPES`: `function`, `function_email`, `function_sms`, `function_push`.
- `MESSAGING_ACTION_TYPES`: `function_email`, `function_sms`, `function_push`. A flow with one of these is "messaging", else "automation".
- `PERSON_DEPENDENT_ACTION_TYPES`: `wait_until_condition`, `random_cohort_branch`.
- `ROW_SCOPED_TRIGGER_TYPES`: `data-warehouse-table`, `data-warehouse-view`, `internal-event`.

### A2. Trigger config shapes

The canonical shape is the zod `HogFlowTriggerSchema` in `products/workflows/frontend/Workflows/hogflows/steps/types.ts` (L149-213). The editor's defaults for a new trigger are in `products/workflows/frontend/Workflows/hogflows/steps/StepTrigger.tsx` (~L305-337).

| `type` | Shape | Notes |
|---|---|---|
| `event` | `{type, filters: {events?, actions?, properties?, filter_test_accounts?}}` | Server requires at least one event, action or property filter. Registered sub-triggers (surveys, support tickets, ...) are `event` triggers told apart by filters (`hogflows/registry/triggers/triggerTypeRegistry.ts`). |
| `webhook` | `{type, template_id: "template-source-webhook", template_uuid?, inputs}` | Inputs `event` and `distinct_id` are required by the source template (`nodejs/src/cdp/templates/_sources/webhook/incoming_webhook.template.ts`). |
| `manual` | `{type, template_id: "template-source-webhook", inputs}` | The editor defaults inputs to `event: "$workflow_triggered"`, `distinct_id`, `method: "POST"`. |
| `tracking_pixel` | `{type, template_id: "template-source-webhook-pixel", inputs}` | Inputs `event`, `distinct_id` required (`_sources/pixel/pixel.template.ts`). |
| `schedule` | `{type: "schedule"}` | The recurrence lives in a separate `HogFlowSchedule` row: `POST hog_flows/:id/schedules/` with `{rrule, starts_at, timezone, variables}` (`HogFlowScheduleSerializer`, `api/hog_flow.py` L2133; endpoint L5889). |
| `batch` | `{type, filters: {audience_type?: "persons"\|"accounts", properties: [...], tag_names?, assignment_status?, ...}}` | Server requires `filters`; no event/action filters in a batch audience. Schedules also apply (`SCHEDULED_TRIGGER_TYPES = ['batch','schedule']`). Batch dispatch goes through `batch_jobs` with an audience confirm token for agent callers. |
| `data-warehouse-table` / `data-warehouse-view` | `{type, table_name, filters: {properties?}, key_property?}` | Row-scoped: forces `exit_only_at_end`, rejects person-dependent steps when active. |
| `internal-event` | `{type, filters: {source: "internal-events", events: [...], properties?}}` | Slack needs a channel filter; GitHub needs `repository` and `event_type` filters (non-draft). |

### A3. Action types and dispatch channels

Action union: `products/workflows/frontend/Workflows/hogflows/steps/types.ts` L218-407. Common fields on every step: `id`, `name`, `description`, `on_error`, `filters`, `output_variable`, `created_at`, `updated_at`.

**The dispatch channel comes from `type` first, then `config.template_id`.** There is no `function_slack` or `function_webhook` type.

| Channel | `type` | `config.template_id` | Required inputs (template file) |
|---|---|---|---|
| Email | `function_email` | `template-email` | `email` (`native_email`): `to`, `from`, `subject`, and `html` or `text` (`posthog/cdp/validation.py` ~L726) |
| SMS | `function_sms` | `template-twilio` | `twilio_account` (integration), `from_number`, `to_number`, `message` (`nodejs/src/cdp/templates/_destinations/twilio/twilio.template.ts`) |
| Push | `function_push` | `template-native-push` | `distinctId`, `channels` (firebase/apns integrations), `title`, `body` (`_destinations/push/push.template.ts`) |
| Slack | `function` | `template-slack` | `slack_workspace` (integration), `channel` (`_destinations/slack/slack.template.ts`) |
| Webhook | `function` | `template-webhook` | `url` (`_destinations/webhook/webhook.template.ts`) |
| Any other destination | `function` | any hog function template id | per template `inputs_schema` |

Messaging steps (`function_email`, `function_sms`, `function_push`) also carry `message_category_id` (a `MessageCategory` UUID) and `message_category_type` (`marketing` or `transactional`). Email steps also carry `tracking_enabled`.
`billable_action_types` is the sorted set of step types in `BILLABLE_ACTION_TYPES`, computed in `HogFlowSerializer.validate` (`api/hog_flow.py`).

### A4. Where an email's sender, subject and template live

All email content sits in `action.config.inputs.email.value`. Default shape from `nodejs/src/cdp/templates/_destinations/email/email.template.ts`:

```json
{
  "to": { "email": "{{ person.properties.email }}", "name": "" },
  "from": {},
  "replyTo": "", "cc": "", "bcc": "",
  "subject": "", "preheader": "", "text": "", "html": ""
}
```

Saved steps may also carry `design` (the Unlayer design JSON).

- **Subject / preheader / body:** `value.subject`, `value.preheader`, `value.text` or `value.html`. The server search reads exactly these (`_ACTION_SEARCH_TEXT_SQL`, `api/hog_flow.py` ~L3905).
- **Sender:** `value.from` is `{integrationId, integrationIds?, email?, name?}` (`posthog/cdp/validation.py` L72-160, ~L738-760; TS `EmailTemplateFrom` in `frontend/src/scenes/hog-functions/email-templater/types.ts`).
  - `integrationId` / `integrationIds` (sender rotation, max `MAX_WORKFLOW_EMAIL_SENDERS`) point at `Integration` rows of kind `email`. That row's `config` holds `email`, `name` and `domain` (`posthog/models/integration/email.py`, `create_native_integration`).
  - `email` / `name` are optional overrides. The override address must be on the integration's verified domain, or the save is rejected (`_validate_email_sender_override`). It may be a Liquid expression.
  - So: **from-address = `from.email` if set, else `Integration(from.integrationId).config.email`**. Display name likewise from `from.name` or `config.name`.
  - Legacy rows and tests may hold `from` as a plain string (`"noreply@example.com"`, see `products/workflows/backend/api/test/test_hog_flow.py` `_valid_email_inputs`). Handle both.
- **Library template reference:** `config.template_uuid` may name a `MessageTemplate`. Via the API, when no body is given, the server copies the template's `subject`/`text`/`html`/`design` into the step at save (`_apply_email_template_content`, `api/hog_flow.py` ~L695). The `template_uuid` stays on the config as provenance. The web editor copies content on the client and stores no reference (`emailTemplaterLogic.tsx` `applyTemplate`). So a "uses template X" link exists only for API-authored steps. `from`/`to` never come from a template.
- **Category:** `config.message_category_id` → `MessageCategory` (`products/messaging/backend/models/message_category.py`): `key`, `name`, `description`, `public_description`, `category_type` (`marketing`/`transactional`), `deleted`. API: `/api/projects/:id/messaging_categories/`.

### A5. List endpoint

`HogFlowViewSet` (`products/workflows/backend/api/hog_flow.py` L4036), routed at `/api/projects/:team_id/hog_flows/` (`products/workflows/backend/routes.py` L21).

- **Pagination:** `HogFlowPagination(LimitOffsetPagination)`, `default_limit = 100`, `max_limit = 500` (L3892). Response `{count, next, previous, results}`.
- **Order:** `order_by("-updated_at", "-id")` for `list` (`safely_get_queryset`, ~L4150). No `ordering` param.
- **Filters:**

| Param | Behavior | Where |
|---|---|---|
| `id`, `created_at`, `updated_at`, `status`, `origin_product` | exact match (`HogFlowFilterSet.Meta.fields`) | L3884 |
| `created_by` | user **uuid** | `safely_get_queryset` |
| `type` | comma list of `messaging`, `automation`, `loop`, `broadcast` (`workflow_type_q`: loop/broadcast by `origin_product`, messaging by JSON containment on `actions`) | L3818-3838 |
| `broadcast_eligible=true` | batch trigger + exactly one email step, evaluated with `jsonb_path_*` in Postgres (`annotate_broadcast_shape`) | L3850-3881 |
| `trigger` | JSON object, `trigger__contains` (e.g. `{"type":"event"}`) | ~L4193 |
| `search` | max 200 chars; spaces match `[\s\-_]*`; name/description first, and only if nothing matches, step names and email subject/preheader/body in live `actions` and `draft` | `filter_queryset` ~L4206 |

- **Serializer:** `get_serializer_class` (~L4127). The web list gets `HogFlowMinimalSerializer` (~L2813): `id, name, description, version, status, origin_product, created_at, created_by, updated_at, trigger, trigger_masking, conversion, exit_condition, email_sending_rate_limit, edges, actions, draft, abort_action, variables, billable_action_types, user_access_level`. This is heavy: every row carries all steps (email HTML can be tens of KB per step). MCP clients (`x-posthog-client: mcp`) get the light `HogFlowSummarySerializer` (~L2885) with no `actions`/`edges`. The detail `HogFlowSerializer` (~L2907) adds `schedules`, `draft_updated_at`, `action_redirects`, `email_sending_paused_*`, `email_sending_resumed_at`.
- The JSON-containment and `jsonb_path_exists` patterns in `workflow_type_q` and `annotate_broadcast_shape` are the template for new server filters such as "sends SMS" or "sends from integration N".
- **Other list-level endpoints:** `POST hog_flows/bulk_delete/` (`{ids}`), `GET hog_flows/metrics/global/`, `GET hog_flows/reputation/`.

### A6. Metrics for "last 7 days"

- **Per row (used today):** the frontend `AppMetricsSparkline` runs a HogQL query over `app_metrics` with `app_source = 'hog_flow_version'`, `app_source_id` prefix `<flow id>/`, run-level rows (`instance_id = ''`), metrics `triggered`, `succeeded`, `failed`, daily, `-7d` (`WorkflowsTable.tsx` L242-275, `frontend/src/lib/components/AppMetrics/appMetricsLogic.ts`).
- **Batched totals (exists, unused by the list):** `GET /api/projects/:id/hog_flows/metrics/global/?after=-7d&before=` (`metrics_global`, `api/hog_flow.py` L5449). Returns `[{workflow_id, succeeded, failed}]` for every accessible workflow, sorted by `failed` desc (`WorkflowStatsRowSerializer`, ~L1012). It uses `fetch_app_metric_totals_by_source` with the viewset `app_source = "hog_flow"`. No daily series, no `triggered`.
- Per-workflow detail endpoints: `GET hog_flows/:id/metrics/` and `metrics/totals/` (from `AppMetricsMixin`).

### A7. Templates

#### Workflow templates: `HogFlowTemplate`

Model `products/workflows/backend/models/hog_flow/hog_flow_template.py`, table `hogflow_templates`:
`name`, `description`, `image_url`, `tags` (ArrayField of strings), `scope` (`team`, `organization`, `global`), `team`, `created_at`, `created_by`, `updated_at`, `trigger`, `trigger_masking`, `conversion`, `exit_condition`, `edges`, `actions`, `abort_action`, `variables`. No `status`, no folder.

API `products/workflows/backend/api/hog_flow_template.py`, routed at `/api/projects/:id/hog_flow_templates/` (`routes.py` L32):

- `HogFlowTemplateViewSet.dangerously_get_queryset` returns team templates plus `organization`-scoped templates from any team in the org, excluding DB `global` rows, ordered `-updated_at`.
- `list()` puts **global templates loaded from code files** (`products/workflows/backend/templates/*.json`, 18 files) first, then DB templates, then paginates the combined Python list with the default `LimitOffsetPagination` (`PAGE_SIZE = 100`, `posthog/settings/web.py` L526-529).
- No search, scope or tag filters on the server.
- `PreventGlobalTemplateDatabaseOperations` blocks creating or updating `global` rows through the API.
- `PublicHogFlowTemplateViewSet` serves the global file templates without auth.
- Global template JSON files carry `scope: "global"` and the same keys as the serializer, but no `tags` key (e.g. `welcome_email_sequence_template.json`).

#### Email message templates: `MessageTemplate` (what the Library tab shows)

Model `products/messaging/backend/models/message_template.py`, table `posthog_messagetemplate`:
`team`, `name`, `description`, `created_at`, `updated_at`, `created_by`, `message_category` (FK `MessageCategory`, nullable), `content` (JSON: `{templating, email: {subject, text, html, design, from?, ...}}`), `type` (default `email`), `deleted`. No scope, no tags.
API `products/messaging/backend/api/message_templates.py` `MessageTemplatesViewSet`, routed at `/api/projects/:id/messaging_templates/` (`products/messaging/backend/routes.py`), team-only, `deleted=False`, ordered `-created_at`, default pagination.

### A8. Creating workflows programmatically (for the seeding worker)

**Endpoint:** `POST /api/projects/:team_id/hog_flows/` with the body below. Tests do exactly this (`products/workflows/backend/api/test/test_hog_flow.py`, `_create_hog_flow_with_action`).

**Validation rules** (`HogFlowSerializer.validate` and helpers in `products/workflows/backend/api/hog_flow.py`):

- `actions` is required, with exactly one `type: "trigger"` step. `trigger` is copied from it. Duplicate step ids are rejected.
- Function steps must name a `template_id` that exists as a `HogFunctionTemplate` in the database. Tests call `sync_template_to_db(...)` first. On a dev stack the templates must be synced.
- Inputs are validated against the template's `inputs_schema` (required inputs, integration inputs, `native_email` rules).
- **Strictness depends on the caller** (`_should_validate_strictly`, L832). Active flows always validate fully. Drafts validate fully for API/MCP callers, and leniently only for the web app session (`EventSource.WEB`). Graph wiring (`graph_validation.py`) is enforced only under strict validation.
- Email senders: `from.integrationId` must resolve to an email integration of the team, and an override `from.email` must be on its verified domain.
- Row-scoped triggers force `exit_only_at_end`.

**Seeding at scale:** the cheapest path for hundreds of rows is the ORM (`HogFlow.objects.create(team=..., name=..., status=..., trigger=<trigger config>, actions=[...], edges=[...], billable_action_types=[...], created_by=...)`), because the model does not validate. Set `trigger` to the trigger step's `config` and compute `billable_action_types` yourself. Each save publishes a worker reload. Draft rows skip integration checks entirely this way. For flows that must pass the API, create them as `draft` from a web session, or create the `email`, `slack` and `twilio` integrations first.

`created_at`/`updated_at` are `auto_now_add`/`auto_now`. Spread seeded dates with a follow-up `HogFlow.objects.filter(pk=...).update(updated_at=...)`.

Every example below is a full `POST` body. The edges run trigger → step → exit. Swap the trigger step or the middle step to combine.

**Skeleton (event trigger + exit only):**

```json
{
  "name": "Onboarding:: welcome",
  "description": "Owner: @dana",
  "status": "draft",
  "actions": [
    {
      "id": "trigger_node",
      "name": "Trigger",
      "type": "trigger",
      "config": {
        "type": "event",
        "filters": {
          "events": [{ "id": "user signed up", "name": "user signed up", "type": "events", "order": 0 }]
        }
      }
    },
    { "id": "exit_node", "name": "Exit", "type": "exit", "config": { "reason": "Default exit" } }
  ],
  "edges": [{ "from": "trigger_node", "to": "exit_node", "type": "continue" }]
}
```

**Trigger step `config` per type** (replace the trigger step's `config`):

```json
{ "type": "event", "filters": { "events": [{ "id": "$pageview", "name": "$pageview", "type": "events", "order": 0 }] } }
```

```json
{ "type": "schedule" }
```

Then `POST /api/projects/:id/hog_flows/:flow_id/schedules/` with `{"rrule": "FREQ=WEEKLY;BYDAY=MO", "starts_at": "2026-10-05T09:00:00Z", "timezone": "Europe/Berlin"}`.

```json
{
  "type": "webhook",
  "template_id": "template-source-webhook",
  "inputs": {
    "event": { "order": 0, "value": "invoice paid" },
    "distinct_id": { "order": 1, "value": "{request.body.user_id}" }
  }
}
```

```json
{
  "type": "manual",
  "template_id": "template-source-webhook",
  "inputs": {
    "event": { "order": 0, "value": "$workflow_triggered" },
    "distinct_id": { "order": 1, "value": "{request.body.user_id}" },
    "method": { "order": 2, "value": "POST" }
  }
}
```

```json
{
  "type": "tracking_pixel",
  "template_id": "template-source-webhook-pixel",
  "inputs": {
    "event": { "order": 0, "value": "email opened" },
    "distinct_id": { "order": 1, "value": "{request.query.distinct_id}" }
  }
}
```

```json
{
  "type": "batch",
  "filters": {
    "audience_type": "persons",
    "properties": [{ "key": "plan", "type": "person", "value": ["trial"], "operator": "exact" }]
  }
}
```

```json
{ "type": "data-warehouse-table", "table_name": "stripe_invoice", "filters": { "properties": [] }, "key_property": "id" }
```

```json
{
  "type": "internal-event",
  "filters": {
    "source": "internal-events",
    "events": [{ "id": "$slack_message_received", "name": "$slack_message_received", "type": "events", "order": 0 }],
    "properties": [{ "key": "channel", "type": "event", "value": "C0EXAMPLE", "operator": "exact" }]
  }
}
```

**Dispatch step per channel** (use as the middle step with id `step_1`, edges `trigger_node → step_1 → exit_node`). Integration ids (`123`, `456`, `789`) and category UUIDs are placeholders for rows the seeder creates first.

Email:

```json
{
  "id": "step_1",
  "name": "Welcome email",
  "type": "function_email",
  "config": {
    "template_id": "template-email",
    "message_category_type": "transactional",
    "inputs": {
      "email": {
        "templating": "liquid",
        "value": {
          "to": { "email": "{{ person.properties.email }}", "name": "" },
          "from": { "integrationId": 123, "email": "hello@example.com", "name": "Example Team" },
          "subject": "Welcome to Example",
          "preheader": "Getting started",
          "html": "<p>Hi {{ person.properties.first_name }}, welcome aboard.</p>",
          "text": "Hi, welcome aboard."
        }
      }
    }
  }
}
```

SMS:

```json
{
  "id": "step_1",
  "name": "Trial reminder SMS",
  "type": "function_sms",
  "config": {
    "template_id": "template-twilio",
    "message_category_type": "marketing",
    "inputs": {
      "twilio_account": { "value": 456 },
      "from_number": { "value": "+15550100000" },
      "to_number": { "value": "{{ person.properties.phone }}" },
      "message": { "value": "Your trial ends in 3 days." }
    }
  }
}
```

Push:

```json
{
  "id": "step_1",
  "name": "Streak push",
  "type": "function_push",
  "config": {
    "template_id": "template-native-push",
    "inputs": {
      "distinctId": { "value": "{{ person.distinct_id }}" },
      "channels": { "value": [789] },
      "title": { "value": "Keep your streak" },
      "body": { "value": "You are one day away from a new record." }
    }
  }
}
```

Slack:

```json
{
  "id": "step_1",
  "name": "Notify sales",
  "type": "function",
  "config": {
    "template_id": "template-slack",
    "inputs": {
      "slack_workspace": { "value": 321 },
      "channel": { "value": "C0EXAMPLE" },
      "blocks": { "value": [{ "type": "section", "text": { "type": "mrkdwn", "text": "New signup: {{ person.properties.email }}" } }] }
    }
  }
}
```

Webhook:

```json
{
  "id": "step_1",
  "name": "Sync to CRM",
  "type": "function",
  "config": {
    "template_id": "template-webhook",
    "inputs": {
      "url": { "value": "https://crm.example.com/hooks/posthog" },
      "method": { "value": "POST" },
      "body": { "value": { "email": "{{ person.properties.email }}" } }
    }
  }
}
```

Non-dispatch steps for variety: `{"type": "delay", "config": {"delay_duration": "2d"}}`, `{"type": "wait_until_condition", "config": {"condition": {"filters": {...}}, "max_wait_duration": "7d"}}`, `{"type": "conditional_branch", "config": {"conditions": [{"filters": {...}}]}}` (branch edges carry `index`), `{"type": "random_cohort_branch", "config": {"cohorts": [{"percentage": 50}, {"percentage": 50}]}}`.
Loop-owned and broadcast-owned rows: set `origin_product` to `loops` or `broadcasts` (ORM only; the list shows them as Loop / excludes broadcasts).

A workflow template (`POST /api/projects/:id/hog_flow_templates/`) takes the same `trigger`/`actions`/`edges` plus `name`, `description`, `image_url`, `tags` and `scope` (`team` or `organization`). An email message template (`POST /api/projects/:id/messaging_templates/`) takes `name`, `description`, `message_category`, `type: "email"`, and `content: {templating: "liquid", email: {subject, html, text, design?}}`.

Existing management commands in `products/workflows/backend/management/commands/` are migrations and backfills. None seeds workflows.

---

## B. Frontend

Source: PostHog repo at commit `74299d1d61f`. All paths are repo-relative. Line numbers are from that commit.
Scope: the Workflows list scene, its filters and columns, the Library tab, template chooser, TS types, and what a redesign (one search bar with filter pills, folders/tags, grouping, list/tile switch, templates in the same tree, per-workflow sender addresses) can reuse versus what needs backend work.

#### TL;DR

- The list is **server-paginated** (30 per page, limit/offset) and **server-filtered** (search, status, type, trigger, created_by). Each filter change reloads the page from `GET hog_flows`. Only the Name column sort is client-side, and only within the current page.
- The list response carries the **full workflow** (actions, edges, trigger, draft), so everything derived from a workflow's own steps (type tag, dispatch badges, email subjects, sender integration/address) is computable on the client **per loaded row**.
- Cross-list facts (facet counts, grouping across pages, "all workflows sending from X") need either load-all or backend aggregation.
- "Last 7 days" is **one HogQL query per row**, lazily fired when the row scrolls into view.
- **No folders, no tags, no project-tree items** exist for individual workflows. Only workflow **templates** have `tags` and `scope`.
- The "Library" tab lists **email message templates** (`messaging_templates`), **not** workflow templates. Workflow templates (`hog_flow_templates`) only appear in the "Create a workflow" modal.

---

### B1. List table and its logic

Files:

- Component: `products/workflows/frontend/Workflows/WorkflowsTable.tsx` (`WorkflowsTable`, L109-447)
- Logic: `products/workflows/frontend/Workflows/workflowsLogic.ts` (`workflowsLogic`, L252-552)
- API client: `frontend/src/lib/api.ts` `hogFlows.getHogFlows` (object from ~L6396, `type` joined with commas at L6407-6411), URL builder `hogFlows()` → `hog_flows` (L1967). `HogFlowListType = 'messaging' | 'automation' | 'loop' | 'broadcast'` (L489).
- Backend list: `products/workflows/backend/api/hog_flow.py` `HogFlowViewSet` (L4036).

#### Loading

| Aspect | How | Where |
|---|---|---|
| API call | `api.hogFlows.getHogFlows(values.paramsFromFilters)` in the `workflows` loader. `breakpoint()` drops stale responses. | `workflowsLogic.ts` L311-316 |
| Pagination | Server-side limit/offset. `WORKFLOWS_PER_PAGE = 30`. `offset = (page-1)*30`. The table uses `PaginationManual` with `controlled: true` and `entryCount: workflows.count`. | L46, L418-442 |
| Backend page size | `HogFlowPagination`, default 100, max 500. The frontend always sends `limit=30`. | `hog_flow.py` L3892 |
| Reload triggers | Mount (`useOnMountEffect` → `loadWorkflows`), every `setFilters` (300 ms debounce), and after toggle/duplicate/archive/restore/delete. Mutations reload instead of patching in place. | `WorkflowsTable.tsx` L134-145, `workflowsLogic.ts` L318-413, L455-459 |
| Page overflow | If `page > lastPage` after a load, jump to the last page. | L460-467 |
| Response shape | `CountedPaginatedResponse<HogFlow>`. The web list uses `HogFlowMinimalSerializer` (`hog_flow.py` L2813), which despite its name includes `actions`, `edges`, `draft`, `variables`, `trigger`, `conversion`. MCP requests get the metadata-only `HogFlowSummarySerializer` (L2885). | `hog_flow.py` `get_serializer_class` L4127 |
| Duplicate | `prepareWorkflowDuplicate(workflow)` spreads the list row and POSTs it. This relies on the list row carrying full actions/edges. | `workflowDuplication.ts` L3-17 |

#### Filters (all server-side)

`WorkflowsFilters = { search, createdBy, status, type, triggerType, page }` (L48-55). `paramsFromFilters` maps them to query params (L418-433).

| Filter | UI control | Client value | Query param sent | Server implementation |
|---|---|---|---|---|
| Search | `LemonInput type="search"` (L366-371) | `filters.search` | `search` | `filter_queryset` `hog_flow.py` L4206-4231. Max 200 chars. Case-insensitive, a space also matches `-`/`_`. Matches name/description first. If none match, it searches step names and email subject/preheader/body (live and draft). |
| Status | `LemonSelect` All/Active/Draft/Archived (L376-387) | `'all' \| 'active' \| 'draft' \| 'archived'` | `status` (omitted for `all`) | `HogFlowFilterSet` exact filter (L3884) |
| Type | `LemonSelect` All/Messaging/Automation/Loop (L391-402) | `'all' \| 'messaging' \| 'automation' \| 'loop'` | `type` = `[type]`, or `['messaging','automation','loop']` for All (L24, L427). This excludes `broadcast`. | `workflow_type_q` (L3824), `WORKFLOW_TYPES` (L3818) |
| Trigger | `LemonSelect` from `WORKFLOW_TRIGGER_TYPE_OPTIONS` (L406-411) | 10 values (L31-42) | `trigger = JSON.stringify({type})` | JSON containment `trigger__contains` (L4193) |
| Created by | `MemberSelect` (L416-419) | user **uuid** | `created_by` | L4156 |
| Page | table pagination | number | `limit`/`offset` | limit/offset |

Other server params not used by this page: `broadcast_eligible`, `origin_product`, plus exact filters on `id`, `created_at`, `updated_at` (`hog_flow.py` L3884, L3999-4034).

Any non-page filter change resets `page` to 1 (reducer L272-280).

#### Sorting

- Server order is fixed: `order_by("-updated_at", "-id")` (`hog_flow.py` L4153). No `ordering` param exists.
- `LemonTable` has `defaultSorting={{ columnKey: 'updatedAt', order: 1 }}` (`WorkflowsTable.tsx` L439), and the Name column has a client `sorter` (L176). Because pagination is controlled and server-side, column sorting only reorders the **current 30-row page**.

#### URL sync

- `actionToUrl` on `setFilters` writes `search`, `created_by`, `status`, `type`, `trigger_type`, `page` (only non-default values) with `replace: true` (L506-531).
- `urlToAction` on `urls.workflows()` parses and validates the same keys, then calls `setFilters(parsed, true)` if they differ (L532-551).
- `workflowsLogic` is keyed to the constant `'workflowsLogic'` (L253), so it survives tab switches. That is why the table reloads on mount.

#### Columns (in order)

| # | Column | Render | Where |
|---|---|---|---|
| 0 | Checkbox (archived status filter only) | bulk select, "Delete selected" → `api.hogFlows.bulkDeleteHogFlows` | L150-172, L423-432, logic L471-504 |
| 1 | Name | `LemonTableLink` to `urls.workflow(id,'workflow')` with description. Archived rows are muted text with a tooltip. Below it, `WorkflowStepMatches` shows up to 3 step/email matches for the current search. | L173-197, `WorkflowStepMatches.tsx` |
| 2 | Type | `WorkflowTypeTag` | L40-60, L198-204 |
| 3 | Trigger | `LemonTag` with `capitalizeFirstLetter(item.trigger?.type ?? 'unknown')`, linking to `?node=trigger_node` | L205-215 |
| 4 | Dispatches | `WorkflowActionsSummary` | L62-107, L216-222 |
| 5 | Created by | `ProfilePicture` plus first name or email | L223-237 |
| 6 | Updated | `updatedAtColumn()` from `lib/lemon-ui/LemonTable/columnUtils` | L238-241 |
| 7 | Last 7 days | `AppMetricsSparkline` | L242-275 |
| 8 | Status | `LemonTag` from `STATUS_CONFIG` (active=success, draft=default, archived=muted) | L34-38, L276-283 |
| 9 | More menu | Enable/Disable (`toggleWorkflowStatus`), Duplicate, Archive/Restore, Delete (archived only). Gated by `AccessControlAction` on `workflow.user_access_level`. | L284-359 |

Client-side search highlighting: `findMatchingWorkflowSteps(workflow, search)` (`workflowSearchMatches.ts` L96-114) re-runs the server's match rule (`workflowSearchRegex` L61-67) on the loaded row. It explains why a row matched when the name and description did not. It checks step names, then email subject, preheader, and body text of `function_email` steps, in live and draft actions.

---

### B2. Type, dispatch badges, trigger display

#### Type tag: `WorkflowTypeTag` (`WorkflowsTable.tsx` L40-60)

1. `workflow.origin_product === 'loops'` → **Loop** (`LemonTag type="highlight"`, links to `urls.codeLoopLink(id)`).
2. Else, if any action type is in `['function_email','function_sms','function_push']` → **Messaging** (`type="completion"`).
3. Else → **Automation**.

The comment says this must stay in sync with backend `MESSAGING_ACTION_TYPES` (`products/workflows/backend/models/hog_flow/hog_flow.py` L81), which the server `type` filter uses. `OriginProduct` values are `loops` and `broadcasts`. Broadcast rows are excluded from this page by the `type` param. Only live `workflow.actions` count, not `workflow.draft.actions`.

#### Dispatch badges: `WorkflowActionsSummary` (`WorkflowsTable.tsx` L62-107)

- For each action, it calls `getHogFlowStep(action, {})` (`products/workflows/frontend/Workflows/hogflows/steps/HogFlowSteps.tsx` L271-297). It keeps only steps whose `type` starts with `function`.
- Grouping key: `action.config.template_id` if present, else `action.type`. So `function_email` (`template_id: 'template-email'`) and a legacy `function` step with `template-email` share one badge. Every other `function` destination gets its own badge per template id.
- Each badge is `{icon} {count}` on `${color}20` with text in `color`. The whole cell links to the editor.
- Icons and colors come from `HogFlowStepConfigs` (`HogFlowSteps.tsx` L122-268):

| Action | Icon | Color |
|---|---|---|
| `function_email` | `IconLetter` | `#2F80FA` |
| `function_sms` | `IconTwilio` | `#f22f46` |
| `function_push` | `IconNotification` | `#F44D01` light / `#F8BE2A` dark |
| `function` + `template-email` | `IconLetter` | `#2F80FA` |
| `function` + `template-webhook` | `IconWebhooks` | `#6500ae` / `#B52AD9` |
| `function` + `template-native-push` | `IconNotification` | orange/yellow |
| `function` + any other template (Slack etc.) | template `icon_url` if found in `hogFunctionTemplatesById`, else `IconBolt` | orange/yellow |

- **Gotcha:** the table passes `{}` as `hogFunctionTemplatesById` and uses the default `isDarkModeOn=false`. So Slack and other destination templates always render as a generic `IconBolt` in the list, and colors are always light-mode. The editor path `useHogFlowStep` (L299-311) uses the real map from `workflowLogic` plus `themeLogic`.

#### Trigger display

- List column: raw `trigger.type` capitalized (`WorkflowsTable.tsx` L211). For example `data-warehouse-table` shows as "Data-warehouse-table", and `batch` shows as "Batch".
- Nicer labels exist elsewhere and are not used by the list:
  - `TRIGGER_PREVIEWS` / `getTriggerPreviews` (`HogFlowSteps.tsx` L68-106): labels plus icons, e.g. batch → "Audience" + `IconPeople`, schedule → `IconClock`, and the event name and filter count.
  - `WORKFLOW_TRIGGER_TYPE_OPTIONS` (`workflowsLogic.ts` L31-42): filter labels.
  - `TRIGGER_LABELS` / `getTemplateTrigger` (`templates/workflowTemplateDisplay.ts` L3-34): "Starts on an event", and so on.
  - Registered sub-trigger types (survey, support, etc.) are `event` triggers told apart by `matchConfig`. See `hogflows/registry/triggers/triggerTypeRegistry.ts` L21-58 (`getRegisteredTriggerTypes`). The list collapses them all to "Event".

---

### B3. "Last 7 days" metrics column

- Component: `AppMetricsSparkline` (`frontend/src/lib/components/AppMetrics/AppMetricsSparkline.tsx`), one per row, `logicKey={id}` (`WorkflowsTable.tsx` L248-271).
- Logic: `appMetricsLogic` (`frontend/src/lib/components/AppMetrics/appMetricsLogic.ts`). `loadAppMetricsTimeSeries` (L157+) builds a HogQL query over `app_metrics` and runs `api.queryHogQL(..., { refresh: 'force_blocking' })` (L255-259).
- Params (`forceParams`): `appSource: 'hog_flow_version'`, `appSourceIdPrefix: '<id>/'`, `instanceId: ''` (run-level rows only), `metricName: ['triggered','succeeded','failed']`, `breakdownBy: 'metric_name'`, `interval: 'day'`, `dateFrom: '-7d'`. The labels are Started / Completed / Failed, drawn as lines.
- **Per-row, not batched.** It is lazy: `useInView({ triggerOnce: true })` loads when the row scrolls into view (`AppMetricsSparkline.tsx` L36-44). A 30-row page means up to 30 HogQL queries.
- A batched alternative already exists in the same file: `loadAppMetricsTotals` (L91-155) supports `breakdownBy: [..., 'app_source_id']` and `limit`. One grouped query could return totals for many workflows, but it gives totals, not daily series. It would need a `splitByAll`-style extension for sparklines.

---

### B4. Scene and tabs

- Scene: `products/workflows/frontend/WorkflowsScene.tsx`. `workflowsSceneLogic` (L66-115) and the `WorkflowsScene` component (L125-180).
- Tab keys: `WORKFLOW_SCENE_TABS = ['workflows','library','channels','opt-outs','suppression','reputation']` (L28).
- Shared messaging tabs: `products/workflows/frontend/messagingTabs.tsx`. `MESSAGING_NAV_TAB_KEYS` (L12) are "pinned" URL path segments shared with `/broadcasts`.

| Key | Label | Component | URL |
|---|---|---|---|
| `workflows` | Workflows | `WorkflowsTable` | `/workflows` |
| `library` | Library | `MessageTemplatesTable` (`TemplateLibrary/MessageTemplatesTable.tsx`) | `/workflows/library` |
| `channels` | Channels | `MessageChannels` (`Channels/MessageChannels.tsx`) | `/workflows/channels` |
| `opt-outs` | Opt-outs | `OptOutScene` (`OptOuts/OptOutScene.tsx`) | `/workflows/opt-outs` |
| `suppression` | Suppression list | `SuppressionScene` | `/workflows/suppression` |
| `reputation` | Reputation (Beta tag) | `WorkflowsReputation` | `/workflows/reputation` |

- Header actions: "New workflow" (`data-attr="new-workflow"`) appears only on the `workflows` tab. It calls `addProductIntent` and `newWorkflowLogic.startNewWorkflow` (L148-168). Other tabs render `MessagingTabActions` (L169-171).
- `EmailSuspensionBanner` sits above the tabs. `NewWorkflowModal` is always mounted in the scene (L175-177).
- Empty state: `emptyState/workflowsEmptyState.tsx` gates only the `workflows` tab (L21). Its preview is a static example-data mini canvas (`emptyState/WorkflowsPreview.tsx`).

#### Routes and URLs (`products/workflows/manifest.tsx`, mirrored in `frontend/src/products.tsx` L290-297)

| Route | Scene |
|---|---|
| `/workflows`, `/workflows/:tab` | `Workflows` (L49-50) |
| `/workflows/:id/:tab` | `Workflow` editor (L51) |
| `/workflows/library/templates/:id`, `/workflows/library/templates/new`, `...new?messageId=` | `WorkflowsLibraryTemplate` (message template editor, L52-57) |
| `/broadcasts[...]` | Broadcasts scenes (L58-67) |

URL helpers (L70-80): `workflows(tab?)`, `workflow(id, tab)`, `workflowNew()` = `/workflows/new/workflow`, `workflowsLibraryTemplate(id)`, `workflowsLibraryTemplateNew()`, `workflowsLibraryTemplateFromMessage(id)`, `workflowsLibraryMessage(id)`.

New-workflow URL params, read by `workflowLogic` props (`Workflows/workflowLogic.ts` L59-64): `templateId`, `editTemplateId`, trigger prefill (`TRIGGER_PREFILL_PARAM`), and `mode=editor|ai` (`newWorkflowLogic.ts` L15-17).

---

### B5. Library tab (email message templates)

- Component: `products/workflows/frontend/TemplateLibrary/MessageTemplatesTable.tsx` (grid of `MessageTemplateCard`, `MessageTemplatesGrid.scss`).
- Logic: `TemplateLibrary/messageTemplatesLogic.ts`.
- API: `api.messaging.getTemplates()` (`frontend/src/lib/api.ts` ~L6370-6394, URL `messaging_templates` L1921). The loader keeps `response.results` only, with **no pagination handling** (L158-161). Create, update, and duplicate go through `api.messaging.*`. Delete uses `deleteWithUndo` on `environments/:team/messaging_templates` (L162-176).
- Type: `TemplateLibrary/types.ts` `MessageTemplate { id, name, description, content: { templating: 'liquid'|'hog', email: EmailTemplate }, created_at, updated_at, created_by }`. There is **no scope and no tags**, so these templates are team-only.
- Card fields (`MessageTemplateCard.tsx`): a sandboxed `iframe` preview of `content.email.html` (else a fallback cover image), name, description (1-line clamp), creator avatar, `TZLabel(created_at)`. Card menu: Duplicate, Delete.
- Filters: **client-side**. `search` over name and description (substring) plus `createdByFilter` (user numeric **id**, unlike the workflows list, which uses uuid) (`messageTemplatesLogic.ts` L220-239). No URL sync.
- Other: `ProductIntroduction` when empty; an invisible `MaxTool identifier="create_message_template"`. Click goes to `urls.workflowsLibraryTemplate(id)` (`MessageTemplate.tsx` scene).

#### How message templates relate to workflows

- In the email step editor, `emailTemplaterLogic` (`frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx`) loads `templates: MessageTemplate[]`. `applyTemplate` **copies** `template.content.email` into the step's email value (L725-734). `appliedTemplate` is only in-memory reducer state (L449-454).
- **The web editor stores no reference to the message template.** API-authored steps may keep `config.template_uuid` as provenance (section A4), so "which workflows use library template X" is answerable only for those.

#### Workflow templates (`hog_flow_templates`) are not in the Library tab

They appear only in the **"Create a workflow" modal** (`Workflows/NewWorkflowModal.tsx`):

- Logic: `Workflows/templates/workflowTemplatesLogic.ts`. `api.hogFlowTemplates.getHogFlowTemplates()` takes no params (`api.ts` L6518-6536) and loads once on mount (L203-205).
- Client-side filters: Fuse search over `name` (weight 2) and `description` (`threshold 0.3`) (L125-134), plus a single **tag** filter (L146-157). `availableTags` is the sorted union of template tags (L163-172). URL sync writes `templateFilter` and `tagFilter` onto `/workflows` search params (L174-202).
- Chooser: `templates/WorkflowTemplateChooser.tsx`. A "Blank workflow" card, then one `WorkflowTemplateCard` per template:
  - `preview`: `WorkflowTemplateSteps` shows up to 4 step icon tiles in canvas order via `getOrderedActions` (BFS over edges) and `getHogFlowStep(action, {})`, plus "+N".
  - `badge`: `WorkflowTemplateAiBadge` when `isAiTemplate` (tag `ai` or an AI step template id).
  - `footer`: `WorkflowTemplateMeta` shows how it starts (`getTemplateTrigger`) and the scope label ("Team template" / "Organization template"; global gets no label) (`workflowTemplateDisplay.ts` L15-39).
  - Menu: **Edit** (`/workflows/new/workflow?editTemplateId=`; for global templates only when `user.is_staff`) and **Delete** (not for global).
- Use template: `newWorkflowLogic.createWorkflowFromTemplate` hides the modal and pushes `urls.workflowNew()` with `?templateId=<id>` (`newWorkflowLogic.ts` L167-170). `workflowLogic` takes `templateId` as a prop (`workflowLogic.ts` L59-64).
- Blank: `createEmptyWorkflow` (L171-177). The modal also opens via the `#newWorkflow` hash (L179-201). Behind the `WORKFLOWS_AI_FIRST_NEW` flag, "New workflow" opens an AI composer instead (L152-162).
- Save as template: `templates/SaveAsTemplateModal.tsx` plus `workflowTemplateLogic.ts`. Fields: name, description, image_url, tags (free-form multi-select seeded from `availableTags`), scope (`team` "This project only", `organization` "All projects in organization", `global` "Official", staff only). Staff with global scope get "See JSON" instead of saving (global templates live in code).
- Backend (`products/workflows/backend/api/hog_flow_template.py`):
  - `HogFlowTemplateViewSet` L222. The queryset returns team templates plus org-scoped templates from any team in the org, minus DB `global` rows, ordered `-updated_at` (L231-242).
  - `list()` puts file-based global templates first, then DB templates, and paginates in Python (L244-268).
  - **No search, scope, or tag params.**
  - Scope enum `team | organization | global` (`models/hog_flow/hog_flow_template.py` L33-38; generated `HogFlowTemplateScopeEnumApi`).
  - `tags` is an ArrayField (L43).
  - Serializer fields (L139-156): id, name, description, image_url, tags, scope, created_at, created_by, updated_at, trigger, trigger_masking, conversion, exit_condition, edges, actions, abort_action, variables.

---

### B6. Frontend TS types

| Type | Location | Notes |
|---|---|---|
| `HogFlow` | `products/workflows/frontend/Workflows/hogflows/types.ts` L19-73 (zod `HogFlowSchema`), interface L92-113 | Handwritten zod plus extras: `created_by`, `origin_product` (generated `HogFlowOriginProductEnumApi`), `user_access_level`, `draft`, `draft_updated_at`, `email_sending_paused_*` |
| `HogFlowTemplate` | same file, `HogFlowTemplateSchema` L75-79, interface L131-133 | `HogFlow` minus `status`, plus `image_url`, `tags: string[]` (default `[]`), `scope: 'team'\|'global'\|'organization'` |
| `HogFlowAction` | `types.ts` L118 = `z.infer<typeof HogFlowActionSchema>` | union defined in `hogflows/steps/types.ts` L218-407 |
| `HogFlowTriggerSchema` | `hogflows/steps/types.ts` L149-213 | discriminated on `type` |
| `MessageTemplate` | `TemplateLibrary/types.ts` | handwritten |
| `EmailTemplate`, `EmailTemplateFrom` | `frontend/src/scenes/hog-functions/email-templater/types.ts` L10-29 | |
| Generated API types | `products/workflows/frontend/generated/api.schemas.ts`, `api.ts` (hog_flow_templates ~L108, hog_flows ~L253), `api.zod.ts` | The list does **not** use them. It uses `lib/api` plus the handwritten zod types. |

Action `type` union (`steps/types.ts`): `trigger`, `conditional_branch`, `random_cohort_branch`, `delay`, `wait_until_condition`, `wait_until_time_window`, `function`, `function_email`, `function_sms`, `function_push`, `exit`.
Helpers (L409-445): `isOptOutEligibleAction`, `isEmailAction`, `isPushAction`, `isFunctionAction`, `isTriggerFunction`, `isScheduleTrigger`.

Trigger `type` union: `event`, `webhook`, `manual`, `tracking_pixel`, `schedule`, `batch`, `data-warehouse-table`, `internal-event`, `data-warehouse-view`. `SCHEDULED_TRIGGER_TYPES = ['batch','schedule']` (L216). The backend `TRIGGER_TYPES` is at `hog_flow.py` model L46.

#### Email action config shape (`steps/types.ts` L361-375)

```
{ type: 'function_email', config: {
    message_category_id?, message_category_type?: 'marketing'|'transactional',
    tracking_enabled?: boolean,
    template_uuid?, template_id: 'template-email',
    inputs: Record<string, { value, templating?, secret?, bytecode?, order? }> } }
```

- All email content sits in the loosely typed `config.inputs.email.value` (`z.any()`), with the shape `EmailTemplate`:
  - `{ design, html, subject, text, from, to, replyTo?, cc?, bcc?, preheader? }`
- **From address:** `from: string | EmailTemplateFrom`. For native email it is `{ integrationId?, integrationIds? (rotation, max `MAX_WORKFLOW_EMAIL_SENDERS = 10`), email?, name? }` (`email-templater/types.ts` L5-15).
  - `integrationId(s)` point to an `email` integration (a Channel). Its domain is `integration.config.domain` and its verification is `config.verified` (`Channels/messageChannelLogic.ts` L38-65).
  - `email` and `name` are optional templated overrides.
- **Recipient:** the list preview reads `inputs.email.value.to.email` (`HogFlowSteps.tsx` L199-200), and the story fixture uses `to: { email }`. But `EmailTemplate.to` is typed `string`, so the runtime shape and the TS type disagree. Treat `to` defensively.
- **Subject:** `inputs.email.value.subject`. Search matching reads `subject`, `preheader`, `text`/`html` (`workflowSearchMatches.ts` L76-88).
- **Template reference:** not persisted by the web editor (see B5); API callers may leave `config.template_uuid` (see A4). `config.template_id` is the hog *function* template (`template-email`), not a library template.
- SMS: `function_sms`, `template_id: 'template-twilio'`, recipient `inputs.phoneNumber.value`. Push: `function_push`, `template-native-push`, title `inputs.title.value`.

---

### B7. Folders, project tree, tags, "new workflow" modal

- **Project tree / FileSystem:** the manifest declares `fileSystemTypes.workflows` (name "Workflow", `href: urls.workflow(ref,'workflow')`, `filterKey: 'workflows'`) and `treeItemsProducts` "Workflows" and "Broadcasts" under `ProductItemCategory.MESSAGING` (`manifest.tsx` L82-112). The icons are `IconDecisionTree` and `IconSend` (`frontend/src/layout/panel-layout/ProjectTree/defaultTree.tsx` L216-220).
  - The backend `HogFlow` model is a plain `UUIDTModel` (`models/hog_flow/hog_flow.py` L110) with **no `FileSystemSyncMixin`** and no file-system representation. So individual workflows are **not** tree items, and there is no "Save to folder" (`SaveToFolder` / `_create_in_folder` have no hits in `products/workflows`). The tree only has the product shortcut.
  - Dead call: `workflowsLogic` calls `deleteFromTree('hog_flow/', id)` on delete (L399, L489). Nothing writes `hog_flow/` entries, and the prefix does not match the manifest type key `workflows`.
- **Tags on workflows:** none. `HogFlow` has no tags field (model L141-215), there is no `TaggedItem`, and there is no `ObjectTags` in the workflows frontend. Only `HogFlowTemplate.tags` exists (free-form strings, used for the template category filter).
- **New workflow modal:** `Workflows/NewWorkflowModal.tsx` (a 1200px `LemonModal` titled "Create a workflow"). It has a Fuse search input, a category `LemonSelect` built from template tags ("All categories"), and `WorkflowTemplateChooser showEmptyWorkflow`. The behavior is described in B5.

---

### B8. Stories and mocks useful for a prototype

- `Workflows/templates/WorkflowTemplateCard.stories.tsx` ("Products/Workflows/Template card"): has `template()`, `stepConfig()`, and `triggerConfig()` builders that make valid `HogFlowTemplate` objects with chained `continue` edges. Email steps use `inputs.email.value.to.email`, webhook steps a `url`, Slack-style steps a `channel`. This is the best fixture factory to adapt for fake `HogFlow` rows (add `status`, `created_by`, `origin_product`, `updated_at`).
- `emptyState/WorkflowsPreview.tsx`: a static example-data mini canvas (CSS-only interaction).
- Editor stories mock `/api/environments/:team_id/hog_flows/:id/` and `user_blast_radius`: `hogflows/tree/HogFlowTreeEditor.stories.tsx` (L317-334), `hogflows/panel/HogFlowEditorPanel.stories.tsx` (L182-196), `hogflows/editor/graph/HogFlowGraphEditor`, `steps/StepDelay`, `steps/components/TriggerVolumeEstimate` (L54), `steps/components/CustomerTaskWorkflowReferenceInput`.
- `Workflows/Reputation/WorkflowsReputation.stories.tsx` mocks `/api/projects/:team_id/hog_flows/reputation` (L11).
- `products/workflows/mcp/apps/Workflows*.stories.tsx` and `mcp/apps/EmailTemplate*.stories.tsx` (quill-based MCP apps, not LemonUI).
- `frontend/src/lib/components/ProductEmptyState/ProductEmptyState.stories.tsx` L500 mocks `/api/projects/:team_id/hog_flows/` as an empty list. `frontend/src/scenes/notebooks/Notebook/NotebookWidgetViews.stories.tsx` L421-423 mocks detail, schedules, and batch_jobs.
- **Missing:** no story renders `WorkflowsScene` or `WorkflowsTable`, there are no `hog_flows` handlers in `frontend/src/mocks`, and there are no list fixtures. A prototype needs its own `GET hog_flows` mock (`{ results, count }`) and a `query` mock for the sparklines (or stub `AppMetricsSparkline`; it auto-loads in the storybook test runner, `AppMetricsSparkline.tsx` L41).

---

### B9. Client-computable versus backend work

"Loaded data" means the current page (30 `HogFlow` rows with full actions/edges/draft), plus data the page could fetch cheaply: `hog_flow_templates` (all, one call), `messaging_templates` (all, one call), and integrations.

| Redesign need | Client-computable today? | Notes |
|---|---|---|
| Type (Messaging / Automation / Loop) per row | Yes | `WorkflowTypeTag` rule |
| Dispatch channels per row (email/SMS/push/webhook/Slack) | Yes | Group by `config.template_id`. Pass a real `hogFunctionTemplatesById` to get destination icons. |
| Email subjects per row | Yes | `inputs.email.value.subject` |
| **Sender per email step** (integration id(s), override address/name) | Yes, raw ids | Map `integrationId(s)` to domain/verified with the team's email integrations (one extra fetch). A templated `from.email` may contain Liquid. |
| Recipient field | Partly | Shape mismatch (`to` string vs `{email}`) |
| Friendly trigger label/icon, event name, filter count | Yes | Reuse `getTriggerPreviews` / `TRIGGER_LABELS` / `getRegisteredTriggerTypes().matchConfig` |
| Draft vs live differences | Yes | `draft` is on the row (`draft_updated_at` is detail-only) |
| Email paused state | No (detail only) | `email_sending_paused_*` is not in `HogFlowMinimalSerializer`; needs a list field |
| Search pill: name/description/step/email text | Server (exists) | `search` param. Client highlight via `findMatchingWorkflowSteps`. |
| Pills: status, type, trigger type, created by | Server (exists) | Only one value per filter today: `status` is exact-match, `trigger` is one JSON containment. `type` already takes a comma list. Multi-select status or trigger needs backend changes. |
| Pills: channel ("sends SMS"), sender domain/address, destination template, "uses message template X" | No | Needs new server filters (JSON queries over `actions`) or load-all. "Uses message template X" is impossible: no reference is stored. |
| Facet counts per pill value | No | Needs a backend aggregate endpoint, or load-all (max page 500) |
| Group by type/status/trigger/channel/sender across **all** workflows | No | Only within the current page. Needs load-all or server grouping. |
| Sort by name, created, status, last-run, volume | No | Server order is fixed to `-updated_at`. Needs an `ordering` param (and metrics joins for volume). |
| Folders | No | Needs FileSystem integration (`FileSystemSyncMixin` on `HogFlow`, a `treeItemsNew`/type key, and fixing the `hog_flow/` vs `workflows` key) or a new folder model |
| Tags on workflows | No | New field/`TaggedItem` plus serializer, filter, and UI (`ObjectTags`) |
| Templates in the same tree/list | Partly | Both template lists are small, load-all, client-filtered. Workflow templates already carry `tags` and `scope`, so they can be merged on the client. Message templates have no scope or tags. |
| List/tile switch | Yes | Tile building blocks exist: `WorkflowTemplateCard`, `WorkflowTemplateSteps` (step icon strip from actions and edges), `MessageTemplateCard` |
| Last-7-days per row | Yes (existing per-row query) | Batching many rows into one query needs a small `appMetricsLogic` change (totals already support `app_source_id` breakdown). Sorting or grouping by volume needs a backend query. |
