# Workflows list: folder, file and tag primitives, and upstream work in flight

Research for [Silthus/posthog#145](https://github.com/Silthus/posthog/issues/145) (map [#144](https://github.com/Silthus/posthog/issues/144)).
Snapshot: `master` at `74299d1d61f` (2026-09-25), upstream searched on 2026-09-25.
All paths are relative to the repo root. Line numbers are from that commit.

## TL;DR

- **Folders** come from the project tree (`FileSystem`). Workflows (`HogFlow`) and templates (`HogFlowTemplate`) are **not** in it today. Adding `HogFlow` needs **no migration**: one mixin plus five small registrations.
- **Tags** come from `TaggedItem`. Workflows are **not** taggable on `master`. Upstream has an open, draft stack that adds exactly this: [#103019](https://github.com/PostHog/posthog/pull/103019) (API + pinned tags) and [#103021](https://github.com/PostHog/posthog/pull/103021) (workflows list UI). Doing it by hand today costs a five-migration `TaggedItem` sequence, because the move to a generic pointer is half done (one step reverted after a prod deadlock).
- **Pill search bar**: nothing drop-in. The closest parts are `LemonInputSelect mode="multiple"` (renders `LemonSnack` pills), `SearchAutocomplete` (`key:value` token grammar), and the Conversations `TicketAppliedFilters` pill row. The `FileSystem` search API already speaks `type:` / `name:` / `user:` / `path:` tokens.
- The workflows list is already server-paginated (30 per page) with server-side search, so new filters (`folder`, `tags`) belong on the `hog_flows` API.

## 1. Folders: the `FileSystem` project tree

### Backend models (`posthog/models/file_system/`)

- `FileSystem` (`file_system.py:16-45`): `team`, `id` (uuid7), `path` (escaped, `a/b\/c`), `depth`, `type`, `ref`, `href`, `shortcut`, `meta` (JSON), `created_at`, `created_by`, `surface` (NULL = web).
  Indexes on `(team, surface, path)`, `(team, surface, depth)`, `(team, surface, type, ref)`.
  Helpers: `create_or_update_file` (`:48-110`), `delete_file` (`:113`), `split_path` / `escape_path` / `join_path` (`:119-151`).
- `FileSystemShortcut` (`file_system_shortcut.py:11-34`): per-user starred items with `order`.
- `FileSystemViewLog` (`file_system_view_log.py:23-35`): backs Recents.
- `FileSystemHomeFolder` (`file_system_home_folder.py:12-16`): per-user `Users/<name>` folder (added upstream in [#104863](https://github.com/PostHog/posthog/pull/104863)).
- `FileSystemRepresentation` (`file_system_representation.py`): `base_folder, type, ref, name, href, meta, should_delete, surface`.
- **`FileSystemSyncMixin`** (`file_system_mixin.py:17-129`) is the opt-in point. `__init_subclass__` wires `post_save` / `post_delete` receivers (`:32-76`) that call `get_file_system_representation()` and create, update or delete the row. A `_create_in_folder=` kwarg (`:28-30`) places a new object in a chosen folder. Subclasses implement `get_file_system_unfiled` (`:79`) and `get_file_system_representation` (`:91`).
- `UnfiledFileSaver` (`unfiled_file_saver.py`): `MIXIN_MODELS` (`:26-39`) is the hand-kept registry of synced models; `save_unfiled_files` (`:109`) backfills objects that have no row yet.

### API (`posthog/api/file_system/file_system.py`, routed at `posthog/api/rest_router.py:207-212`)

- List params (`safely_get_queryset`, `:497-561`): `depth`, `path`, `parent` (prefix), `type`, `not_type`, `type__startswith`, `ref`, `order_by`, `created_at__gt/lt`, `search`, `search_name_only`. LimitOffset pagination. Folders sort first.
- **Search token language** (`_apply_search_to_queryset`, `:356-472`; shlex tokenizer `:234`): `path:x`, `name:x`, `user:me` / `user:"Name"` (alias `author:`), `type:x` (exact) or `type:x/` (prefix), `ref:x`. Quotes work, `-` or `!` negates, tokens AND together.
- Actions: `move` (`:989`), `link` (`:1045`), `count` (`:1096`), `count_by_path` (`:1168`), `unfiled` (`:958`), `log_view` (`:1120`), `undo_delete` (`:913`), `home_folder` (`:290`), recursive `destroy` (`:876`; `recursive=false` added upstream in [#104429](https://github.com/PostHog/posthog/pull/104429)). Parent folders are created on demand (`_assure_parent_folders`, `:1192`).
- Scoping (`_scope_by_project_and_environment`, `:485-492`): rows are project-scoped, except `hog_function/*`, which are scoped to the environment.
- Delete / restore registry: `register_file_system_type(...)` (`posthog/api/file_system/deletion.py:107-135`); core types in `registrations.py:346-434`, products register in their `apps.py` (for example `products/surveys/backend/apps.py:21`).
- A `FileSystem` `type` doubles as an access-control resource name (`access_levels.py:94-97`). `hog_flow` is already an access-control resource (`products/access_control/backend/facade/user_access_control.py:76`).

### Which models sync today

`FileSystemSyncMixin` users (same set as `MIXIN_MODELS`): Action, FeatureFlag, Experiment, Insight, Dashboard, Link, Notebook, EarlyAccessFeature, SessionRecordingPlaylist, Cohort, HogFunction, Survey.

**Not synced:**
- `HogFlow` (`products/workflows/backend/models/hog_flow/hog_flow.py:110`, `class HogFlow(UUIDTModel)`). Environment-scoped, no soft delete (status `draft|active|archived`, `:127-130`), hard delete in `bulk_delete`. Its only signals reload workers (`:221-235`).
- `HogFlowTemplate` (`.../hog_flow_template.py:16`). Has `scope` team / organization / global (`:33-38`) and already a string `tags` ArrayField (`:43`). Its list mixes file-loaded global templates with org-wide DB rows (`api/hog_flow_template.py:231-267`), which does not map onto team-scoped `FileSystem` rows.

Loose ends already in the code:
- `products/workflows/manifest.tsx:82-90` declares `fileSystemTypes.workflows`, but nothing writes `type="workflows"` rows, and the name does not match `hog_flow`.
- `workflowsLogic.ts:399,489` already calls `deleteFromTree('hog_flow/', id)` against rows that never exist.

### Cost to add `HogFlow` to the tree (no migration)

Copy `HogFunction` (`products/cdp/backend/models/hog_functions/hog_function.py:175-211`):

1. `class HogFlow(FileSystemSyncMixin, UUIDTModel)` with `get_file_system_unfiled` and `get_file_system_representation` (`type="hog_flow"`, `ref=str(pk)`, `href=/workflows/{id}/workflow`, base folder `Unfiled/Workflows`). Decide whether archived means `should_delete`, and how loop- and broadcast-owned flows are handled.
2. Add `"hog_flow": HogFlow` to `MIXIN_MODELS` (`unfiled_file_saver.py:26`).
3. `register_file_system_type("hog_flow", "workflows", "HogFlow", hard_delete=True, ...)` in `products/workflows/backend/apps.py`.
4. Extend the environment-scoping branch at `file_system.py:491` to `hog_flow`.
5. Add `_create_in_folder` to the `HogFlowSerializer` create path (`api/hog_flow.py:3371`, `:4389`).
6. Frontend: rename the manifest key to `hog_flow`, rebuild `frontend/src/products.tsx` (`pnpm build:products`), add a `projectTreeRef` selector on the workflow scene logic (pattern: `scenes/cohorts/cohortSceneLogic.ts:70`), and call `refreshTreeItem('hog_flow', id)` after save.
7. A bulk `QuerySet.update()` would skip the sync signals. `api/hog_flow.py` has none on `HogFlow` itself (only on schedules `:4860` and batch jobs `:5872`), but other writers outside the API were not checked.

Templates: only team-scoped DB templates could sync. Global and org templates need a virtual "Library" node, or a separate `FileSystem` row type written when a template is placed in a folder.

### Frontend tree and folder UI

- `projectTreeLogic` (`frontend/src/layout/panel-layout/ProjectTree/projectTreeLogic.tsx`): keyed by `{key, root, includeRoot, defaultOnlyFolders, hideFolders, ...}` (`:64-73`); search loader (`:647-677`); parses `user:` and `type:` from the search term (`:933-941`); exports `refreshTreeItem`, `deleteFromTree`, `getLastNewFolder` (`:1790-1800`).
- `projectTreeDataLogic.tsx:638`: `loadFolder`, `moveItem(s)`, `linkItem`, `createSavedItem`; `projectTreeRefEntry` selector (`:1508`).
- `ProjectTree.tsx:55-124`: props `root` (for example `project://Workflows`), `logicKey`, `onlyTree`, `selectModeOverride`, `onItemClicked`.
- `LemonTree`: `frontend/src/lib/lemon-ui/LemonTree/LemonTree.tsx` (`TreeDataItem` `:52`, `LemonTreeProps` `:168`).
- `FolderSelect`: `frontend/src/lib/components/FileSystem/FolderSelect/FolderSelect.tsx:18-47`. Move-to modal: `lib/components/FileSystem/MoveTo/moveToLogic.tsx` (`openMoveToModal(items)` `:136`).
- In-scene file menu: `lib/components/Scenes/sceneFileLogic.ts`, `SceneFile.tsx`, `SceneMenuBarFileItems.tsx:30-55`.
- Save-to-folder flows pass `_create_in_folder: folder ?? getLastNewFolder()` (for example `scenes/insights/insightLogic.tsx:1125`).
- Files scene: `frontend/src/scenes/project-files/ProjectFilesScene.tsx`, route `/files?folder=`, renders `<ProjectTree onlyTree root="project://<folder>" />`.
- **Best in-list precedent: the dashboards list.** Folder filter in state (`scenes/dashboard/dashboards/dashboardsLogic.ts:41-51`), removable folder chip (`DashboardsFiltersBar.tsx:150-163`), clickable Folder column and bulk "Move to folder" (`DashboardsTable.tsx:33-59,186-208`). Backend `?folder=` via an `Exists` on `FileSystem` (`products/dashboards/backend/api/dashboard.py:2603-2624`), and `folder` / `file_system_id` annotated onto each row (`:2679-2699`, serializer `:1219-1236`).

## 2. Tags: `TaggedItem`

- `TaggedItem` (`posthog/models/tagged_item.py:75`) is mid-migration from one FK column per model to a generic pointer (`content_type`, `object_id`, `object_uuid`, `team`; `:195-218`).
  - Legacy FKs (`:94-191`), in `RELATED_OBJECTS` order (`:25-39`): dashboard, insight, event_definition, property_definition, action, feature_flag, experiment_saved_metric, ticket, account, endpoint, replay_scanner, project, experiment.
  - Constraints still enforce the legacy shape: `unique_together = ("tag", *RELATED_OBJECTS)` (`:221`), a partial unique per FK (`:234-239`), and `exactly_one_related_object` (`:240-242`). `save()` still writes the legacy FK (`:340-347`).
- Registry: `TAGGABLE_MODELS` in `posthog/models/tagged_item_registry.py:51-73`. `Taggable` base (`posthog/models/tagged_items_relation.py:69-75`) adds a `tagged_items` GenericRelation and checks the registry at class creation. Invariant test `posthog/test/repo_invariants/test_taggable_registry.py:26-27` requires registry == `RELATED_OBJECTS`, so a legacy FK column is still mandatory.
- API mixins (`posthog/api/tagged_item.py`): `TaggedItemSerializerMixin` (`:165-211`), `TaggedItemViewSetMixin` (`:318`, includes `POST bulk_update_tags` `:376`), tag list `GET /api/projects/:id/tags` (`:451-483`). List filters use `tagged_items__tag__name__in` (dashboards `dashboard.py:2601`, flags `feature_flag.py:5271`, actions `action.py:652`, ...).
- **Not licensed.** No `TAGGING` entry exists in `AvailableFeature`; the "EE only" docstring at `tagged_item.py:78` is stale.
- **Cost for `HogFlow` on `master` today:** the same five migrations Experiment needed (`1356`-`1360`, commit `6f3e3915b0d`): a `SeparateDatabaseAndState` column add that rebuilds `unique_together` and the check constraint, concurrent indexes, a partial unique, and a `NOT VALID` FK plus validation. Then registry + `RELATED_OBJECTS` + `Taggable` + the two mixins on `HogFlowSerializer` / `HogFlowViewSet` (`api/hog_flow.py:2813`, `:4036`). Once upstream drops the legacy columns ([#105497](https://github.com/PostHog/posthog/pull/105497), [#104436](https://github.com/PostHog/posthog/pull/104436)), a registry entry alone would do.
- `HogFlowTemplate` can keep its string `tags` array. Today it filters client-side (`Workflows/templates/workflowTemplatesLogic.ts:135-171`) and edits with `LemonInputSelect mode="multiple"` (`SaveAsTemplateModal.tsx:67-81`).
- Frontend: `lib/components/ObjectTags/ObjectTags.tsx` (display and edit, `onTagClick`), `lib/components/TagSelect.tsx` (multi-select filter, used by flags, actions, experiments, saved insights, endpoints), `lib/components/Scenes/SceneTags.tsx` and `TagsCombobox.tsx` (quill chips), `lib/components/BulkActions/BulkUpdateTagsButton.tsx`, and the dashboards tag popover (`DashboardsFiltersBar.tsx:49-138`).

## 3. Pill / token search components

| Component | Path | Fit for "type to add a filter, show removable pills" |
|---|---|---|
| `LemonInputSelect mode="multiple"` | `frontend/src/lib/lemon-ui/LemonInputSelect/LemonInputSelect.tsx:136-178` | Best LemonUI base. Renders `LemonSnack` pills (`:645`), Backspace removes (`:592`), `allowCustomValues`, `onInputChange`. No built-in `key:value` categories: encode `status:active` as option keys. |
| `SearchAutocomplete` | `frontend/src/lib/components/SearchAutocomplete/SearchAutocomplete.tsx:20-33` | `category:value` autocomplete with negation, but tokens stay raw text. Same grammar as the `FileSystem` search; used by `TreeSearchField.tsx:73`. |
| Conversations `TicketAppliedFilters` | `products/conversations/frontend/components/TicketAppliedFilters/TicketAppliedFilters.tsx:10-60` + `appliedTicketFilters.ts` | Small pill row of removable `LemonSnack`s driven by kea filter state. Easy to copy. |
| Logs filter bar | `products/logs/frontend/components/LogsViewer/Filters/LogsFilterBar/LogsFilterBar.tsx:155-305` | Closest UX (type, pick, get a chip) but TaxonomicFilter-backed. Reuse the pattern, not the code. |
| `UniversalFilters` | `frontend/src/lib/components/UniversalFilters/UniversalFilters.tsx:34-338` | Proven chip + popover editor, but tied to taxonomic groups and property filters. Heavy for workflow fields. |
| Quill `Combobox` + `ComboboxChips` | `packages/quill/packages/primitives/src/combobox.tsx:222-262`, wrapper `lib/components/Scenes/TagsCombobox.tsx:17-40` | Chip input, but quill is not for the main app (root `AGENTS.md`), so avoid in this list. |
| `FilterBar`, `QuickFilters`, `LemonSearchableSelect`, command palette `Search`, replay vision `FilterPill` | `lib/components/...`, `products/replay_vision/frontend/components/FilterPill.tsx` | Layout shell, property quick filters, single-select, results search, dropdown button. None is a pill input. |

## 4. The workflows list today

- `products/workflows/frontend/Workflows/WorkflowsTable.tsx:109-447`: search input plus `LemonSelect`s for Status, Type, Trigger and a `MemberSelect` for Created by (`:363-420`). Columns: Name, Type, Trigger, Dispatches, Created by, Updated, Last 7 days, Status.
- `workflowsLogic.ts`: filters `{search, createdBy, status, type, triggerType, page}` (`:48-64`), 30 per page, **server-side pagination** with a 300 ms debounce, filters synced to the URL (`:420-551`). Server-side search landed in [#73869](https://github.com/PostHog/posthog/pull/73869).
- Backend `products/workflows/backend/api/hog_flow.py`: filterset `id, created_at, updated_at, status, origin_product` (`:3884-3889`), plus `created_by`, `type`, `broadcast_eligible`, `trigger` (`:4149-4204`), and a `search` that falls back to step names and email subject / preheader / body (`:4206-4229`, `_action_content_matches` `:3920-3935`). The list serializer has no tags or folder fields.
- Templates list: `HogFlowTemplateViewSet.list` builds the full list in Python, then paginates (`api/hog_flow_template.py:244-267`); the frontend loads it once and filters client-side.

## 5. Upstream (PostHog/posthog), 2026

Searched with `gh search prs|issues --repo PostHog/posthog --created ">=2026-01-01"` for file system, project tree, folder, tags, saved views, saved filters, filter bar, search bar, pills, shortcuts, workflows list and related terms.

### Tags on workflows (directly relevant)

- [#103019](https://github.com/PostHog/posthog/pull/103019) (open, draft) `feat(tags): add pinned tags and tags on workflows`: `tags` on `hog_flows` with `?tags=a,b&tags_match=any|all`, project-level pinned tags (`POST/GET/DELETE /tags/`), activity log. Migrations `1369`-`1374` in the legacy per-FK shape, now stale against `master` (`1381`) and the generic-pointer work. Last updated 2026-09-18.
- [#103021](https://github.com/PostHog/posthog/pull/103021) (open, draft) `feat(workflows): manage tags and filter the list by tag`: Tags column, "Manage tags" modal, row tag picker limited to pinned tags, Tag filter synced to `?tag=`, click a chip to filter. Stacked on #103019.

### `TaggedItem` generic-pointer migration (decides how cheap tagging becomes)

- [#101560](https://github.com/PostHog/posthog/pull/101560) (merged 09-16): adds `content_type` / `object_id` / `object_uuid` / `team` and the `TAGGABLE_MODELS` registry.
- [#102143](https://github.com/PostHog/posthog/pull/102143) (merged): reads tags through the generic relation.
- [#103586](https://github.com/PostHog/posthog/pull/103586) (merged 09-21): every read goes through the generic pointer.
- [#103937](https://github.com/PostHog/posthog/pull/103937) (merged 09-23), reverted by [#105316](https://github.com/PostHog/posthog/pull/105316) (merged 09-23): stopping legacy writes; the migration deadlocked in prod-eu.
- [#105712](https://github.com/PostHog/posthog/pull/105712) (closed): re-land attempt with an operator command.
- [#105497](https://github.com/PostHog/posthog/pull/105497) (open): re-land with bounded, `atomic = False` migrations `1378`/`1379`. After it lands, a new taggable model needs no column.
- [#104436](https://github.com/PostHog/posthog/pull/104436) (open): drops the 13 legacy columns, after the above ships.

### Other tags work

- [#95961](https://github.com/PostHog/posthog/pull/95961) (open): per-team tags for Skills with a list tag filter and clickable chips; touches `TagSelect.tsx`. Closes issue [#95890](https://github.com/PostHog/posthog/issues/95890) ("Organize skills with tags or folders").
- [#102438](https://github.com/PostHog/posthog/pull/102438) (open): tag editing from the experiments row menu.
- [#104846](https://github.com/PostHog/posthog/pull/104846) (open): manage ticket tags from settings (a "managed tag list" precedent like pinned tags).
- Issue [#90860](https://github.com/PostHog/posthog/issues/90860) (open): "Group by" views that browse tagged objects grouped by tag. Matches the map's grouping mode.
- Issue [#67206](https://github.com/PostHog/posthog/issues/67206) (open): experiment tags with auto-tagging.

### Folders, file system and navigation

- [#104863](https://github.com/PostHog/posthog/pull/104863) (merged 09-23): public per-user home folders `Users/<name>`, behind `simple-sidepanel`.
- [#104877](https://github.com/PostHog/posthog/pull/104877) (open, draft): double-click to focus a folder, "Open in sidebar" / "Open in Files", up and path menu. Touches `LemonTree` and `ProjectTree`.
- [#105754](https://github.com/PostHog/posthog/pull/105754) (merged 09-24): Apps and Files sidebar tabs lose their search fields; shared ownership and file-type filter menu (`useTreeFilterMenuItems.tsx`).
- [#104569](https://github.com/PostHog/posthog/pull/104569) (closed): original Apps and Files tabs proposal.
- [#104429](https://github.com/PostHog/posthog/pull/104429) (merged 09-22): `recursive=false` folder deletion.
- [#101243](https://github.com/PostHog/posthog/pull/101243) (merged 09-16): lazy-load unfiled reconciliation (touches `FolderSelect`, `MoveTo`, `LinkTo`).
- [#97092](https://github.com/PostHog/posthog/pull/97092), [#97096](https://github.com/PostHog/posthog/pull/97096) (merged 09-09): drop the orphaned `PersistedFolder` model and table.
- [#106412](https://github.com/PostHog/posthog/pull/106412), [#102185](https://github.com/PostHog/posthog/pull/102185), [#105180](https://github.com/PostHog/posthog/pull/105180), [#103609](https://github.com/PostHog/posthog/pull/103609) (open): sidebar shortcut, Recents and file-list fixes.
- [#92011](https://github.com/PostHog/posthog/pull/92011) (merged 09-02): flat sidebar without `LemonTree`, behind `flat-nav`.
- [#86734](https://github.com/PostHog/posthog/pull/86734) (closed, draft): folder picker in the dashboards filter bar. Its body says almost no dashboards-list views used the folder filter, because it had no entry point.
- Issue [#58198](https://github.com/PostHog/posthog/issues/58198) (open): surface folder paths in list and detail views.
- Issue [#50182](https://github.com/PostHog/posthog/issues/50182) (open): folders and bulk actions for Experiments.
- Issues [#76072](https://github.com/PostHog/posthog/issues/76072), [#76910](https://github.com/PostHog/posthog/issues/76910), [#76916](https://github.com/PostHog/posthog/issues/76916) (open): sidebar customization, pin folders, user-defined groups.

### Saved views and list filters

- [#101892](https://github.com/PostHog/posthog/pull/101892) (open): persist Saved Insights list filters per user and project.
- [#105539](https://github.com/PostHog/posthog/pull/105539) (open, draft): named dashboard filter views; touches `lib/components/SavedViews/SavedViewsList.tsx`.
- [#106300](https://github.com/PostHog/posthog/pull/106300) (open, draft): reusable account views in Customer analytics.
- [#104396](https://github.com/PostHog/posthog/pull/104396), [#104794](https://github.com/PostHog/posthog/pull/104794) (open): saved ticket views in Conversations.
- [#90563](https://github.com/PostHog/posthog/pull/90563) (merged 08-28): full-width nav search bar.
- [#66012](https://github.com/PostHog/posthog/pull/66012) (merged 06-25): logs facet search bar.

### Workflows list itself

- [#73869](https://github.com/PostHog/posthog/pull/73869) (merged 07-28): server-side search and pagination.
- [#103849](https://github.com/PostHog/posthog/pull/103849) (open): workflow `key` with `?key=` list filter (for the CLI).
- [#105785](https://github.com/PostHog/posthog/pull/105785) (merged 09-24): broadcast-shaped workflows listed on the broadcasts page.
- [#104856](https://github.com/PostHog/posthog/pull/104856) (open): stable ordering when paging workflow templates.

No open or merged PR puts `hog_flow` or templates into the project tree, and no PR adds a generic pill search bar.

## 6. Recommendation for the prototypes

**Folders variant.** Build on the real `FileSystem`:
- Backend: opt `HogFlow` into `FileSystemSyncMixin` as in section 1 (no migration), and add a `?folder=` filter plus `folder` / `file_system_id` fields to the `hog_flows` list by copying `products/dashboards/backend/api/dashboard.py:2603-2699`.
- Frontend: left pane `<ProjectTree onlyTree root="project://Workflows" />` or a folder column plus chip, bulk "Move to folder" via `moveToLogic.openMoveToModal`, and `FolderSelect` in the create flow (`_create_in_folder`). Follow the dashboards list (`scenes/dashboard/dashboards/`).
- Seed: turn existing `Support:: SLA:: ...` name prefixes into folder paths.
- Templates: sync only team-scoped DB templates as `hog_flow_template` rows, or show a virtual "Library" node for global templates. This is the main open design question.

**Tags variant.** Build on upstream [#103019](https://github.com/PostHog/posthog/pull/103019) + [#103021](https://github.com/PostHog/posthog/pull/103021): cherry-pick them onto the throwaway branch and renumber their migrations after `1381`, or, cheaper for a prototype, fake tags in list state. UI parts: `ObjectTags`, `TagSelect`, `BulkUpdateTagsButton`. Templates keep their existing `tags` array.

**Pill search bar.** Build a small `WorkflowsSearchBar` on `LemonInputSelect mode="multiple"` (LemonUI pills), with the `key:value` grammar from `SearchAutocomplete` (`status:`, `type:`, `trigger:`, `tag:`, `folder:`, `user:me`, free text), and the pill row pattern from `TicketAppliedFilters`. Map pills onto the existing server-side `hog_flows` params.

**Missing today:**
- `HogFlow` / `HogFlowTemplate` sync into `FileSystem`, and `folder` on the `hog_flows` API.
- Tags on `HogFlow` (in flight upstream, blocked on review and the `TaggedItem` migration).
- A reusable pill search component.
- A tree model for global and org templates.
- A "group by tag or folder" list mode (issue [#90860](https://github.com/PostHog/posthog/issues/90860)).
- Sender and email fields on the list serializer.

Not verified: `HogFlow` writes outside `api/hog_flow.py` that use `QuerySet.update()` (would skip tree sync); the full set of product-registered `FileSystem` types; the template list's default page size.
