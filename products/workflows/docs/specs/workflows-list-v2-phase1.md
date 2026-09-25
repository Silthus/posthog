# Spec: workflows list v2, phase 1

Status: ready to build.
Spec ticket: [Silthus/posthog#161](https://github.com/Silthus/posthog/issues/161). Map: [#160](https://github.com/Silthus/posthog/issues/160).
Checked against `origin/master` at `31070d37ad1` on 2026-09-25. Paths are repo-relative. Line numbers are approximate and only help you find the code.

Phase 1 is three draft PRs:

| PR  | What                                                                                | Depends on     | Users see                                            |
| --- | ----------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| 1   | Backend: the slim list                                                              | nothing        | nothing (additive API, MCP gains fields and filters) |
| 2   | Frontend: the pill search bar over a compact list, behind `workflows-list-v2`       | PR 1 (stacked) | nothing unless the flag is on                        |
| 3   | Editor fix: an email step keeps `template_uuid` when a Library template is inserted | nothing        | nothing visible; the link is stored                  |

Every PR is built test-first and outside-in: write the failing outermost test (API test, scene test), then work inward.

## Sources and locked decisions

The direction and every locked decision come from [#153](https://github.com/Silthus/posthog/issues/153) and its [resolution](https://github.com/Silthus/posthog/issues/153). Sizing and code references come from [#157](https://github.com/Silthus/posthog/issues/157) ([research file](https://github.com/Silthus/posthog/blob/research/workflows-list-build-cost/products/workflows/docs/research/workflows-list-build-cost.md)) and [#146](https://github.com/Silthus/posthog/blob/research/workflows-list-data/products/workflows/docs/research/workflows-list-data.md).
The prototype (`prototype/workflows-list`, `?variant=browser`) is a behavior reference only. Do not copy it: it has a global mutable facet registry, no ARIA, and fake storage.

Locked decisions that bind phase 1:

- The slim list is the loading model: load every row once, run facets on the client, keep server text search for email bodies, and add simple server filters for MCP and API callers.
- The pill search bar is locked as prototyped, plus a hint row once you type ("add a filter" / "search", then "Esc to close").
- Facets with counts from day one: status, type, trigger, created by, channel, sends, from, owner, health, kind, text.
- Owner is an explicit `Owner: @x` in the description, then `created_by`. No "any @mention" fallback.
- Compact rows are the only mode. Default columns: Name, Tags, Status, Sends, Updated. Optional: Trigger, Owner, Created by, Last 7 days, Health. The column picker lives in the "…" menu.
- `from:` and `sends:` match per workflow, and the matching email step is highlighted in the Sends cell.
- A workflow row shows what it sends and its From address.
- Workflow templates (`HogFlowTemplate`) are not in the list.
- Health is a facet and a column.
- The Library tab stays.

Labels used below: **Default** marks a choice this spec makes where the locked decisions are silent. The implementer follows it unless Michael overrides it.

---

## PR 1: backend slim list

### Contract: two new endpoints

| Endpoint                                                       | Operation id                         | Serializer                         |
| -------------------------------------------------------------- | ------------------------------------ | ---------------------------------- |
| `GET /api/projects/:project_id/hog_flows/summaries/`           | `hog_flows_summaries_list`           | `HogFlowListRowSerializer`         |
| `GET /api/projects/:project_id/messaging_templates/summaries/` | `messaging_templates_summaries_list` | `MessageTemplateListRowSerializer` |

Both are `@action(detail=False, methods=["GET"], url_path="summaries")` on the existing viewsets (`products/workflows/backend/api/hog_flow.py` `HogFlowViewSet`, `products/messaging/backend/api/message_templates.py` `MessageTemplatesViewSet`). Both also answer under `/api/environments/:id/` through the existing routing.

**Why separate endpoints, not a `?view=slim` param** (decision):

1. **Compression is path-scoped.** `ScopedGZipMiddleware` (`posthog/gzip_middleware.py`) matches `request.path` only. The full `hog_flows/` list carries action configs, which can hold credential-like values (see the `HogFlowSummarySerializer` comment), and its `next` link reflects the caller's `search` input. Compressing that response is the BREACH shape the middleware docstring warns about. The slim rows carry no action config, so only the new paths go on the allow list.
2. **One operation, one response schema.** A param that switches the shape gives one OpenAPI operation two response types. The generated `hogFlowsSummariesList` returns a precise type.
3. **Own page limits** without touching the existing list's `max_limit = 500`.

**Pagination.** `ListRowPagination(LimitOffsetPagination)` with `default_limit = 500`, `max_limit = 1000` (**Default**). Response `{count, next, previous, results}`. Order: `-updated_at, -id` for both endpoints (stable under limit/offset). The frontend follows `next` until it is null.

### Workflow row: `HogFlowListRow`

Every field has `help_text`. All derived fields come from the **live** `actions`, never from `draft` (**Default**: the list shows what runs; `has_draft` says a staged change exists).

| Field                      | Type                                                              | Derivation                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid                                                              | model                                                                                                                                                                                                                                                                                  |
| `name`                     | string \| null                                                    | model                                                                                                                                                                                                                                                                                  |
| `description`              | string                                                            | model                                                                                                                                                                                                                                                                                  |
| `status`                   | `draft` \| `active` \| `archived`                                 | model                                                                                                                                                                                                                                                                                  |
| `type`                     | `messaging` \| `automation` \| `loop` \| `broadcast`              | `origin_product` `loops` → `loop`, `broadcasts` → `broadcast`; else `messaging` if a live action type is in `MESSAGING_ACTION_TYPES`; else `automation`. Implement as one helper `workflow_type_of(flow)` next to `workflow_type_q`, so the row and the `type` filter cannot disagree. |
| `origin_product`           | string \| null                                                    | model                                                                                                                                                                                                                                                                                  |
| `trigger_type`             | string \| null                                                    | `config.type` of the `type: "trigger"` action, the same source `mask_trigger_config` reads. Fall back to the legacy `trigger` column's `type` when no trigger action exists. Null when neither has one.                                                                                |
| `has_draft`                | boolean                                                           | `draft IS NOT NULL`, as a queryset annotation. Do not load `draft`.                                                                                                                                                                                                                    |
| `channels`                 | array of `email` \| `sms` \| `push` \| `slack` \| `webhook`       | distinct, in that fixed order. `function_email` → email, `function_sms` → sms, `function_push` → push, `function` with `config.template_id` `template-slack` → slack, `template-webhook` → webhook.                                                                                    |
| `dispatches`               | array of `{action_type: string, template_id: string, count: int}` | one entry per distinct `config.template_id` over `function*` actions, in first-seen order. It feeds the dispatch icons that `WorkflowActionsSummary` draws today, including other destinations.                                                                                        |
| `email_steps`              | array of `EmailStepSummary`                                       | one per live `function_email` action, in `actions` order.                                                                                                                                                                                                                              |
| `created_by`               | `UserBasic` \| null                                               | `UserBasicSerializer`, `select_related("created_by")`                                                                                                                                                                                                                                  |
| `created_at`, `updated_at` | datetime                                                          | model                                                                                                                                                                                                                                                                                  |
| `user_access_level`        | string                                                            | as on the existing list                                                                                                                                                                                                                                                                |
| `last_7_days`              | `{succeeded: int, failed: int}` \| null                           | see [7-day totals](#7-day-totals)                                                                                                                                                                                                                                                      |

`EmailStepSummary`:

| Field                  | Type           | Derivation from `action.config.inputs.email.value`                                                                                                                                                                                                                                         |
| ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `action_id`            | string         | `action.id`                                                                                                                                                                                                                                                                                |
| `name`                 | string         | `action.name`                                                                                                                                                                                                                                                                              |
| `subject`              | string         | `value.subject`, `""` when missing. Liquid is left as written.                                                                                                                                                                                                                             |
| `from_addresses`       | string[]       | Every address the step can send from. If `from.email` is set, `[from.email]`. Otherwise each of `from.integrationId` / `from.integrationIds`, resolved to `Integration.config.email` (deduped, in order; unknown or deleted ids are skipped). A legacy plain-string `from` gives `[from]`. |
| `from_name`            | string \| null | `from.name`, else the first resolved integration's `config.name`                                                                                                                                                                                                                           |
| `from_integration_ids` | int[]          | `integrationId` then `integrationIds`, deduped                                                                                                                                                                                                                                             |
| `template_uuid`        | string \| null | `action.config.template_uuid` (PR 3 makes the web editor write it)                                                                                                                                                                                                                         |

**Integration resolution.** One query per request: `Integration.objects.filter(team_id=self.team_id, kind="email", id__in=<all ids on the page>)`, mapped by id and passed to the serializer through context. The `team_id` filter matters: integration ids are global, so without it a step could resolve another team's sender.

**The row never carries** `actions`, `edges`, `draft`, `inputs`, `encrypted_inputs`, `trigger` config, `conversion`, `variables`, or any email body (`html`, `text`, `design`, `preheader`). The only step inputs it exposes are the subject and the sender fields above.

**Implementation shape.**

- Put the derivation in a pure function, for example `summarize_hog_flow(actions, trigger_column, integrations) -> HogFlowListSummary`, returning `@frozen` dataclasses from `posthog.dataclasses` (see `/writing-dataclasses`). The serializer calls it once per row and caches the result on the instance.
- `HogFlowListRowSerializer` must **not** inherit `HogFlowMinimalSerializer.to_representation`. That method reads `encrypted_inputs` and `draft_encrypted_inputs` on every row. With those columns deferred, each row would lazy-load them: an N+1. The row has no secret-bearing field, so it needs no masking.
- The queryset uses `.select_related("created_by")`, `.defer("draft", "draft_encrypted_inputs", "encrypted_inputs", "edges", "conversion", "variables", "action_redirects", "trigger_masking")`, and annotates `has_draft`.

### Email template row: `MessageTemplateListRow`

| Field                      | Type                | Derivation                                                                                                               |
| -------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | uuid                | model                                                                                                                    |
| `name`                     | string              | model                                                                                                                    |
| `description`              | string              | model                                                                                                                    |
| `type`                     | string              | model (`email` today)                                                                                                    |
| `subject`                  | string              | `content.email.subject`, `""` when missing                                                                               |
| `from_addresses`           | string[]            | `content.email.from`, resolved with the same rules and the same one-query integration map as email steps. Usually empty. |
| `created_by`               | `UserBasic` \| null | `select_related("created_by")`                                                                                           |
| `created_at`, `updated_at` | datetime            | model                                                                                                                    |

The queryset keeps the viewset's rules (`team_id`, `deleted=False`) and uses `.only(...)` or `.defer("content")` plus a `KeyTextTransform` annotation for `subject` and `from`, so the row never loads the `html` and `design` JSON into Python. The row never carries `content`, `html`, `text` or `design`.

### 7-day totals

- `last_7_days` comes from **one** ClickHouse query per request: `fetch_app_metric_totals_by_source(team_id, app_source="hog_flow", after=now - 7 days)`, the function behind `metrics/global`. Call it once in the action, and pass the `{workflow_id: {succeeded, failed}}` map through serializer context. A workflow with no metrics gets `{succeeded: 0, failed: 0}`.
- If the ClickHouse call raises, log it, capture the exception, and return `last_7_days: null` on every row with HTTP 200. A metrics outage must not take down the list.
- Meaning: these are the same totals as `metrics/global`. They sum run-level and step-level rows and drop batch runs. The UI labels them as failures in 7 days, not runs. Fixing the meaning is out of scope (later, with a CDP reviewer).
- Only the `summaries` endpoint returns `last_7_days`. The MCP list does not, so an agent listing workflows doesn't wait on ClickHouse. `workflows-global-stats` stays the MCP route to totals.

### Server filters

Apply the same filters on `list` and on `summaries`. Change `safely_get_queryset` and `filter_queryset` from `self.action == "list"` to `self.action in ("list", "summaries")`.

Semantics: values within one param are OR. Params are AND. An `exclude_*` param removes rows that have any of its values. Unknown values return 400 with the allowed values, in the style of today's `type` error.

| Param                                                                              | Values                                                   | Status                        | Behavior                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                                                                           | comma list of `draft`, `active`, `archived`              | changed: was exact, one value | `status__in`. A single value behaves as today. Replace the `status` exact field in `HogFlowFilterSet` with a comma-list filter.                                                                                                                                                                                       |
| `exclude_status`                                                                   | same                                                     | new                           | `~Q(status__in=...)`                                                                                                                                                                                                                                                                                                  |
| `type`                                                                             | comma list (existing)                                    | kept                          | unchanged, `workflow_type_q`                                                                                                                                                                                                                                                                                          |
| `exclude_type`                                                                     | same values                                              | new                           | `~workflow_type_q(...)`                                                                                                                                                                                                                                                                                               |
| `trigger_type`                                                                     | comma list of `TRIGGER_TYPES`                            | new                           | Rows whose trigger action's `config.type` is one of the values. Use `jsonb_path_exists` with a **bound** value (the jsonpath `vars` argument), never string-built SQL. Validate against `TRIGGER_TYPES` first. Fall back to the `trigger` column for rows with no trigger action, matching `trigger_type` on the row. |
| `exclude_trigger_type`                                                             | same                                                     | new                           | negation of the above                                                                                                                                                                                                                                                                                                 |
| `trigger`                                                                          | JSON object (existing)                                   | kept                          | unchanged, `trigger__contains`                                                                                                                                                                                                                                                                                        |
| `created_by`                                                                       | comma list of user uuids                                 | changed: was one uuid         | `created_by__uuid__in`. Any invalid uuid → 400 `Must be a valid user uuid`.                                                                                                                                                                                                                                           |
| `exclude_created_by`                                                               | same                                                     | new                           | `~Q(created_by__uuid__in=...)`. Rows with no creator stay.                                                                                                                                                                                                                                                            |
| `channel`                                                                          | comma list of `email`, `sms`, `push`, `slack`, `webhook` | new                           | `actions__contains=[{"type": "function_email"}]` and so on; Slack and webhook are `actions__contains=[{"type": "function", "config": {"template_id": "template-slack"}}]`. Same pattern as `workflow_type_q`.                                                                                                         |
| `exclude_channel`                                                                  | same                                                     | new                           | negation                                                                                                                                                                                                                                                                                                              |
| `search`, `origin_product`, `broadcast_eligible`, `id`, `created_at`, `updated_at` | existing                                                 | kept                          | unchanged                                                                                                                                                                                                                                                                                                             |

Server filters for `sends`, `from`, `owner`, `health` and `kind` are out of scope. Under load-all they run on the client.

`messaging_templates/summaries/` takes no filters beyond pagination.

**Security.** Follow `.agents/security.md` for every new `RawSQL` or `Func`. Every value that reaches SQL is either allowlisted (enums) or a bound parameter (uuids). Run `semgrep --config .semgrep/rules/security/ .` on the diff.

### Access control

`_filter_queryset_by_access_level` (`posthog/api/routing.py`) filters only when `self.action == "list"`. A custom action does **not** get it. The `summaries` action must call `self.user_access_control.filter_queryset_by_access_level(queryset)` itself, as `metrics_global` does, and pass the filtered ids to the metrics map. Scopes: add `summaries` to `scope_object_read_actions` on `HogFlowViewSet`. `MessageTemplatesViewSet` has no read-action list today, so check that a personal API key with `hog_flow:read` can call its `summaries` action and add the declaration it needs.

### Compression

Add two patterns to `GZIP_RESPONSE_ALLOW_LIST` in `posthog/settings/web.py`:

```python
"^/?api/(environments|projects)/\\d+/hog_flows/summaries/?$",
"^/?api/(environments|projects)/\\d+/messaging_templates/summaries/?$",
```

Do not add `hog_flows/?$`. Add a one-line comment above the pair: the slim rows carry no action config, so no secret sits next to reflected input.

### OpenAPI and generated code

- Annotate the `summaries` actions with `@extend_schema(operation_id=..., parameters=[...], responses=...)` so drf-spectacular emits `PaginatedHogFlowListRowList` and `PaginatedMessageTemplateListRowList`. Declare every new filter as an `OpenApiParameter` with a description, on both `list` (the existing `extend_schema_view`) and `summaries`.
- Enum fields use explicit choice sets. If drf-spectacular warns about an enum-name collision (for example `status`, `type`), add an `ENUM_NAME_OVERRIDES` entry. Follow `/improving-drf-endpoints`.
- Run `hogli build:openapi`. Commit the regenerated `products/workflows/frontend/generated/`, `products/messaging/frontend/generated/` and `services/mcp/src/tools/generated/` output. Never hand-edit generated files.

### MCP `workflows-list`

- `workflows-list` keeps its operation (`hog_flows_list`). No operation swap, so the MCP UI app `workflow-list` keeps working.
- `HogFlowSummarySerializer` (the MCP list path in `get_serializer_class`) gains `type`, `trigger_type`, `has_draft`, `channels` and `email_steps`, from the same pure function. It keeps its existing fields. It still omits `actions`, `edges` and `draft`.
- The new filters reach the tool through OpenAPI regeneration.
- Update the tool description in `products/workflows/mcp/tools.yaml` to name the new filters (`status` and `created_by` take comma lists, `trigger_type`, `channel`, and `exclude_*`) and the new fields (channels, email subjects and senders per email step).
- The two `summaries` operations are for the web app. If codegen requires every operation in `tools.yaml`, declare them with `enabled: false`. Follow `/implementing-mcp-tools`.
- `workflows-list-email-templates` is unchanged.

### Performance budget and N+1 guards

- **Query count is constant in the row count.** For `summaries`: the page query, the count query, one integration query, the access-control queries, and one ClickHouse call. Enforce it with `assertNumQueries` at 2 rows and at 20 rows (or a snapshot of queries) on both endpoints.
- **Row size.** A workflow with one email step whose body is 20 KB serializes to under 1.5 KB in `summaries`. Assert it in a test.
- **One page covers the common case.** With `limit=1000`, a project with up to 1,000 workflows loads in one request per endpoint.
- **Measure, don't guess.** In the proof bundle, time `summaries` locally for a generated fixture of 1,000 workflows with one 20 KB email step each (invented data), before and after gzip. If computing on read is too slow, the fallback is a stored `list_summary` column, which is out of scope here and needs its own ticket.

### Tests (write first)

API tests go in a new `products/workflows/backend/api/test/test_hog_flow_summaries.py` and a messaging test next to the existing message template tests. Filter tests extend the existing list filter tests in `test_hog_flow.py` as one parameterized block that runs against both `list` and `summaries`. Use invented data only (`example.com` addresses, made-up names). Follow `/writing-tests`.

| Test                                                                                                                                                                                                                                             | Realistic regression it catches                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Row shape, exact JSON: a workflow with an email step using an override sender, an email step using an integration with sender rotation, an SMS step, a Slack step, a webhook step                                                                | Derivation drift, missing or renamed fields, which break the frontend and MCP together                           |
| A webhook step with an `Authorization` header value and an email body string: neither string appears anywhere in the `summaries` response or the MCP list response                                                                               | Someone adds `actions`, `inputs` or a body field to the row, leaking credentials through a list                  |
| Row for a workflow with a 20 KB email body is under 1.5 KB                                                                                                                                                                                       | Heavy fields creep back and undo the point of the slim list                                                      |
| Constant query count at 2 and 20 rows, with creators, integrations and access control in play                                                                                                                                                    | N+1 on `created_by`, on integrations, or on deferred `encrypted_inputs` through an inherited `to_representation` |
| Parameterized per type fixture (messaging, automation, loop, broadcast): `row.type == T` exactly when `?type=T` returns the row                                                                                                                  | The row's type and the server filter disagree, so client facet counts contradict MCP and API answers             |
| A workflow whose trigger action and legacy `trigger` column disagree: `trigger_type` and the `trigger_type` filter both follow the trigger action                                                                                                | Filtering on the stale column                                                                                    |
| Sender resolution, parameterized: override wins; integration resolves; rotation lists every address; deleted integration is skipped; legacy string `from`; another team's integration id never resolves                                          | Wrong From address on the row, or a cross-team sender leak                                                       |
| `last_7_days` from a mocked totals function; a raising totals function gives `null` and HTTP 200                                                                                                                                                 | A ClickHouse hiccup takes down the whole list                                                                    |
| A workflow the user has no access to is absent from `summaries`, and its totals are absent too                                                                                                                                                   | The custom action bypasses object-level access control (it does not get `_filter_queryset_by_access_level`)      |
| Another team's workflows and templates are absent                                                                                                                                                                                                | Tenant leak                                                                                                      |
| Pagination: `limit` above 1000 is capped; rows sharing `updated_at` never repeat across pages; `next` is null at the end                                                                                                                         | Load-all loops forever or drops rows                                                                             |
| Filters, parameterized on `list` and `summaries`: multi-value `status`, `created_by`, `trigger_type`, `channel` (including Slack and webhook); every `exclude_*`; include and exclude on the same param; unknown value → 400; invalid uuid → 400 | Multi-value or negation silently ignored, which MCP callers can't see                                            |
| Existing params unchanged: single `status`, `trigger` JSON, `type`, `search`, `origin_product`, `broadcast_eligible`                                                                                                                             | Breaking Desktop loops, the broadcasts list or MCP callers                                                       |
| `Accept-Encoding: gzip` on `summaries` gives `Content-Encoding: gzip` (with enough rows to pass the 200-byte threshold); the same header on `hog_flows/` does not                                                                                | The pattern misses `environments`, or someone widens it to the full list                                         |
| MCP list (`x-posthog-client: mcp`) returns the new fields and still no `actions`, `edges` or `draft`                                                                                                                                             | MCP loses the new fields, or the MCP path starts exposing the graph                                              |
| Email template summaries: shape, `deleted` excluded, other team excluded, no `content`/`html`/`design` in the body, more than 100 templates page correctly                                                                                       | The Library tab's first-100 class of bug, and content leaking into the slim row                                  |

Pure-function unit tests for `summarize_hog_flow` are worth adding only where the API tests can't reach a case cheaply (for example `actions` stored as `{}` instead of a list).

### Docs

Update `products/workflows/CONTRIBUTING.md` where it describes the list endpoint, with the new endpoint and filters. Do not add a new docs file.

---

## PR 2: frontend pill search bar, behind `workflows-list-v2`

### Flag

- Add `WORKFLOWS_LIST_V2: 'workflows-list-v2', // owner: #team-workflows` to `FEATURE_FLAGS` in `frontend/src/lib/constants.tsx`, in alphabetical order.
- `WorkflowsScene` reads the flag. Flag off renders today's `WorkflowsTable` and `workflowsLogic` untouched: same filters, same URL params, same requests. Flag on renders the v2 list.
- Creating the flag in PostHog's own project is a rollout step, not part of this PR.

### Shared component: `FacetSearchBar` in `frontend/src/lib/components/FacetSearchBar/`

A controlled, product-agnostic pill search bar. Follow `/writing-ui-components`. Add an `owners.yaml` rule in `frontend/src/lib/components/owners.yaml`: `match: '/FacetSearchBar/'`, `owners: team-workflows`.

**The facet registry API.** Facets are passed per instance as a typed array. There is no global registry and nothing registers at module load.

```ts
export interface FacetDefinition<TItem> {
  /** Typed before the colon, lowercase: `status`. */
  key: string
  /** Other keys that resolve to this facet: `subject` for `sends`. */
  aliases?: string[]
  /** Sentence case, shown in pills and suggestions: `Created by`. */
  label: string
  /** One short line shown next to the key in the facet list. */
  description: string
  /** Every value the item has. An item with no values never matches a positive pill and always passes a negated one. */
  getValues: (item: TItem) => string[]
  /** Display form of a stored value: `active` → `Active`, a user uuid → a name. */
  formatValue?: (value: string) => string
  /** Listed when the input is empty. Other facets are found by typing. */
  showOnFocus?: boolean
  /** Lower sorts first. */
  order?: number
}

export interface FacetFilter {
  facet: string
  value: string
  negated: boolean
}

export interface FacetSearchValue {
  filters: FacetFilter[]
  text: string
}
```

Values in phase 1 are always derived from loaded items. The API leaves room for static or async value sources later, but phase 1 does not build them.

**Files** (names are a suggestion; one component per file):

- `facetQuery.ts`: pure functions. `parseFacetQuery(q, facets)`, `serializeFacetQuery(filters)`, `matchesFacetQuery(item, value, facets, matchesText)`, `countFacetValues(items, facetKey, value, facets, matchesText)`.
- `facetSearchBarLogic.ts`: a keyed kea logic for the input state (input text, open, highlighted index) and the suggestion list. Business logic lives here, not in a hook.
- `FacetSearchBar.tsx`: the input with pills, and the suggestion popover.
- `FacetSearchBar.stories.tsx`, `facetQuery.test.ts`, `facetSearchBarLogic.test.ts`, `FacetSearchBar.test.tsx`.

**Props.** `facets`, `items`, `value`, `onChange(value)`, `matchesText(item, text)`, `placeholder`, `dataAttr`. The component never fetches.

**Query syntax.** `status:active -status:archived sends:"Your trial ends"`. A value with a space or a quote is quoted, and a quote inside is escaped. Parsing drops unknown facets and empty values. Aliases resolve to the canonical key. `serialize(parse(q))` is stable.

**Matching.** Pills on the same facet are OR. Pills on different facets are AND. A negated pill excludes any item that has the value. Text is AND with the pills. Matching is case-insensitive and exact on values.

**Suggestions.**

- Empty input: the `showOnFocus` facets, as `key:` plus the description.
- A partial token that prefixes a facet key or label: those facets first, then `Search for "<text>"`, then up to 8 value matches from any facet once the token has 2 or more characters, each with its count.
- A `facet:` draft: that facet's values, up to 50, filtered by the partial value, minus values already picked. Counts respect every other facet's pills and the text, but not the same facet's pills, so OR alternatives keep their counts.
- A `-facet:` draft: "Not <value>" with "Hides <count>".
- No values left: "No values match your other filters".

**Hint row** at the bottom of the popover, always shown while the popover is open: the Enter action for the highlighted row ("Enter to search", "Enter to add filter", "Enter to pick status:"), the Tab action when it differs ("Tab or → to add filter"), "↑↓ to move", "Esc to close". This carries the locked "add a filter / search, Esc to close" hint.

**Keys.**

| Key                                  | Does                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ↓ / ↑                                | Move the highlight, clamped at both ends. ↓ opens the popover when closed.                                                                                          |
| Enter                                | Apply the highlighted row: a facet row completes `key:`, a value row adds a pill, the search row closes the popover and keeps the text.                             |
| Tab, and → with the caret at the end | Apply the highlighted filter row, or the first filter row if a search row is highlighted. Never runs a plain search. With an empty input, Tab moves focus as usual. |
| Esc                                  | Close the popover.                                                                                                                                                  |
| Backspace on an empty input          | Remove the last pill.                                                                                                                                               |

**Pills.** `LemonSnack`. Label `<Facet label>: <value>`, or `<Facet label> is not: <value>` in danger text. The close button has `aria-label="Remove filter <label>"`.

**Accessibility.** The input has `role="combobox"`, `aria-expanded`, `aria-controls` pointing at the listbox, and `aria-activedescendant`. Rows have `role="option"` and `aria-selected`.

**Width.** Pills wrap. At a 520px container the bar stays usable. Use container queries, not viewport breakpoints.

### Workflows list v2

Place the files with `/placing-product-frontend-code`. A suggested home is `products/workflows/frontend/Workflows/WorkflowsListV2/`.

**Data.**

- `workflowsListV2Logic` loads both endpoints in parallel through the generated `hogFlowsSummariesList` (with `type=messaging,automation,loop`, the page's current coverage) and `messagingTemplatesSummariesList`, `limit=1000`, following `next` until null. Use generated types; add nothing to `lib/api.ts`. Follow `/adopting-generated-api-types` and `/writing-kea-logics`.
- A pure `buildWorkflowListRows(workflows, templates)` returns a discriminated union: `{ kind: 'workflow', ... }` and `{ kind: 'email_template', ... }`.
- Rows sort by `updated_at` descending, both kinds merged.
- Loading shows a skeleton table. A failed load shows "Couldn't load workflows" with a Retry button. Loading, empty and error are three different screens.

**Facets** (`workflowListFacets.ts`, in `products/workflows`):

| Key          | Aliases   | Label      | On focus | Values                                                                   | Applies to |
| ------------ | --------- | ---------- | -------- | ------------------------------------------------------------------------ | ---------- |
| `status`     |           | Status     | yes      | `draft`, `active`, `archived`                                            | workflows  |
| `kind`       |           | Kind       | yes      | `workflow`, `email-template` ("Workflow", "Email template")              | both       |
| `channel`    |           | Channel    | yes      | `channels`; an email template has `email`                                | both       |
| `sends`      | `subject` | Sends      | yes      | non-empty `email_steps[].subject`; a template's `subject`                | both       |
| `from`       |           | From       | yes      | `email_steps[].from_addresses`, flattened; a template's `from_addresses` | both       |
| `owner`      |           | Owner      | yes      | see below, shown as `@handle`                                            | workflows  |
| `health`     |           | Health     | yes      | `failing`, `healthy`, `idle` ("Failing", "Healthy", "No runs")           | workflows  |
| `type`       |           | Type       | no       | `messaging`, `automation`, `loop`                                        | workflows  |
| `trigger`    |           | Trigger    | no       | `trigger_type`, labeled with `WORKFLOW_TRIGGER_TYPE_OPTIONS`             | workflows  |
| `created-by` |           | Created by | no       | creator uuid, shown as first name, else email                            | both       |

Free text is not a facet pill. It stays as the input's trailing text (as prototyped, **Default**).

- **Owner.** Every `Owner: @handle` in the description (case-insensitive, `[\w.-]+`, trailing `.` and `-` trimmed, lowercased). If there is none, the creator's first name lowercased, else the local part of their email. No other @mention counts.
- **Health.** `failing` when `last_7_days.failed > 0`; `healthy` when `failed == 0` and `succeeded > 0`; `idle` otherwise, including `last_7_days: null`. Its description reads "Failed runs in the last 7 days".
- **Text.** Case-insensitive; every word must appear in the name, description, email step names, subjects or From addresses. For workflows, once the text has 3 or more characters, the logic also calls `hogFlowsSummariesList` with `search=<text>` (debounced 300 ms, previous request cancelled). A workflow matches the text if the client match **or** the server search returns it. This keeps today's email body and preheader search. Email templates use the client match only. (**Default**)

**URL state.**

- `q` holds the serialized pills. `text` holds the free text. Changes replace the history entry.
- Old params redirect once on load, with `replace`, when the flag is on: `status=X` → `status:X`, `type=X` → `type:X`, `trigger_type=X` → `trigger:X`, `created_by=<uuid>` → `created-by:<uuid>`, `search=X` → `text=X`. `page` is dropped. Unknown or invalid values are dropped.
- Flag off: the old params keep working as today.

**Display.**

- Compact rows only: `LemonTable size="small"`.
- Columns: Name, Status, Sends, Updated on by default. Tags is locked as a default column but ships in phase 2 with tags. Optional: Type (**Default**, today's list has it), Trigger, Owner, Created by, Last 7 days, Health.
- **"…" menu** at the right of the list header, next to "New workflow": a "Columns" section with a checkbox per optional column and "Reset to default columns". The choice persists per browser through kea `persist` (views that store columns come in phase 4).
- **Name.** An icon for the kind, the name as a link (workflow → `urls.workflow(id, 'workflow')`, email template → `urls.workflowsLibraryTemplate(id)`), the description in a tooltip. Archived workflows render as today (muted, with the restore tooltip).
- **Status.** Today's status tag. Empty for email templates.
- **Sends.** One line: the dispatch icons with counts (extract today's `WorkflowActionsSummary` icon mapping so both lists share it), then the shown email step's subject, then a muted `· <from address>`. The line truncates from the end, and the subject keeps priority over the address. A tooltip lists every email step: subject, then "From <name> <address>".
  - The shown step is the first email step. With `sends:` or `from:` pills active, it is the first step that matches them, with the matching text highlighted (`<mark>` with a theme token background). If more steps match, add "+N".
  - An email template row shows the email icon, its subject and its From address. "Used by N" is phase 5.
- **Updated.** Relative time, as today.
- **Last 7 days.** "N failed · M succeeded" from `last_7_days`. No per-row sparkline queries.
- **Health.** `LemonTag`: Failing (danger), Healthy (success), No runs (muted). The tooltip shows the two counts and "in the last 7 days".
- **Row menus.** Workflows keep today's menu (enable or disable, duplicate, archive, restore, delete). Duplicate fetches the full workflow with `hogFlowsRetrieve` first, because the slim row has no graph. Status changes update the row after the API call succeeds. Email template rows get the Library tab's Duplicate and Delete.
- **Pagination.** Client-side, 100 rows a page (**Default**), so a large project doesn't render thousands of rows at once.
- **Empty states.** No workflows and no templates at all: today's empty state. No matches: "No workflows or email templates match these filters" with a "Clear filters" button.
- **Width.** Check at a 1440px window, and at about 900px and 520px of scene width. Pills wrap, Sends truncates, and optional columns scroll sideways inside the table.

**Out of the v2 list in phase 1:** step-match excerpts under the name (`WorkflowStepMatches`), because the slim row has no bodies. Flag off keeps them. This is a known gap, listed under risks.

### Copy

Invoke `/writing-user-facing-copy`. Sentence case, no em dashes.

| Where                   | Text                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| Placeholder, no pills   | Search workflows, or filter with status:, channel:, from: and more      |
| Placeholder, with pills | Add a filter or search                                                  |
| Popover title           | Filter by / Search or filter / `<Facet label>` / `<Facet label>` is not |
| Search row              | Search for "`<text>`"                                                   |
| No values               | No values match your other filters                                      |
| No rows                 | No workflows or email templates match these filters                     |
| Button                  | Clear filters                                                           |
| Load error              | Couldn't load workflows                                                 |
| Health values           | Failing, Healthy, No runs                                               |
| Menu section            | Columns, Reset to default columns                                       |

### Tests (outside-in)

Follow `/writing-tests`. Mock HTTP with the repo's MSW helpers. Invented data only.

| Level              | Test                                                                                                                                                                                                  | Realistic regression it catches                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Scene (start here) | Render the workflows scene with the flag on and mocked `summaries` endpoints. Type `sta`, press Tab, pick `active` with ↓ and Enter. Only active workflows remain, and the URL has `q=status:active`. | The bar, logic and table don't connect end to end      |
| Scene              | Flag off: today's dropdown filters render and no `summaries` request goes out                                                                                                                         | The flag leaks v2 into today's list                    |
| Logic              | Two pages of workflows plus templates load and merge, sorted by `updated_at`                                                                                                                          | Load-all stops after page one                          |
| Logic              | Old params `status`, `type`, `trigger_type`, `created_by`, `search` redirect into `q` and `text` with `replace`                                                                                       | Bookmarked filter links break                          |
| Logic              | Text of 3+ characters ORs server search ids with client matches; a stale response is ignored                                                                                                          | Body search lost, or results flicker to an older query |
| Pure               | `parseFacetQuery` / `serializeFacetQuery` round trip with quotes, escapes, negation, aliases, unknown facets                                                                                          | Shared links that don't restore the same filters       |
| Pure               | Matching: OR within a facet, AND across, negation, items with no values, `sends:` and `from:` against several steps                                                                                   | Wrong rows for combined pills                          |
| Pure               | `buildWorkflowListRows`: owner parsing (explicit wins, trailing punctuation, fallback), health buckets, template channel and sends                                                                    | Owner or health facet shows wrong values               |
| Pure               | Counts ignore the facet's own pills but respect the others                                                                                                                                            | Counts that drop to zero while picking OR values       |
| Component          | `FacetSearchBar` keys: Tab and → pick the first filter row and never search; Enter on the search row closes; Esc closes; Backspace on empty removes the last pill; Tab on an empty input moves focus  | Keyboard traps and lost pills                          |
| Component          | Sends cell highlights the matching step and shows "+N"                                                                                                                                                | The locked highlight silently stops working            |

A Playwright test is not required. Storybook stories give the visual coverage.

**Stories.**

- `FacetSearchBar.stories.tsx`: focus, typing, value draft with counts, negated draft, many pills at 520px.
- `WorkflowsListV2.stories.tsx` with mocked endpoints: default, filtered with a highlighted Sends cell, email templates, no matches, loading, error, at about 900px and 520px, light and dark. Set the flag with `/setting-feature-flags-in-storybook`.

**Proof bundle.** Red and green test runs, `pnpm --filter=@posthog/frontend typescript:check`, the full gate, and screenshots uploaded with `hogli pr:upload-image`: flag off (unchanged), flag on at 1440px, about 900px and 520px, in light and dark, the popover with the hint row, and a highlighted Sends cell.

---

## PR 3: the editor keeps `template_uuid`

### Where it is stored

`action.config.template_uuid` on the `function_email` action: the key the API and MCP path already write (`_apply_email_template_content`, `hog_flow.py`), which the zod schema already allows (`products/workflows/frontend/Workflows/hogflows/steps/types.ts`, `function_email` config). The server keeps it as provenance when the step has a body, so the web editor's saves, including draft saves on active workflows, carry it through publish. No backend change and no migration.

### Change

1. `emailTemplaterLogic` (`frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx`): add an optional prop `onTemplateApplied?: (templateId: string) => void` to `EmailTemplaterLogicProps`. The `applyTemplate` listener calls it with `template.id` after it sets the values. `EmailTemplater` passes the prop through.
2. `CyclotronJobInputs` (`frontend/src/lib/components/CyclotronJob/CyclotronJobInputs.tsx`): an optional `onEmailTemplateApplied?: (templateId: string) => void`, passed to `EmailTemplateField` and on to `EmailTemplater`.
3. `HogFlowFunctionConfiguration`: an optional `onEmailTemplateApplied` prop, passed to `CyclotronJobInputs`.
4. `StepFunction.tsx`: wire it as `partialSetWorkflowActionConfig(node.id, { template_uuid: templateId })`.

**Semantics (Default).** The link means "based on this template". Later edits keep it. Inserting another template replaces it. There is no detach control in phase 1. Without the prop, nothing changes, so the Library editor (`MessageTemplate.tsx`), hog function destinations and the Broadcasts wizard behave as today.

### Tests

| Level                   | Test                                                                                                                                                                                                                                           | Realistic regression it catches                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Outside-in (start here) | Mount the workflow editor logic with an email step (MSW-mocked templates), apply a Library template through the templater, and assert the step's `config.template_uuid` equals the template id, and that the next save request body carries it | The link is dropped anywhere between the picker and the save  |
| Logic                   | `emailTemplaterLogic.applyTemplate` calls `onTemplateApplied` with the id, and works without the prop                                                                                                                                          | The callback is lost in a refactor, or hosts without it crash |
| Logic                   | Applying a second template replaces the link; editing the subject after applying keeps it                                                                                                                                                      | The "based on" semantics regress                              |

Backend: `test_hog_flow.py` already covers `template_uuid` handling (around the `test_uuid_template_id_*` tests). Add one API test only if nothing covers a lenient web save of an email step with a body and a `template_uuid`, through draft and publish. It catches the server stripping the key.

### The backfill command is out of scope

It is not trivially small. It walks `actions` and `draft` of every workflow, matches steps to templates by an exact content hash with an opt-in subject fallback, and needs dry run and batching (modeled on `rewrite_email_asset_url.py`, about 450 lines in #157's estimate). Its only consumer, "Used by N" and `library:`, is phase 5. Shipping the editor fix first stops the unlinked set from growing while the backfill waits.

---

## Out of scope for phase 1

- **Phase 2, tags:** the Tags column, `tag:`, inline editing, bulk tagging, New workflow applying tags (waits on upstream PostHog#105497).
- **Phase 3, folders:** the file browser, `in:` scope pill, `folder:`, Move to, drag and drop, New workflow into the open folder, `FileSystem` sync.
- **Phase 4, saved views:** view tabs, built-in views (All, Templates, Needs attention, Drafts, My workflows), Reset, Save for everyone, Save as new view, columns per view. In phase 1, `kind:email-template` and `health:failing` give the same answers by hand. (**Default**: the #153 first cut listed built-in views as constants, but the map puts views in phase 4.)
- **Phase 5:** "Used by N", `library:`, and the template-link backfill.
- **Phase 6:** tag colors, `/` tag groups, Manage tags.
- **Later:** the `metrics/global` meaning fix and a server health facet, a real owner field, the Library tab's first-100 fix and retirement, the "By sender and email" mode, tiles, other lists adopting `FacetSearchBar`, server filters for `sends`, `from`, `owner`, `health` and `kind`, a stored `list_summary` column, a `category:` facet, `owner:me`.

## Risks

- **ClickHouse on the list path.** `last_7_days` adds one ClickHouse query to `summaries`. Mitigated by degrading to `null`. If it is slow, move the frontend to a separate `metrics/global` call.
- **Computing the summary on read** reads every workflow's `actions` JSON. Measure it (see the performance budget). A stored column is the fallback, in a later ticket.
- **Custom actions skip access filtering.** Covered by the explicit filter and its test.
- **The v2 list loses step-match excerpts.** Body search still finds the workflows; the excerpt under the name is gone while the flag is on.
- **Duplicate needs the full workflow.** One extra fetch on duplicate.
- **New shared component with no owner.** Adding the `owners.yaml` rule assigns it, but expect a reviewer from outside the team.
- **Metric meaning.** Health and Last 7 days use `metrics/global` totals, which mix run-level and step-level rows. The labels say "failed", not "runs failed".

## Open questions

None block the build. The **Default** labels above mark the choices Michael may want to overturn. The two most likely to matter:

1. Built-in view tabs (All, Templates, Needs attention, Drafts) wait for phase 4. Should a static version ship in PR 2 instead?
2. The v2 list drops step-match excerpts under the name. Acceptable behind the flag until a later phase?
