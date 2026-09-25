# Workflows list: what each part costs to build, and how to slice it

Question: [Silthus/posthog#157](https://github.com/Silthus/posthog/issues/157), a child of the map [#144](https://github.com/Silthus/posthog/issues/144).
It sizes the design locked on [#153](https://github.com/Silthus/posthog/issues/153) and prototyped in [#155](https://github.com/Silthus/posthog/issues/155) (combined v2) and [#156](https://github.com/Silthus/posthog/issues/156) (browser, in progress).

Checked against `origin/master` at `8ff2cf4df74` on 2026-09-25.
Paths are relative to the repo root, and line numbers are from master unless marked "prototype".
Prototype paths are on the fork branch `prototype/workflows-list` under `products/workflows/frontend/Workflows/prototypes/`.
Sizes are estimates for one engineer who knows the codebase. "Lines" means production plus tests, excluding generated OpenAPI code.

Earlier research this builds on, not repeated here:

- [`research/workflows-list-folders-and-tags.md`](https://github.com/Silthus/posthog/blob/research/workflows-list-folders-and-tags/research/workflows-list-folders-and-tags.md) (#145)
- [`products/workflows/docs/research/workflows-list-data.md`](https://github.com/Silthus/posthog/blob/research/workflows-list-data/products/workflows/docs/research/workflows-list-data.md) (#146)

## Summary

| Part                                   | Size                                          | PRs          | Migrations                                                        | Dependencies                                                                                                   | Can fake / cut                                                                              |
| -------------------------------------- | --------------------------------------------- | ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| (a) Pill search bar                    | M                                             | 3            | 0                                                                 | Review from outside the team for a new `lib/components/` piece (no owner there)                                | Negation, `library:`, suggestion counts, adoption by other lists                            |
| (b) `in:` scope pill                   | S                                             | 1            | 0                                                                 | (c) folders, folder path on each row                                                                           | The Flat switch (always flat under a scope)                                                 |
| (c) Folders                            | M+ (file browser) or L (side tree)            | 4 or 5       | 0 (lazy backfill)                                                 | FileSystem code has no owner, so review from outside; product sign-off on workflows in the global Project tree | Tree delete, search-following counts, tree-order sort, email templates in folders           |
| (d) Saved views                        | M (S as localStorage)                         | 2            | 1 new table                                                       | (c) for the pinned folder                                                                                      | Built-ins as constants; personal views in localStorage first                                |
| (e) Columns, compact, flat             | S                                             | 1            | 0                                                                 | (d) to store per view; (c) for flat                                                                            | Column reordering; keep per browser until (d)                                               |
| (f) Tags, colors, Manage tags          | L                                             | 5–7          | 0 for tagging after #105497 (else 5 per model); 1 for `Tag.color` | Upstream #105497 (open, conflicting); #104846 for rename and merge; `ObjectTags` change reaches every product  | Colors (hash colors), Manage tags, template tags in a second PR, `/` groups as display only |
| (g) New workflow into folder with tags | S                                             | 2            | 0                                                                 | (c); (f) for the tags half                                                                                     | The AI composer and duplicates land unfiled; tags wait for (f)                              |
| (h) Email rows, "Used by N"            | M                                             | 3            | 0 (backfill is a command)                                         | Shared `CyclotronJobInputs` (no owner)                                                                         | Sends and From are free; count "Used by" on the client; editor fix before backfill          |
| (i) Health                             | S (column) to M (server facet and metric fix) | 1–2          | 0                                                                 | CDP review for the metric meaning; MCP `workflows-global-stats` contract                                       | No server facet under load-all; column only                                                 |
| (j) Owner                              | XS–S now, M later                             | 1 (+2 later) | 0 now; 1 plus backfill later                                      | None                                                                                                           | `owner:me` only; no real field yet                                                          |
| (k) Drop workflow templates            | XS                                            | 0            | 0                                                                 | None                                                                                                           | Nothing to do: master never lists them                                                      |
| (l) Data loading (slim list, load all) | M                                             | 2–3          | 0 (1 optional, nullable)                                          | Slim mode on `messaging_templates` too; OpenAPI regen; MCP `workflows-list` gains fields                       | Compute the summary on read; add a stored column only if slow                               |
| (m) Library tab                        | XS (keep) or S (retire)                       | 0–1          | 0                                                                 | Broadcasts shares the tab bar                                                                                  | Keep it in v1                                                                               |
| (n) Rollout                            | XS                                            | rides along  | 0                                                                 | New flag; public docs live outside this repo                                                                   | —                                                                                           |

Total: about 27 PRs and about 11–12k lines, with 1 required migration (the saved-view table) plus 1 for tag colors.
Tagging needs no migration of ours only if upstream #105497 lands first.

**Slice order** (details in [Ship plan](#ship-plan)):

1. The search bar over today's list: server-backed facets only, plus quick wins.
2. A slim list that loads everything: every facet with counts, dense rows, email templates in the list, built-in views.
3. Folders in the file-browser layout, the `in:` scope pill, and New workflow into the folder.
4. Saved views with per-view columns.
5. Tags (5a), then colors and Manage tags (5b).
6. The email template link: editor fix, backfill, "Used by N" and `library:`.

Later: the health metric fix and a server health facet, a real owner field, retiring the Library tab, and the "By sender and email" mode.

**Critical path:** tags.
Upstream #105497 must re-land and deploy.
Then our taggable registry PR, the tag UI and facet, `Tag.color` with a new tags API shape and `ObjectTags`, and finally Manage tags.
The first step is outside our control, so start it on day one.

## What the prototype faked

The prototype's backend diff (`git diff origin/master...silthus/prototype/workflows-list -- ':!*prototypes*'`) is 60 lines over 7 files, with no migrations.
Everything else is frontend-only on top of fake storage.
A real build replaces each fake below.

| Faked in the prototype                                                                                                                                         | Real build                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tags, colors and saved views in one JSON blob in `Team.extra_settings` (res-150, res-154)                                                                      | `TaggedItem` for tags, a `color` field on `Tag`, and a saved-view table                                                                                                                     |
| Loads every page at limit 500 and joins folders on the client through `api.fileSystem.list` with limit 2000 (prototype `folders/foldersVariantLogic.ts:66-67`) | A slim summary list with the folder path on each row                                                                                                                                        |
| Email template tree rows seeded by hand (res-149)                                                                                                              | `MessageTemplate` syncs into the tree through `FileSystemSyncMixin`                                                                                                                         |
| `register_file_system_type("hog_flow", …, hard_delete=True)` (prototype `products/workflows/backend/apps.py`)                                                  | Skip it, or add delete hooks. As written, a tree delete skips the archive-first rule (`hog_flow.py:5505`) and the activity log and usage event (`perform_destroy`, `hog_flow.py:4555-4565`) |
| Environment scoping fixed only in `posthog/api/file_system/file_system.py:491`                                                                                 | Also fix `posthog/api/file_system/file_system_shortcut.py:102`                                                                                                                              |
| New workflow context (folder and tags) in session storage (prototype `combined/newWorkflowContext.ts`)                                                         | URL params through `/workflows/new/workflow` into `workflowLogic` props (`WorkflowScene.tsx:63-68`)                                                                                         |
| `_create_in_folder` passed through a type cast, OpenAPI not regenerated (res-155)                                                                              | Serializer field with `help_text`, excluded from MCP tool schemas like dashboards and notebooks, then `hogli build:openapi`                                                                 |
| A global mutable facet registry (prototype `shared/workflowFacets.ts:35-50`)                                                                                   | Facets passed as props per instance                                                                                                                                                         |
| No `role` or `aria-*` on the search bar (prototype `shared/WorkflowsSearchBar.tsx`)                                                                            | Combobox semantics: listbox, `aria-activedescendant`, a remove label on each pill                                                                                                           |

The prototype also leaves one master bug in place: `deleteFromTree('hog_flow/', id)` (`products/workflows/frontend/Workflows/workflowsLogic.ts:399,489`) has a trailing slash, which means a prefix match (`frontend/src/layout/panel-layout/ProjectTree/utils.tsx:461`), so it never matches the `hog_flow` type.

## Per part

### (a) Pill search bar

**Placement.**
Put a controlled, presentational `FacetSearchBar` in `frontend/src/lib/components/`, and keep the workflow facet definitions, row derivation and matching in `products/workflows/frontend/`.
Making it generic costs about 1 extra PR and 300 lines over a product-local bar.

- Nothing in the codebase does "pick a facet, then a value" with pills.
  - `SearchAutocomplete` (`frontend/src/lib/components/SearchAutocomplete/SearchAutocomplete.tsx`, 361 lines) already parses `category:value` with negation and has `aria-autocomplete`. The project tree search uses it (`frontend/src/layout/panel-layout/ProjectTree/TreeSearchField.tsx`). It outputs a string, with no pills and no counts.
  - `LemonInputSelect` keeps its input text internal, so it can't do facet then value (res-148).
  - Logs and Replay vision each built their own chips locally (`products/replay_vision/frontend/components/FilterPill.tsx`).
  - `UniversalFilters` is for taxonomic property filters, not enum facets.
- Lists that could adopt it later. Each is server-paginated, so each needs facets whose values come from a static list or an async loader:
  - `frontend/src/scenes/feature-flags/FeatureFlagFilters.tsx` (five dropdowns plus search)
  - `frontend/src/scenes/hog-functions/filters/HogFunctionFilters.tsx`
  - `frontend/src/scenes/surveys/components/SurveysTable.tsx`
  - `frontend/src/scenes/dashboard/dashboards/DashboardsFiltersBar.tsx`
  - `frontend/src/scenes/saved-insights/SavedInsightsQuickFilters.tsx`
  - `frontend/src/scenes/cohorts/Cohorts.tsx`, `frontend/src/scenes/notebooks/NotebooksTable/NotebooksTable.tsx`
  - `products/actions/frontend/components/ActionsTable.tsx`, `products/alerts/frontend/components/AlertsFiltersBar.tsx`
  - Conversations ticket filters and `TicketAppliedFilters`
- So design facet values as "static, async, or derived from loaded rows", but don't commit to migrating any other list.

**Backend: server filters on `GET hog_flows/`** (`products/workflows/backend/api/hog_flow.py`).

| Facet           | Today                                                                               | Work                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `status`        | One exact value (`:3884-3889`)                                                      | Multi-value and negation: XS                                                                                                            |
| `type`          | Comma list (`:4163-4172`)                                                           | Negation: XS                                                                                                                            |
| `trigger`       | One JSON containment value (`:4196-4203`)                                           | OR list: XS                                                                                                                             |
| `created-by`    | One uuid (`:4155-4161`)                                                             | Multi-value: XS                                                                                                                         |
| text            | Tiered search over name and description, then step and email content (`:4209-4232`) | None                                                                                                                                    |
| `channel`       | Missing                                                                             | S: `billable_action_types__contains` for email, SMS and push (model `hog_flow.py:201`); `template_id` containment for Slack and webhook |
| `sends`         | Missing                                                                             | S: JSON path on the email subject                                                                                                       |
| `from`          | Missing                                                                             | S–M: integration id to address                                                                                                          |
| `owner`         | Missing                                                                             | See (j)                                                                                                                                 |
| `tag`, `folder` | Missing                                                                             | S each, after (f) and (c)                                                                                                               |
| `health`        | Missing                                                                             | See (i)                                                                                                                                 |
| `library`       | Missing                                                                             | See (h)                                                                                                                                 |
| `kind`          | Missing                                                                             | L if server-side: one ordered, paginated list across two tables                                                                         |

Doing every facet server-side, with facet counts, is L–XL.
With the load-all model in (l), only the XS rows above are needed for slice 1, and the rest run on the client.

**Frontend.**

- `FacetSearchBar`: value is filters plus text with `onChange`; facets as props (key, label, aliases, values or a loader, optional counts, group separator); a leading scope slot for (b); parse and serialize; the hint row, Tab and → from #154.
- Stories and Jest tests for the parser, matching and keyboard.
- Workflows: facet definitions and a list logic that replaces `products/workflows/frontend/Workflows/workflowsLogic.ts` (552 lines) and moves from `api.hogFlows.getHogFlows` (`frontend/src/lib/api.ts:6396`) to the generated `hogFlowsList`. Old URL params (`status`, `trigger_type`, `created_by`, `search`) redirect into `q`. `WorkflowsTable.tsx` (447 lines) gets reworked.

**Dependencies.** `frontend/src/lib/components/owners.yaml` has no rule for a new component. Add one for `team-workflows` and expect review from outside the team.

**Risks.**

- Too many facets on focus (res-148). Show the common ones first.
- Search step-match hints (`workflowSearchMatches.ts`) read `actions` and `draft`. A slim row drops those, so keep server search for body text and return match info or load it lazily.

**Size.** M, 3 PRs, about 2k lines (generic bar about 1.1k, workflows wiring about 0.9k).

**Cut.** Negation, `library:`, suggestion counts under pagination, and adoption by other lists.

### (b) The `in:` scope pill

- It needs each row's folder path. The cheapest source is a `folder` field on the list row through a subquery on `FileSystem (type, ref)`, covered by index `posthog_fs_team_s_typeref` (`posthog/models/file_system/file_system.py:43`). The dashboards `_folder_path` annotation is the precedent (`products/dashboards/backend/api/dashboard.py:2687-2695`).
- Frontend: the bar's scope slot (prototype `combined/ScopedSearchBar.tsx`, 17 lines), a `folder` URL param, and tree order plus relative path (prototype `combined/combinedVariantLogic.ts:80-110`, `compareTreeOrder`, `relativePathOf`).
- Risk: a `FileSystem` path includes the item name, and `/` inside names is escaped (`split_path`), so derive the folder with the existing helpers.
- **Size.** S, 1 PR, about 400 lines. No migrations.
- **Cut.** The Flat switch: always flat under a scope.

### (c) Folders

**Backend.**

- `HogFlow` joins the tree through `FileSystemSyncMixin` (`posthog/models/file_system/file_system_mixin.py:17`). The mixin is abstract, so no migration. Copy `HogFunction` (`products/cdp/backend/models/hog_functions/hog_function.py:176-211`). The prototype diff is close to this.
- `MessageTemplate` (`products/messaging/backend/models/message_template.py`) joins the same way. It is team-scoped and soft-deleted, so its representation uses `should_delete=self.deleted`.
- `posthog/models/file_system/unfiled_file_saver.py`: two `MIXIN_MODELS` entries.
- Environment scoping for both types at `posthog/api/file_system/file_system.py:491` and `file_system_shortcut.py:102`.
- Use the type string `hog_flow`. Access control filters tree rows on the resource name (`products/access_control/backend/facade/user_access_control.py:1411-1416`), and `hog_flow` is already a resource (same file, line 76), so per-object access rules work in the tree for free.
- Exclude broadcasts (`origin_product`, `hog_flow.py:136-138`): they have their own scene. Loops are on the Workflows page today (`workflowsLogic.ts:24`), so including them is a product call.
- Guard draft-only saves: the mixin's post-save always runs `create_or_update_file` (`posthog/models/file_system/file_system.py:66-94`), including draft autosaves. `hog_flow_saved` already skips those (`hog_flow.py:221-226`).
- `?folder=` on `hog_flows` and `messaging_templates`, recursive. The dashboards filter matches direct children only, because it pins `depth` (`dashboard.py:2603-2624`). Drop the depth pin and keep `path__startswith=f"{folder}/"`. The `Exists` lookup goes through the `(team_id, surface, type, ref)` index, so the path prefix check runs on one row.
- Tree counts that follow the search: an action (or a key in the list response) that runs the list filter, then maps the matching refs to paths and adds each item to every ancestor. With load-all (l) this runs on the client instead.

**Backfill.** None to write. `GET file_system/unfiled?type=` bulk-creates `Unfiled/…` rows on first use (`unfiled_file_saver.py:57-113`, `file_system.py:205,959`). The scene should call it on mount, and the filter should treat "no row" as the root so correctness never depends on it.

**Frontend.**

- Manifest `fileSystemTypes` entries for `hog_flow` and `message_template` (`products/workflows/manifest.tsx` declares only an unused `workflows` key).
- Fix the two `deleteFromTree` calls.
- Reuse `moveToLogic` (`frontend/src/lib/components/FileSystem/MoveTo/moveToLogic.tsx:124`) for Move to with undo, and `FolderSelect` (`frontend/src/lib/components/FileSystem/FolderSelect/FolderSelect.tsx:37`).

**Side tree or file browser (cost only).**

|               | Side tree (combined, #155)                                                                                                                                                                                                                                                      | File browser (#156)                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend       | Recursive counts for every folder in the tree                                                                                                                                                                                                                                   | Counts for the current folder's children only; searching is flat with relative paths                                                                         |
| Reuse         | `<ProjectTree onlyTree>` fits poorly: it shows every item type, navigates on click and can't take outside counts (`frontend/src/scenes/project-files/ProjectFilesScene.tsx:42-48`, `ProjectTree.tsx:70-74`). So a custom tree, like prototype `combined/CombinedFolderTree.tsx` | Folder rows and `..` in the existing `LemonTable` (prototype `combined/ItemsTable.tsx` `showFolderRows`); `ProjectFilesScene.tsx:30-38` has a `..` precedent |
| Narrow widths | Needs the Folders-menu fallback below about 900px                                                                                                                                                                                                                               | Works as is                                                                                                                                                  |
| Frontend      | About 1k lines, 2 PRs                                                                                                                                                                                                                                                           | About 650 lines, 1–2 PRs                                                                                                                                     |

The file browser saves about 1 PR and 300–400 lines, plus the recursive counts query and the narrow fallback.
It loses the at-a-glance view of which folders hold search hits.

**Dependencies.**

- `posthog/api/file_system/`, `posthog/models/file_system/` and `frontend/src/layout/panel-layout/ProjectTree/` have no owner in CODEOWNERS or any `owners.yaml`. Plan a reviewer from outside Workflows for the scoping edits.
- **Product sign-off:** every workflow and email template also appears in the global left-nav Project tree under `Unfiled/…`, in tree search and in the Move to modal, the way hog functions already do.

**Risks.**

- The scene root: the prototype keeps folders under a `Workflows/` root. A workflow moved elsewhere through the global tree drops out of the scene. Needs a decision.
- Tree-order sorting ("subfolders first, then loose items") needs a custom key if sorted on the server. Under load-all it is a client sort.

**Size.** File browser: M+, 4 PRs, about 1.4k lines. Side tree: L, 5 PRs, about 1.8k lines. No migrations.

**Cut.** Tree delete registration (tree deletes then refuse with "Cannot delete resources with type", `file_system.py:841-842`; moves still work), search-following counts, email templates in folders in the first cut.

### (d) Saved views

- **No generic primitive exists.** Every saved-view model belongs to one product:
  - `DashboardSavedView` (`products/dashboards/backend/models/dashboard_saved_view.py:14-54`): `TeamScopedRootMixin`, `name`, `filters` JSON, `scope` private or team, `can_modify` checks, and cleanup when a user is deleted. API `products/dashboards/backend/api/dashboard_saved_view.py` (378 lines). **Best template: it already answers project versus personal with both.**
  - `LogsView` (`products/logs/backend/models.py:171-187`) and `TracingView` (`products/tracing/backend/models.py:189-217`): filters, columns, pinned, no scope.
  - `TicketView` (`products/conversations/backend/models/ticket_view.py:9`), `SessionRecordingPlaylist`, `UserHomeSettings`, `UserProductList`: poor fits.
- **Backend:** a new `WorkflowsListView` in `products/workflows/backend/models/`, copied from `DashboardSavedView`: `team`, `created_by`, `name`, `scope` (private or team), and `settings` JSON (`q`, text, folder, flat, compact, columns). Serializer, viewset, route in `products/workflows/backend/routes.py`, and new operations in `products/workflows/mcp/tools.yaml` with `enabled: false`.
- **Migrations:** 1, a new table. No lock risk with the `db_constraint=False` foreign key pattern. No backfill.
- **Frontend:** productize prototype `combined/ViewTabs.tsx` (213 lines) and the view shape in `combinedStore.ts:90-104`. Built-ins (All, Templates, Mine, Needs attention, Drafts) are frontend constants.
- **Risks:** tab counts need either a count per view or load-all (l). Store the folder as a `FileSystem` id, not a path, or a rename breaks the view.
- **Size.** M, 2 PRs, about 1.4k lines.
- **Cut.** Personal views in localStorage through kea `persist` (S, about 250 lines), team scope later.

### (e) Columns, compact and flat

- Frontend only.
- `ColumnConfigurator` (`frontend/src/queries/nodes/DataTable/ColumnConfigurator/`) is tied to HogQL data tables. Copy `products/conversations/frontend/scenes/tickets/TicketColumnsDropdown.tsx` (71 lines) and `ticketColumnsLogic.ts` (48 lines) instead.
- Compact is `LemonTable size="small"` (`frontend/src/lib/lemon-ui/LemonTable/LemonTable.tsx:68`).
- Refactor the columns in `products/workflows/frontend/Workflows/WorkflowsTable.tsx:149-280` into a registry, and add Tags, Sends, Owner and Health.
- Flat is a render mode that depends on (c).
- **Size.** S, 1 PR, about 400 lines.
- **Cut.** Column reordering. Persist per browser until (d) ships.

### (f) Tags on workflows and email templates

**Migration state and upstream work** (states checked 2026-09-25).

| PR                                                                                                   | State                                       | What it means here                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#105497](https://github.com/PostHog/posthog/pull/105497) re-land the legacy tagged-item key untrack | Open, not draft, merge conflicts, +567/−686 | **The gate.** After it, a new taggable model needs a `TAGGABLE_MODELS` entry and the `Taggable` base, with no migration. Its migrations `1378`/`1379` collide with master (latest `1381`) and need renumbering. It is the second attempt: the first was reverted in #105316 |
| [#104436](https://github.com/PostHog/posthog/pull/104436) drop the legacy columns                    | Open, changes requested                     | Cleanup only, not on our path                                                                                                                                                                                                                                               |
| [#103019](https://github.com/PostHog/posthog/pull/103019) pinned tags and tags on workflows          | Draft, +1090/−87, last update 09-18         | Migrations `1369`–`1374` collide with master. Five of six become unneeded after #105497; only `tag.pinned` stays. Worth lifting: the `?tags=` filter helpers, `TagSerializer`, the `hog_flow` activity logger                                                               |
| [#103021](https://github.com/PostHog/posthog/pull/103021) Manage tags and tag filter on the list     | Draft, stacked on #103019, +604             | A UI reference (`ManageWorkflowTagsModal.tsx`, `workflowTagsLogic.ts`)                                                                                                                                                                                                      |
| [#104846](https://github.com/PostHog/posthog/pull/104846) manage support ticket tags from settings   | Draft, updated today                        | Adds generic rename, merge, delete and usage to `posthog/api/tagged_item.py`. That is the Manage tags backend. Conflicts with #103019 in the same file                                                                                                                      |

**Options for the gate.**

1. Help #105497 land, then send our own small PR (registry plus mixins), lifting helpers from #103019. **Recommended.**
2. Write the legacy five-migration sequence ourselves, per model (as Experiment needed, `1356`–`1360`). That rebuilds constraints on the same `posthog_taggeditem` table #105497 is changing. Not recommended.
3. An interim `tags` array on `HogFlow` and `MessageTemplate` (precedent `HogFlowTemplate.tags`, `products/workflows/backend/models/hog_flow/hog_flow_template.py:43`). One migration per table, no shared `Tag`, so no colors and no project-wide Manage tags, plus a later migration back to `TaggedItem`. Only if #105497 slips by weeks.

**Backend (after #105497).**

- `posthog/models/tagged_item_registry.py:51-73`: add `workflows.HogFlow` and `messaging.MessageTemplate` (both UUID models).
- `Taggable` base (`posthog/models/tagged_items_relation.py:69-75`): a generic relation, no column.
- `hog_flow.py`: `TaggedItemSerializerMixin` on `HogFlowMinimalSerializer` (`:2813`); `TaggedItemViewSetMixin` with the UUID bulk serializer on `HogFlowViewSet` (`:4036`, `posthog/api/tagged_item.py:318-326`), which gives bulk tagging for free; a tag filter in `safely_get_queryset` (`:4149`). Tags are metadata, not draft content (`hog_flow.py:206-216`), so no worker reload.
- `products/messaging/backend/api/message_templates.py`: the same on `MessageTemplateSerializer` (`:104`) and the viewset (`:283`).
- `/` groups are a naming convention: `tagify` only strips and lowercases (`posthog/models/tag.py:7-8`). `tag:team/*` needs a `startswith` branch in the filter helper.
- Activity logging for both, as #103019 did.

**Colors.**

- `Tag` has no color field (`posthog/models/tag.py:11-16`). Adding one is 1 `AddField` with a default on a shared core table: low risk.
- `cleanup_orphan_tags` (`posthog/api/tagged_item.py:49-51`) deletes any tag with no tagged items on every tag write, so a recolored tag loses its color when its last object drops it. Exclude colored tags from the cleanup, or use pinned tags.
- `GET /projects/:id/tags` returns bare names (`tagged_item.py:463-477`), and `tagsModel` holds `string[]` (`frontend/src/models/tagsModel.ts`). Colors need an opt-in response shape so existing consumers don't break.
- "Same color in every product" means changing `ObjectTags`, which hash-colors today (`ObjectTags.tsx:134`, `lib/utils/colors.ts:5`). It renders in about 35 places. The change is small, but it needs visual review across products and a choice between mapping the palette onto `LemonTag` types or teaching `LemonTag` custom colors.

**Manage tags.** Tags are project-wide, so a rename in Workflows also renames the tag on dashboards and flags. The screen must show usage elsewhere, as #104846 does. Open: may a user rename a tag on objects they cannot edit?

**Frontend.** Prototype pieces total about 680 lines (`InlineTagEditor` 177, `TagPicker` 151, `ManageTagsModal` 160, `TagPill` 78, `RowTagsCell` 75, `TagColorSwatches` 39). Production with a logic on generated types, tests and stories: about 1.2–1.6k lines.

**Ownership.** No `owners.yaml` rule or CODEOWNERS entry covers `posthog/models/tag*`, `posthog/api/tagged_item.py` or `ObjectTags`. In practice the owners are the authors of the generic-pointer work. Workflows and messaging are `team-workflows` (`.github/CODEOWNERS:94-99`). Tagging is not paywalled.

**Risks.** When #105497 lands and deploys; the #103019 and #104846 conflict; the cross-product reach of rename, merge and recolor.

**Size.** L, 5–7 PRs, about 2.5k lines: tagging S (1 PR), color S (1 PR, 1 migration), Manage tags S with #104846 or M without, frontend M–L (2–3 PRs), `ObjectTags` color S (1 PR, cross-team).

**Cut.** Colors (hash colors look the same everywhere for free), Manage tags, pinned tags, `/` groups as display only, template tags in a second PR.

### (g) New workflow into the folder, with the filter's tags

- Every UI create path goes through `/workflows/new/workflow`: the template chooser adds `templateId` (`products/workflows/frontend/Workflows/newWorkflowLogic.ts:166-176`), AI-first adds a mode (`:152-159`), and one call creates it (`workflowLogic.ts:3154`). Folder and tags can ride as URL params into `WorkflowLogicProps` (`workflowLogic.ts:59-64`).
- **The AI composer is a different path.** It calls the MCP tool `workflows-create` (`newWorkflowAgentLogic.ts:23`, `products/workflows/mcp/tools.yaml:135`). The LLM writes that payload, so apply the folder and tags on the client after `findCreatedWorkflowId` (`newWorkflowAgentLogic.ts:131-152`), which resolves by exact name and is already fragile.
- Backend: `_create_in_folder` on `HogFlowSerializer` and `MessageTemplateSerializer` (`message_templates.py:173`), excluded from the MCP create schemas.
- **Size.** S, 2 PRs, about 300 lines. No migrations.
- **Cut.** The composer and duplicates land unfiled; tags wait for (f).

### (h) Email rows and "Used by N"

- **Sends and From** are free on the client from `actions` (res-146). From costs one integrations call. Under a slim row (l), the summary carries channels, subjects and sender ids.
- **The link is lost today.** `applyTemplate` copies only the content (`frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx:725-734`). Only the API and MCP path persist `config.template_uuid` (`hog_flow.py:636-680`, `:697-775`).
- **Editor fix:** pass the template id from `emailTemplaterLogic` through `CyclotronJobInputs.tsx:300-320` (shared, no owner) into `HogFlowFunctionConfiguration.tsx:260-288`. No backend change. S, about 150 lines. Product call: after an edit, keep the link as "based on" or detach it?
- **Backfill:** a management command, not a data migration. Copy `products/workflows/backend/management/commands/rewrite_email_asset_url.py`, which already walks `actions` and `draft` with dry run and batches. Match on an exact content hash first, subject only as an opt-in fallback. S–M, about 450 lines. The prototype found about a quarter of email steps unlinked (res-152), and subject matching is a heuristic.
- **"Used by N":** a team-scoped JSON path query over `actions`, grouped by template id, exposed from the workflows side (`hog_flow.py` already imports messaging; messaging never imports workflows). `library:` is `actions__contains`, like the trigger filter (`hog_flow.py:4196-4204`). Follow `.agents/security.md` for any raw SQL. S, about 300 lines.
- **Size.** M, 3 PRs, about 1.2k lines. No migrations.
- **Cut.** Count "Used by" on the client from loaded rows. Ship the editor fix first, so new steps keep the link while the backfill is built.

### (i) Health

- `metrics/global` (`hog_flow.py:5444-5489`) runs one ClickHouse `app_metrics2` query for succeeded and failed totals per workflow (`posthog/api/app_metrics2.py:245-300`). No caching.
- **Column:** one call per list instead of today's one sparkline query per row (`WorkflowsTable.tsx:243-272`). Frontend only, XS–S. A quick win on the current list.
- **Server facet** (only if the list stays paginated): cached totals, then `id__in`. S, about 270 lines.
- **Risk: the numbers mean something else.** `metrics/global` sums run-level and step-level rows, and drops batch and broadcast runs keyed by run id (`products/workflows/CONTRIBUTING.md:304-320`). The sparkline counts runs only. A fix needs a variant query and a CDP reviewer. The MCP `workflows-global-stats` tool (`tools.yaml:234-250`) shares the endpoint, so add a parameter instead of changing it in place.
- **Size.** S (column) to M (facet plus metric fix), 1–2 PRs, about 400 lines.
- **Cut.** No server facet under load-all. Label it "failed in 7 days", not "runs", until the metric is fixed.

### (j) Owner

- **Now:** parse `Owner: @x`, then `created_by`. Under load-all this is client-only, a port of prototype `shared/workflowListItems.ts:107-116`. A server filter for API and MCP callers is a regex next to `created_by` (`hog_flow.py:4155-4161`): XS–S, 1 PR, about 220 lines. JS and Postgres regex differ, and a regex built from user input draws semgrep review.
- **Later:** a nullable `owner` foreign key on `HogFlow` (migration `0027` in `products/workflows/backend/migrations/`), `MemberSelect` in the UI, and a backfill that sets it only on a unique member match. The CDP Node side selects explicit columns (`nodejs/src/cdp/services/hogflows/hogflow-manager.service.ts:157,180`), so a new column is harmless there. M, 2 PRs, about 600 lines.
- **Cut.** Ship only `owner:me`.

### (k) Dropping workflow templates from the list

Master never lists them: `WorkflowsTable.tsx`, `workflowsLogic.ts` and `WorkflowsScene.tsx` never load hog flow templates, and `workflowTemplatesLogic` is used only by the New workflow modal and chooser.
Only the prototype adds them (`shared/workflowsPrototypeLogic.ts:124`).
Cost: none. Don't port that part.

### (l) The data-loading model

**Today.**

| Endpoint                                                                  | Default page | Max  | UI sends                                  |
| ------------------------------------------------------------------------- | ------------ | ---- | ----------------------------------------- |
| `hog_flows` (`hog_flow.py:3892-3894`)                                     | 100          | 500  | 30 (`workflowsLogic.ts:46`)               |
| `messaging_templates` (global default, `posthog/settings/web.py:526-529`) | 100          | none | no limit (`frontend/src/lib/api.ts:6371`) |

The Library tab sends no limit, so it only ever shows the first 100 templates. That is a bug today.

**Row size.**

- `HogFlowMinimalSerializer` (`hog_flow.py:2813-2882`) returns full `actions`, `edges` and `draft`, deep-copied and secret-masked per row.
- Built from the 18 global templates in `products/workflows/backend/templates/` into rows of that shape, a row averages about 25 KB raw, and each email step adds about 20–24 KB (a third of it is the design JSON). A staged draft can double a row.
- `hog_flows` is not in `GZIP_RESPONSE_ALLOW_LIST` (`posthog/settings/web.py:849`).
- A slim row (id, name, description, status, type, trigger summary, channels, email subjects, sender ids and template ids, creator, dates, tags, folder, has-draft, access level) is about 1 KB raw. The gzip figure is an estimate.

| Workflows | Full rows today         | Slim rows      |
| --------- | ----------------------- | -------------- |
| 1,000     | 25–50 MB, 2 requests    | about 1 MB raw |
| 5,000     | 125–250 MB, 10 requests | about 5 MB raw |

**Recommendation: load everything through a slim summary list, and run facets on the client.**
It is the only model where `kind:` (two tables), live tree counts, facet counts, tab counts and the `in:` scope stay cheap.
Keep server text search for email body content.
Add the simple server filters too, for MCP and API callers.
If a project ever outgrows load-all, fall back to server filters above a row threshold.

- **Backend:** a slim mode on `hog_flows`, extending `HogFlowSummarySerializer` (`hog_flow.py:2885-2904`, already used by the MCP list), with a higher limit for that mode. A slim mode on `messaging_templates`, whose serializer returns the full `content` (`products/messaging/backend/api/message_templates.py:119-129`). Add `hog_flows` to the gzip allow list.
- **Optional:** a stored `list_summary` JSON column computed on save next to `billable_action_types`, so the list stops reading every `actions` blob. 1 nullable-column migration (no rewrite) and a batched backfill. Only if computing on read is slow.
- **Generated types:** regenerate `products/workflows/frontend/generated/` and `products/messaging/frontend/generated/`. Other `hogFlowsList` callers: `Broadcasts/broadcastsLogic.ts`, `emptyState/workflowsSetupLogic.ts`, `frontend/src/scenes/notebooks/Notebook/MarkdownNotebookEntityPicker.tsx`.
- **MCP:** `workflows-list` (`products/workflows/mcp/tools.yaml:251-269`, `services/mcp/src/tools/generated/workflows.ts:177`) already uses the summary serializer, so new fields and params reach agents after `hogli build:openapi`. Update its description, and optionally `mcp/apps/WorkflowListView.tsx`. `workflows-list-email-templates` is `messaging_templates_list` (`products/workflows/mcp/email_templates.yaml:60`).
- **Risk:** client-side duplicate reads the full graph from the list row (`hog_flow.py:4130-4134`), so it must fetch the workflow first.
- **Size.** M, 2–3 PRs, about 1k lines.

### (m) The Library tab

- `messagingNavTabs` (`products/workflows/frontend/messagingTabs.tsx:11-56`) is shared by `WorkflowsScene.tsx` and `Broadcasts/BroadcastsScene.tsx` (`/broadcasts/library`, `manifest.tsx:60`).
- To retire it on `/workflows`, the unified list must take over: New template (`MessagingTabActions.tsx:30-31`), the empty state and the `create_message_template` assistant hook (`MessageTemplatesTable.tsx:34-53`), Duplicate and Delete (`:85-92`), and back links to `urls.workflows('library')` (`messageTemplateSceneLogic.ts:42-44`, `messageTemplateLogic.ts:382`). Keep `/workflows/library` redirecting (`messagingTabs.tsx:10` warns about bookmarks).
- **Size.** Keep: XS. Retire on `/workflows`: S, 1 PR, about 250 lines. Broadcasts: another S.
- **Recommendation:** keep it until email templates have lived in the list for a while.

### (n) Rollout

- One flag, for example `WORKFLOWS_LIST_V2: 'workflows-list-v2', // owner: #team-workflows` in `frontend/src/lib/constants.tsx`, following the comments at `:586-596`. Backend additions are additive params and endpoints and need no flag.
- Dogfood on the team's own project first, then a gradual rollout. Keep the old table behind the flag until tags land, because folders without tags is the first real test of the tree side effect.
- Public workflows docs live on posthog.com, not in this repo (`docs/published/docs/` has no workflows section). Internal docs are `docs/internal/workflows-*.md` and `products/workflows/CONTRIBUTING.md`; update CONTRIBUTING if the health metric changes.
- MCP: `workflows-list` only gains optional params and fields. The `workflows-global-stats` caveat from (i) applies. Check the `products/workflows/skills/building-workflows/` skill.
- Owner: `team-workflows` (`products/workflows/product.yaml`, `products/messaging/product.yaml`, `.github/CODEOWNERS:94-100`).

## Ship plan

### Is the search bar the right first slice?

**Yes, with one condition.**
The bar replaces four dropdowns, needs no migration and no other team, and everything later plugs into it as a facet.
The condition: in slice 1, offer only facets the server can answer across pages (status, type, trigger, created by, text).
Channel, sends, from, owner and health depend on row data.
Over today's 30-row pages they would filter one page and show wrong counts, so they wait for slice 2.
Slices 1 and 2 can be built at the same time by two people, since one is mostly frontend and the other mostly backend.

### Slices

| #     | Slice                                                                                                                                                                                                                                                      | Users get                                                                              | Depends on                                                                   | Size                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| 1     | **Search bar over today's list** (a), with XS server filters (multi-value status, trigger, created by; negation), old URL params redirected, the flag, plus quick wins: one `metrics/global` call for Last 7 days, compact rows                            | One bar with pills instead of four dropdowns, shareable filter URLs, a faster list     | Nothing                                                                      | M, 3–4 PRs, about 2.2k lines              |
| 2     | **Slim list, load everything** (l), client facets (channel, sends, from, owner, health, kind), email templates in the list, Sends and From cells (h, client part), column picker per browser (e), built-in views as constants (d, fake), health column (i) | Every facet with counts, email answers in the rows, Needs attention, All and Templates | 1                                                                            | M, 4 PRs, about 1.8k lines                |
| 3     | **Folders, file browser** (c), `in:` scope pill (b), Move to, New workflow into the folder (g, folder half)                                                                                                                                                | Folders for workflows and email templates, scoped search, filing on create             | 2 (folder on the slim row); layout pick; product sign-off on the global tree | M+, 5–6 PRs, about 2k lines               |
| 4     | **Saved views** (d) with per-view columns, flat and compact (e)                                                                                                                                                                                            | Your own and shared views, modified dot, Save and Update                               | 3 (pinned folder)                                                            | M, 2 PRs, about 1.4k lines                |
| 5a    | **Tags** (f): tagging both kinds, row tags with inline edit, bulk, `tag:` with groups; New workflow applies the filter's tags (g)                                                                                                                          | Tags across workflows and email templates                                              | Upstream #105497                                                             | M, 3 PRs, about 1.3k lines                |
| 5b    | **Colors and Manage tags** (f): `Tag.color`, tags API shape, `ObjectTags`, Manage tags                                                                                                                                                                     | Colored tags, rename, recolor, merge                                                   | 5a; #104846 or our own rename and merge                                      | M, 2–4 PRs, about 1.2k lines, 1 migration |
| 6     | **Email template link** (h): editor keeps the link, backfill command, "Used by N", `library:`                                                                                                                                                              | The reverse answer: which workflows send this email                                    | Editor fix: nothing (start day one); "Used by N": the backfill               | M, 3 PRs, about 1.2k lines                |
| later | Health metric fix and server facet (i), real owner field (j), retire the Library tab (m), the "By sender and email" mode, tiles                                                                                                                            |                                                                                        |                                                                              | S–M each                                  |

Slice 6 is last in value order but first in start order: every day without the editor fix adds more unlinked email steps that the backfill must guess at.

### Critical path

**Tags** is the longest chain, and its first link is outside the team:

1. #105497 re-lands: resolve conflicts, renumber `1378`/`1379`, deploy (it is a second attempt after a revert).
2. Our registry PR: `HogFlow` and `MessageTemplate` taggable, filters with `/*`.
3. Tag UI, `tag:` facet, New workflow applies tags.
4. `Tag.color`, the opt-in tags API shape, `ObjectTags` using stored colors (cross-product review).
5. Manage tags, on #104846's generic rename and merge, or our own.

The longest chain inside our own code is slices 1 → 2 → 3 → 4 (about 14 PRs in sequence), but none of it waits on another team.
If #105497 slips by weeks, fall back to option 3 in (f) (an interim `tags` array) only if tags are needed before it lands.

### What can run in parallel

- **Track A, the list:** slices 1 → 2 → 3 → 4. Slices 1 and 2 overlap (frontend bar and backend slim mode).
- **Track B, tags:** push #105497 on day one, prepare the registry PR against it, and build the tag UI against the prototype's shapes while waiting.
- **Track C, email link:** the editor fix on day one, then the backfill command, then "Used by N" once slice 2 shows email templates.
- **Track D, health meaning:** the `metrics/global` fix with a CDP reviewer, any time before health becomes a server facet.
- The layout pick (side tree or file browser) and the global-tree sign-off only block slice 3, so ask for them now.

### Quick wins with no backend work

- Replace the four dropdowns with the bar, mapped to today's server params (slice 1 frontend).
- Load Last 7 days with one `metrics/global` call instead of one query per row.
- Compact rows (`LemonTable size="small"`) and a column picker saved per browser.
- Sends icons from `actions`, which today's rows already carry.
- Dropping workflow templates: nothing to do on master.
- Fix the Library tab's first-100 limit, which is a bug today.

Don't ship row-derived facets (channel, sends, from, owner, health) over today's paginated list: they filter one page and the counts are wrong.
