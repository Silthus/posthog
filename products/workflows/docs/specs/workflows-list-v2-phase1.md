# Spec: workflows list v2, phase 1

Status: ready to build.
Spec ticket: [Silthus/posthog#161](https://github.com/Silthus/posthog/issues/161). Map: [#160](https://github.com/Silthus/posthog/issues/160).
Checked against `origin/master` at `31070d37ad1` on 2026-09-25. Paths are repo-relative. Line numbers are approximate and only help you find the code.

Phase 1 is three draft PRs:

| PR  | What                                                                                | Depends on     | Users see                           |
| --- | ----------------------------------------------------------------------------------- | -------------- | ----------------------------------- |
| 1   | Backend: the slim list                                                              | nothing        | nothing (one additive endpoint)     |
| 2   | Frontend: the pill search bar over a compact list, behind `workflows-list-v2`       | PR 1 (stacked) | nothing unless the flag is on       |
| 3   | Editor fix: an email step keeps `template_uuid` when a Library template is inserted | nothing        | nothing visible; the link is stored |

Every PR is built test-first and outside-in: write the failing outermost test (API test, scene test), then work inward.

## Sources and locked decisions

The direction and every locked decision come from [#153](https://github.com/Silthus/posthog/issues/153) and its [resolution](https://github.com/Silthus/posthog/issues/153). Sizing and code references come from [#157](https://github.com/Silthus/posthog/issues/157) ([research file](https://github.com/Silthus/posthog/blob/research/workflows-list-build-cost/products/workflows/docs/research/workflows-list-build-cost.md)) and [#146](https://github.com/Silthus/posthog/blob/research/workflows-list-data/products/workflows/docs/research/workflows-list-data.md).
The prototype (`prototype/workflows-list`, `?variant=browser`) is a behavior reference only. Do not copy it: it has a global mutable facet registry, no ARIA, and fake storage.

Locked decisions that bind phase 1:

- The slim list is the loading model: load every row once, run facets on the client, and keep server text search for email bodies.
- The pill search bar is locked as prototyped, plus a hint row once you type ("add a filter" / "search", then "Esc to close").
- Facets with counts from day one: status, type, trigger, created by, owner, health, text. (Revised 2026-09-28: channel, sends, from and kind move to a later phase.)
- Owner is an explicit `Owner: @x` in the description, then `created_by`. No "any @mention" fallback.
- Compact rows are the only mode. Default columns: Name, Status, Updated. Optional: Type, Trigger, Owner, Created by, Last 7 days, Health. The column picker lives in the "…" menu. Tags and Sends come with their phases.
- Workflow templates (`HogFlowTemplate`) are not in the list.
- Health is a facet and a column.
- The Library tab stays.

Labels used below: **Default** marks a choice this spec makes where the locked decisions are silent. The implementer follows it unless Michael overrides it.

---

## PR 1: backend slim list

Revised on 2026-09-28 after review. The first build added a template endpoint, per-step senders and subjects, dispatch counts, 7-day totals, and new list filters. Review cut all of that. What stays is one endpoint that reuses the MCP summary serializer.

### Contract: one new endpoint

| Endpoint                                             | Operation id               | Serializer                     |
| ---------------------------------------------------- | -------------------------- | ------------------------------ |
| `GET /api/projects/:project_id/hog_flows/summaries/` | `hog_flows_summaries_list` | `HogFlowListSummarySerializer` |

- `HogFlowListSummarySerializer` subclasses `HogFlowSummarySerializer`, the metadata-only serializer the MCP list already uses, and adds `type`.
- A row never carries `actions`, `edges` or `draft`. The trigger's secret inputs stay masked, as on the MCP list.
- `type` (`messaging`, `automation`, `loop`, `broadcast`) is a SQL annotation built from the same `Q` as the `?type=` filter, so a row and the filter always agree.
- It takes the same query parameters and search as `hog_flows/`, and the same page limits (100 by default, 500 at most). The frontend follows `next` until it is null.
- It sorts on `-created_at, -id`. A save during a paged load changes `updated_at`, which would move rows between pages.
- The routing mixin only filters by access level for `list`, so the action applies that filter itself.
- Both list actions select `created_by` in the page query, which removes a per-row user query.

**Why a separate action, not a `?view=slim` param:**

1. **Compression is path-scoped.** `ScopedGZipMiddleware` matches `request.path` only. The full list has step config next to the `search` input that its `next` link reflects, which is the BREACH shape. Only `hog_flows/summaries/` joins `GZIP_RESPONSE_ALLOW_LIST`.
2. **One operation, one response schema.** The generated `hogFlowsSummariesList` returns a precise type.

### Not in PR 1

- **7-day totals.** The frontend calls the existing `metrics/global` after the list loads. The list request stays off ClickHouse.
- **Email templates as rows**, and a template summaries endpoint.
- **What a workflow sends:** channels, dispatch counts, email subjects and From addresses. The From address lives on the sender integration, so it needs a lookup the list does not do yet.
- **New server filters** (comma lists, `exclude_*`, `trigger_type`, `channel`) and new MCP fields.

Each comes back in a later phase with its own reason. A stored summary column is the likely home for the send fields.

### Measured

500 invented workflows, one 20 KB email step each: the full list is 10.6 MB, `summaries` is 680 KB, and 17 to 127 KB gzipped. Both take about 150 to 165 ms locally, because trigger masking reads each row's `actions`. The gain is transfer.

### Tests

Extend the existing tests rather than adding a file:

| Test                                                                                    | Realistic regression it catches           |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| The `?type=` filter test also queries `summaries` and checks each row's `type`          | The annotation and the filter drift apart |
| Saving a workflow does not change the `summaries` order                                 | A switch back to sorting on `updated_at`  |
| The MCP leak test also checks `summaries`: no `actions`, no webhook `Authorization`     | Step config leaks through the list        |
| The object-level access test also checks `summaries`, with an accessible workflow shown | The custom action skips the access filter |

### Docs

`products/workflows/CONTRIBUTING.md` gets a short "Listing workflows" section: the sort order, the access filter, and why only `summaries` is gzipped.

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
  /** Other keys that resolve to this facet. */
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

**Query syntax.** `status:active -status:archived owner:"dana"`. A value with a space or a quote is quoted, and a quote inside is escaped. Parsing drops unknown facets and empty values. Aliases resolve to the canonical key. `serialize(parse(q))` is stable.

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

- `workflowsListV2Logic` loads the generated `hogFlowsSummariesList` (with `type=messaging,automation,loop`, the page's current coverage) with `limit=500`, following `next` until null. Use generated types; add nothing to `lib/api.ts`. Follow `/adopting-generated-api-types` and `/writing-kea-logics`.
- After the list loads, the logic calls the existing `metrics/global` endpoint once (`after=-7d`) through its generated client. The list renders first. Health and Last 7 days fill in when the totals arrive. A failed totals call leaves every workflow at "No runs" and does not break the list.
- A pure `buildWorkflowListRows(workflows, totals)` returns the rows.
- Rows sort by `updated_at` descending.
- Loading shows a skeleton table. A failed load shows "Couldn't load workflows" with a Retry button. Loading, empty and error are three different screens.

**Facets** (`workflowListFacets.ts`, in `products/workflows`):

| Key          | Aliases | Label      | On focus | Values                                                         | Applies to |
| ------------ | ------- | ---------- | -------- | -------------------------------------------------------------- | ---------- |
| `status`     |         | Status     | yes      | `draft`, `active`, `archived`                                  | workflows  |
| `owner`      |         | Owner      | yes      | see below, shown as `@handle`                                  | workflows  |
| `health`     |         | Health     | yes      | `failing`, `healthy`, `idle` ("Failing", "Healthy", "No runs") | workflows  |
| `type`       |         | Type       | yes      | `messaging`, `automation`, `loop`                              | workflows  |
| `trigger`    |         | Trigger    | no       | `trigger.type`, labeled with `WORKFLOW_TRIGGER_TYPE_OPTIONS`   | workflows  |
| `created-by` |         | Created by | no       | creator uuid, shown as first name, else email                  | workflows  |

Free text is not a facet pill. It stays as the input's trailing text (as prototyped, **Default**).

- **Owner.** Every `Owner: @handle` in the description (case-insensitive, `[\w.-]+`, trailing `.` and `-` trimmed, lowercased). If there is none, the creator's first name lowercased, else the local part of their email. No other @mention counts.
- **Health.** From the `metrics/global` row for the workflow: `failing` when `failed > 0`; `healthy` when `failed == 0` and `succeeded > 0`; `idle` otherwise, including no row, a failed call, or totals not loaded yet. Its description reads "Failed runs in the last 7 days".
- **Text.** Case-insensitive; every word must appear in the name or description. Once the text has 3 or more characters, the logic also calls `hogFlowsSummariesList` with `search=<text>` (debounced 300 ms, previous request cancelled). A workflow matches the text if the client match **or** the server search returns it. This keeps today's step name, subject, preheader and email body search. (**Default**)

**URL state.**

- `q` holds the serialized pills. `text` holds the free text. Changes replace the history entry.
- Old params redirect once on load, with `replace`, when the flag is on: `status=X` → `status:X`, `type=X` → `type:X`, `trigger_type=X` → `trigger:X`, `created_by=<uuid>` → `created-by:<uuid>`, `search=X` → `text=X`. `page` is dropped. Unknown or invalid values are dropped.
- Flag off: the old params keep working as today.

**Display.**

- Compact rows only: `LemonTable size="small"`.
- Columns: Name, Status, Updated on by default. Tags ships in phase 2 with tags, and Sends with the phase that adds send fields. Optional: Type (**Default**, today's list has it), Trigger, Owner, Created by, Last 7 days, Health.
- **"…" menu** at the right of the list header, next to "New workflow": a "Columns" section with a checkbox per optional column and "Reset to default columns". The choice persists per browser through kea `persist` (views that store columns come in phase 4).
- **Name.** The name as a link to `urls.workflow(id, 'workflow')`, the description in a tooltip. Archived workflows render as today (muted, with the restore tooltip).
- **Status.** Today's status tag.
- **Updated.** Relative time, as today.
- **Last 7 days.** "N failed · M succeeded" from the `metrics/global` totals. No per-row sparkline queries.
- **Health.** `LemonTag`: Failing (danger), Healthy (success), No runs (muted). The tooltip shows the two counts and "in the last 7 days".
- **Row menus.** Workflows keep today's menu (enable or disable, duplicate, archive, restore, delete). Duplicate fetches the full workflow with `hogFlowsRetrieve` first, because the slim row has no graph. Status changes update the row after the API call succeeds.
- **Pagination.** Client-side, 100 rows a page (**Default**), so a large project doesn't render thousands of rows at once.
- **Empty states.** No workflows at all: today's empty state. No matches: "No workflows match these filters" with a "Clear filters" button.
- **Width.** Check at a 1440px window, and at about 900px and 520px of scene width. Pills wrap, and optional columns scroll sideways inside the table.

**Out of the v2 list in phase 1:** step-match excerpts under the name (`WorkflowStepMatches`), because the slim row has no bodies. Flag off keeps them. This is a known gap, listed under risks.

### Copy

Invoke `/writing-user-facing-copy`. Sentence case, no em dashes.

| Where                   | Text                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| Placeholder, no pills   | Search workflows, or filter with status:, owner:, health: and more      |
| Placeholder, with pills | Add a filter or search                                                  |
| Popover title           | Filter by / Search or filter / `<Facet label>` / `<Facet label>` is not |
| Search row              | Search for "`<text>`"                                                   |
| No values               | No values match your other filters                                      |
| No rows                 | No workflows match these filters                                        |
| Button                  | Clear filters                                                           |
| Load error              | Couldn't load workflows                                                 |
| Health values           | Failing, Healthy, No runs                                               |
| Menu section            | Columns, Reset to default columns                                       |

### Tests (outside-in)

Follow `/writing-tests`. Mock HTTP with the repo's MSW helpers. Invented data only.

| Level              | Test                                                                                                                                                                                                   | Realistic regression it catches                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Scene (start here) | Render the workflows scene with the flag on and a mocked `summaries` endpoint. Type `sta`, press Tab, pick `active` with ↓ and Enter. Only active workflows remain, and the URL has `q=status:active`. | The bar, logic and table don't connect end to end       |
| Scene              | Flag off: today's dropdown filters render and no `summaries` request goes out                                                                                                                          | The flag leaks v2 into today's list                     |
| Logic              | Two pages of workflows load, sorted by `updated_at`; health fills in after `metrics/global` returns, and a failed call leaves the list up                                                              | Load-all stops after page one, or totals block the list |
| Logic              | Old params `status`, `type`, `trigger_type`, `created_by`, `search` redirect into `q` and `text` with `replace`                                                                                        | Bookmarked filter links break                           |
| Logic              | Text of 3+ characters ORs server search ids with client matches; a stale response is ignored                                                                                                           | Body search lost, or results flicker to an older query  |
| Pure               | `parseFacetQuery` / `serializeFacetQuery` round trip with quotes, escapes, negation, aliases, unknown facets                                                                                           | Shared links that don't restore the same filters        |
| Pure               | Matching: OR within a facet, AND across, negation, items with no values                                                                                                                                | Wrong rows for combined pills                           |
| Pure               | `buildWorkflowListRows`: owner parsing (explicit wins, trailing punctuation, fallback), health buckets                                                                                                 | Owner or health facet shows wrong values                |
| Pure               | Counts ignore the facet's own pills but respect the others                                                                                                                                             | Counts that drop to zero while picking OR values        |
| Component          | `FacetSearchBar` keys: Tab and → pick the first filter row and never search; Enter on the search row closes; Esc closes; Backspace on empty removes the last pill; Tab on an empty input moves focus   | Keyboard traps and lost pills                           |

A Playwright test is not required. Storybook stories give the visual coverage.

**Stories.**

- `FacetSearchBar.stories.tsx`: focus, typing, value draft with counts, negated draft, many pills at 520px.
- `WorkflowsListV2.stories.tsx` with mocked endpoints: default, filtered, no matches, loading, error, at about 900px and 520px, light and dark. Set the flag with `/setting-feature-flags-in-storybook`.

**Proof bundle.** Red and green test runs, `pnpm --filter=@posthog/frontend typescript:check`, the full gate, and screenshots uploaded with `hogli pr:upload-image`: flag off (unchanged), flag on at 1440px, about 900px and 520px, in light and dark, and the popover with the hint row.

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
- **Phase 4, saved views:** view tabs, built-in views (All, Templates, Needs attention, Drafts, My workflows), Reset, Save for everyone, Save as new view, columns per view. In phase 1, `health:failing` gives the same answer by hand. (**Default**: the #153 first cut listed built-in views as constants, but the map puts views in phase 4.)
- **Phase 5:** "Used by N", `library:`, and the template-link backfill.
- **Phase 6:** tag colors, `/` tag groups, Manage tags.
- **Later, moved out of phase 1 on 2026-09-28:** email templates as rows (`kind:`), `channel:`, `sends:`, `from:`, the Sends column, and the backend they need (sender lookup, per-step subjects, a template summaries endpoint).
- **Later:** the `metrics/global` meaning fix and a server health facet, a real owner field, the Library tab's first-100 fix and retirement, the "By sender and email" mode, tiles, other lists adopting `FacetSearchBar`, server filters for `sends`, `from`, `owner`, `health` and `kind`, a stored `list_summary` column, a `category:` facet, `owner:me`.

## Risks

- **Totals arrive late.** The `metrics/global` call runs after the list loads, so Health and Last 7 days show "No runs" for a moment.
- **Computing the summary on read** reads every workflow's `actions` JSON for trigger masking. Measured at 500 rows it matches the full list's server time; the gain is transfer. A stored column is the fallback, in a later ticket.
- **Custom actions skip access filtering.** Covered by the explicit filter and its test.
- **The v2 list loses step-match excerpts.** Body search still finds the workflows; the excerpt under the name is gone while the flag is on.
- **Duplicate needs the full workflow.** One extra fetch on duplicate.
- **New shared component with no owner.** Adding the `owners.yaml` rule assigns it, but expect a reviewer from outside the team.
- **Metric meaning.** Health and Last 7 days use `metrics/global` totals, which mix run-level and step-level rows. The labels say "failed", not "runs failed".

## Open questions

None block the build. The **Default** labels above mark the choices Michael may want to overturn. The two most likely to matter:

1. Built-in view tabs (All, Templates, Needs attention, Drafts) wait for phase 4. Should a static version ship in PR 2 instead?
2. The v2 list drops step-match excerpts under the name. Acceptable behind the flag until a later phase?
