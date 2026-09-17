# A read-only, code-managed mode for workflows

Research note for a later 1.1 effort.
Nothing is built here.

- Question: what would it take to mark a workflow as managed by code, make it read-only in the PostHog UI, and point back at the source that owns it?
- Source: this repository at `f637db96f1fc853ea6a83694f02b94ab690bdcaf` (2026-09-17). Every claim cites a file and a line.
- Location: there was no `products/workflows/docs/` directory before this note. This file creates it. The product's other prose sits in `products/workflows/CONTRIBUTING.md` and under `products/workflows/skills/`.

## Summary

Five findings decide the shape of the work.

1. **The model carries no provenance at all.** There is no `created_via`, `source`, `managed_by`, `template_id`, or metadata blob, and none was ever removed. A new column is unavoidable.
2. **PostHog has a provenance precedent that locks nothing.** `ExternalDataSource.created_via` is write-once, machine-stamped, and reaches the generated frontend types. No UI reads it and no write is rejected because of it. Copy the field discipline, not the (absent) lock.
3. **PostHog has three working locks to copy from.** Managed warehouse views do the whole job, model to badge (`products/data_warehouse/backend/presentation/views/saved_query.py:619-620`, `frontend/src/scenes/data-warehouse/scene/ViewsTab.tsx:26-33`). System-managed warehouse sources do the cleanest enforcement, a 403 raised in `check_object_permissions` (`products/warehouse_sources/backend/presentation/views/external_data_source.py:1768-1772`). System-managed DAGs show the escape hatch the owning writer needs (`products/data_modeling/backend/logic/saved_query_dag_sync.py:194`).
4. **There is no single server-side write chokepoint.** Nine write actions on the workflow viewset never reach `perform_update`, and three of them bypass every serializer. A permission class with `has_object_permission` is the only guard that covers them.
5. **The enable button saves the whole graph.** A server rule of "reject any write on a code-managed row" also disables the workflow's own status control. The guard must classify the changed fields.

A sixth finding is not part of the question but is worth reporting.
The canvas never consults the caller's access level, so a Viewer can edit the graph today and the autosave fires a real `PATCH` that only the backend rejects (section 3).
The 1.1 work fixes that gap on the way past.

## 1. What the model carries today

`HogFlow` is a `UUIDTModel` declared at `products/workflows/backend/models/hog_flow/hog_flow.py:65`.

Its fields are `name` (`:92`), `description` (`:93`), `version` (`:94`), `team` (`:95`), `status` (`:96`), `created_at` (`:98`), `created_by` (`:99`), `updated_at` (`:100`), `trigger` (`:102`), `trigger_masking` (`:103`), `conversion` (`:104`), `exit_condition` (`:105`), `edges` (`:107`), `actions` (`:108`), `encrypted_inputs` (`:113`), `abort_action` (`:114`), `variables` (`:115`), `billable_action_types` (`:119`), `draft` (`:122`), `draft_updated_at` (`:123`), `draft_encrypted_inputs` (`:127`), and `action_redirects` (`:133`).

None of these can express provenance.

- There is **no** `created_via`, `source`, `managed_by`, `template_id`, `is_readonly`, `read_only`, `locked`, or `source_of_truth` field.
- There is **no** generic metadata blob. Every `JSONField` on the model has a fixed meaning and a serializer that validates its shape.
- A workflow created from a `HogFlowTemplate` keeps **no** pointer back to that template. `template_id` lives only inside each action's `config` and on `HogFunctionTemplate` (`products/cdp/backend/models/hog_function_template.py:22`).
- `created_by` records a user, not a system, and it is `SET_NULL` (`hog_flow.py:99`). A CI push with a personal API key records the key's owner.

No `JSONField` is a usable hiding place.

- `trigger` is read-only on the serializer and fully derived. `validate()` overwrites it: `data["trigger"] = trigger_actions[0]["config"]` (`products/workflows/backend/api/hog_flow.py:2008`). A client cannot write it.
- `conversion` is constrained by `HogFlowConversionSerializer` (`hog_flow.py:1389`) and unknown keys are dropped.
- `variables` looks free-form at the database layer but its serializer is a list of string-to-string dicts, capped at 5 KB (`hog_flow.py:1325-1345`). A provenance entry smuggled in there would become a real runtime variable that users see and edit.

The workflow engine carries no provenance either.
A grep for `created_via`, `managed_by`, and `source_of_truth` across `nodejs/src/cdp/` and `products/workflows/` returns nothing.

### No field was ever removed

The workflows app has two migration homes, because the model moved app in 2025.
The original `CreateModel` is `posthog/migrations/0765_hogflows.py`, and the state-only move is `products/workflows/backend/migrations/0007_migrate_hog_flow_models.py`.
The only `RemoveField` migrations in the workflows app target `hogflowbatchjob.scheduled_at` and `emailreputationsnapshot`.
There has never been a provenance or lock column on `posthog_hogflow`.

The latest migration to touch `HogFlow` is `products/workflows/backend/migrations/0012_hogflow_encrypted_inputs.py`.
The app head is `0016_drop_emailreputationsnapshot_fk` in `products/workflows/backend/migrations/max_migration.txt`.
A new field becomes `0017_*` and must update that file.

### What the API exposes

The generated TypeScript mirrors the write serializer one to one.
`products/workflows/frontend/generated/api.schemas.ts:530-592` lists every field on `HogFlowApi`.
There is no provenance member, but there is one field that matters.

```ts
/**
 * The effective access level the user has for this object
 * @nullable
 */
readonly user_access_level: string | null
```

`products/workflows/frontend/generated/api.schemas.ts:574-578`

That is the existing per-object editability signal, and section 4 returns to it.

A model field alone reaches nothing.
The chain is: model field, then `HogFlowSerializer.Meta.fields` (`hog_flow.py:1931`), then `hogli build:openapi` (`package.json:21`), which regenerates `api.ts`, `api.schemas.ts`, and `api.zod.ts`.
The same spec drives the MCP tools, and `products/workflows/mcp/tools.yaml` carries no field-level allow list, so a new serializer field flows into the tool schemas on its own.
`help_text` is user-facing in both places and ships verbatim.

## 2. How other PostHog resources express "managed elsewhere"

### ExternalDataSource.created_via: copy the field, not the lock

`products/warehouse_sources/backend/models/external_data_source.py:31-36`

```python
class CreatedVia(models.TextChoices):
    WEB = "web", "web"
    API = "api", "api"
    MCP = "mcp", "mcp"
    WIZARD = "wizard", "wizard"
    SELF_DRIVING = "self_driving", "self_driving"
```

`products/warehouse_sources/backend/models/external_data_source.py:73-75`

```python
# How this source was created — e.g. web UI, direct API call, or MCP tool. Required for new rows
# via the serializer; NULL on historical rows created before this field existed.
created_via = models.CharField(max_length=20, choices=CreatedVia, null=True, blank=True)
```

Four properties are worth copying.

- The enum is nullable, because rows created before `0049_externaldatasource_created_via.py` have no value.
- The field is optional on create and defaults to `api`, so old API callers keep working (`external_data_source.py:1964`).
- `update` strips it rather than rejecting it (`external_data_source.py:1015-1016`), because the settings page spreads the whole `GET` payload back into a `PATCH` (`external_data_source.py:783-788`).

```python
# created_via is set at creation time and cannot be mutated afterwards
validated_data.pop("created_via", None)
```

- **The server stamps it, the client does not.** `external_data_source.py:2100-2113` rewrites a claimed value using `get_event_source(request)`, so a caller cannot self-report its own provenance.

One property is worth knowing and not copying: the field gates nothing.
It reaches `products/warehouse_sources/frontend/generated/api.schemas.ts:3054` and no frontend file reads it.
No badge, no banner, no disabled control, no rejected write.
`created_via` is attribution, not a lock.

### Managed warehouse views: the one precedent that does all three layers

A `DataWarehouseSavedQuery` can belong to a `DataWarehouseManagedViewSet`.
It is a real, user-visible row that a system definition owns.
This is the only precedent with a real column, a hard API refusal, and a finished UI.

Ownership is a nullable FK, `managed_viewset`, beside an `origin` enum with values `data_warehouse`, `endpoint`, and `managed_viewset` (`products/data_modeling/backend/models/datawarehouse_saved_query.py:77-82` and `:137`).

The serializer does not expose the FK. It exposes a derived read-only `managed_viewset_kind` (`products/data_warehouse/backend/presentation/views/saved_query.py:265-266`).
That is the important choice. **The API tells the frontend why the row is locked, not only that it is locked**, so the UI can name the owner.

Writes are refused with a 400 that names the place to go instead.

`products/data_warehouse/backend/presentation/views/saved_query.py:193-195`

```python
if saved_query.managed_viewset is not None:
    raise serializers.ValidationError(
        "Cannot delete a query from a managed viewset directly. Disable the managed viewset instead."
    )
```

Update is refused the same way at `saved_query.py:619-620`, and the field's `help_text` states the precedence for API consumers (`saved_query.py:118-122`).

The UI is the part to copy most closely (`frontend/src/scenes/data-warehouse/scene/ViewsTab.tsx`).

- Delete is disabled with a reason that links to the owner page (`ViewsTab.tsx:26-33`).
- The name stops being a link. It gains a tooltip and a muted attribution line, "Created by the `<kind>` managed viewset" (`ViewsTab.tsx:172-199`).
- The access-control menu entry is **hidden**, not disabled, because permissions on a row you do not own are meaningless (`ViewsTab.tsx:125-128`).
- The row gets its own icon in the SQL editor tree (`frontend/src/scenes/data-warehouse/editor/sidebar/queryDatabaseLogic.tsx:916`).
- The sync-frequency control is removed rather than greyed out (`frontend/src/scenes/data-warehouse/saved_queries/MaterializationStatusPanel.tsx:175`).

### System-managed warehouse sources: the cleanest enforcement

This is the only precedent that returns 403, and the only one that hangs the gate off `check_object_permissions`.
One override then covers every method and every detail action.

`products/warehouse_sources/backend/presentation/views/external_data_source.py:1768-1772`

```python
def check_object_permissions(self, request: Request, obj: Any) -> None:
    super().check_object_permissions(request, obj)
    if request.method not in ("GET", "HEAD", "OPTIONS") and isinstance(obj, ExternalDataSource):
        if obj.is_system_managed:
            raise PermissionDenied("This source is managed by PostHog and cannot be changed through this API.")
```

The child resource repeats it (`products/warehouse_sources/backend/presentation/views/external_data_schema.py:1385-1389`), and creating a row in the reserved namespace returns a 400 (`external_data_source.py:2116-2120`).

Copy the `check_object_permissions` shape and the reserved-namespace guard.
Do not copy the storage: `is_system_managed` reads a key out of a JSON blob (`products/warehouse_sources/backend/models/external_data_source.py:118-121`).
Do not copy the silence either. A grep for `system_managed` across `frontend/src` and `products/*/frontend` returns nothing, so the user sees a bare 403 toast. That is the gap this effort must not repeat.

### System-managed DAGs: the escape hatch and the two-way block

`products/data_modeling/backend/models/dag.py:45-48` defines `is_managed` as a property whose docstring reads "System-managed DAGs (e.g. Revenue Analytics) cannot be renamed, edited, or deleted by users."

Two ideas here are worth taking.

The owning writer opts past the gate with an explicit keyword rather than a separate code path: `if dag.is_managed and not allow_managed:` (`products/data_modeling/backend/logic/saved_query_dag_sync.py:194`).

The block also runs in both directions. A user cannot edit a managed child, and cannot move an unmanaged row into the managed container (`products/data_modeling/backend/presentation/views/node.py:132-142`). Error copy is separate per verb for rename, edit, and delete (`dag.py:93`, `:108`, `:142`).

Do not copy the storage here either. `is_managed` is a name comparison.

### Plugins: the same refusal in the older style

`products/cdp/backend/api/plugin.py:247-257`

```python
def has_object_permission(self, request, view, object) -> bool:
    if request.method in SAFE_METHODS:
        return view.organization.plugins_access_level >= Organization.PluginsAccessLevel.CONFIG
    if view.organization != object.organization:
        self.message = "This plugin installation is managed by another organization"
        return False
```

Reads pass, writes fail at object level, and the message names the owner.

### Experiment-linked feature flags: good copy, no enforcement

`frontend/src/scenes/feature-flags/FeatureFlagOverview.tsx:221-227`

```tsx
disabledReason={
    featureFlag.experiment_set && featureFlag.experiment_set.length > 0
        ? 'Variants are managed by the linked experiment'
        : undefined
}
```

The reusable idea is the precedence rule in the wrapper. An ownership reason shadows the access-control reason.

`frontend/src/scenes/feature-flags/EditableOverviewSection.tsx:46`

```tsx
disabledReason={disabledReason ?? accessDisabledReason}
```

Cite this for the copy and the composition only.
The backend rejects nothing on edit. It guards delete alone (`products/feature_flags/backend/api/feature_flag.py:1886-1893`), so an API caller can still write.

### Two smaller precedents

- **A boolean lock column**: `Organization.is_ai_training_locked` (`posthog/models/organization.py:232-236`), whose `help_text` reads "When True, the AI training opt-out setting cannot be modified through the UI or API." It is organization-scoped and field-scoped, not row-scoped, but it shows the shape of the column and its help text.
- **An immutability error code**: `posthog/api/llm_prompt_serializers.py:420-437` raises `serializers.ValidationError({...}, code="immutable")` for fields that cannot change on an existing row. Reuse that code.

### Request provenance already changes write semantics

`get_event_source` (`posthog/event_usage.py:332-357`) is the repository's canonical answer to "who is calling".
It prefers a user-agent token over the raw `X-PostHog-Client` header (`event_usage.py:334-337`), so it resists spoofing better than the header does.

The workflows API already uses it to change behaviour.

`products/workflows/backend/api/hog_flow.py:668-678`

```python
if not is_draft:
    return True
source = context.get("event_source")
return source is not None and source != EventSource.WEB
```

Programmatic callers get strict validation even on a draft; only `EventSource.WEB` stays lenient.
The same primitive gates the blast-radius confirm token on agent-driven batch jobs and schedules (`hog_flow.py:4078-4079`).

This is the only place today where a request's provenance changes what a write may do, and it is never persisted on the row.
A code-managed mode is the persisted version of the same idea.

### Not precedents

- `Organization.read_only_mcp_access` shipped in August 2026 (commit `0ad474fa91c`) and no longer exists at HEAD. Do not build on it.
- **A hog function built from a template is not locked.** A grep across `frontend/src/scenes/hog-functions/` and `products/cdp/` for a template combined with read-only, disabled, lock, or managed returns nothing. The source editor is expandable for everyone (`frontend/src/scenes/hog-functions/configuration/components/HogFunctionCode.tsx:58-97`), and its only `readOnly: true` is the diff view (`:161`). `template_id` is not a lock anywhere.
- **`is_remote_configuration` on a feature flag** changes which sections render (`FeatureFlagOverview.tsx:191`) and blocks one read endpoint. It is a flag type, not an ownership marker.
- **`ExportedAsset.is_system`** (`products/exports/backend/models/exported_asset.py:103`) and **`ActivityLog.is_system`** (`posthog/models/activity_logging/activity_log.py:227`) mean "no human actor". Both are used for display and for index conditions. Neither gates a write.
- **SCIM provisioning** (`posthog/models/user.py:223`) records an origin and nothing reads it to reject an in-app edit.
- **Dashboard `restriction_level`** answers "may this user edit", not "what owns this". Its frontend has already moved to `user_access_level` (`frontend/src/scenes/dashboard/dashboardLogic.tsx:2790-2801`), and there is a migration retiring it (`posthog/rbac/migrations/rbac_dashboard_migration.py:20-22`). Do not build on it.
- **`AccessControlPermission`** (`posthog/permissions.py:835`, object hook at `:870`) answers the same user-shaped question.
- **`ResourceTransferVisitor(..., immutable=True)`** (`posthog/models/resource_transfer/visitors/base.py:23-37`) is a class-level marker for the project-transfer graph, not a row lock.

There is no reusable, generic "this row is locked" mechanism in PostHog's DRF layer.
Every precedent above hand-rolls its own.

## 3. The editor's write path

### The scene

A saved workflow has five tabs: `workflow`, `invocations`, `metrics`, `assets`, and `history` (`products/workflows/frontend/Workflows/WorkflowScene.tsx:72-113`, enum at `workflowSceneLogic.ts:11`).
Only the first is the canvas. The other four are already read-only.

One detail matters.
The canvas holds a **second** tab strip whose modes include `metrics` and `logs` (`hogflows/hogFlowEditorLogic.tsx:138`, rendered at `hogflows/panel/HogFlowEditorPanel.tsx:113-124`).
Per-step metrics and logs are reachable only by selecting a node on the canvas.
So the canvas must stay clickable. Hiding it would remove a read-only surface the user needs.

### The canvas

`products/workflows/frontend/Workflows/hogflows/HogFlowEditor.tsx:66-83` renders `@xyflow/react` (React Flow v12).

```tsx
<ReactFlow<HogFlowActionNode, HogFlowActionEdge>
    className="grow"
    fitView
    nodes={nodesWithDropzones}
    edges={edges}
    onNodesChange={onNodesChange}
    onEdgesChange={onEdgesChange}
    onNodesDelete={onNodesDelete}
    onDragStart={showDropzones}
    onDragOver={onDragOver}
    onDrop={onDrop}
    nodeTypes={REACT_FLOW_NODE_TYPES as NodeTypes}
    edgeTypes={REACT_FLOW_EDGE_TYPES as EdgeTypes}
    nodesDraggable={false}
```

`nodesDraggable={false}` is already hard-coded (`HogFlowEditor.tsx:80`), because the layout is computed by elk and node positions are never persisted.
Per-element flags are set in the logic instead: edges at `hogFlowEditorLogic.tsx:2228-2230`, nodes at `:2295-2299`.

A view-only canvas needs `nodesConnectable={false}`, `deleteKeyCode={null}`, and the removal of `onNodesDelete`, `onDrop`, and `onDragOver`.
Keep `elementsSelectable`, `panOnDrag`, and `zoomOnScroll` so node selection still opens the per-step panels.
The drag palette that feeds `onDrop` lives in `hogflows/panel/HogFlowEditorPanelBuild.tsx:25` and needs hiding separately.

### The save

The editor logic holds no workflow state. It reads and writes `workflowLogic` (`hogFlowEditorLogic.tsx:1958-1966`).

Every persist goes through one loader.

`products/workflows/frontend/Workflows/workflowLogic.ts:2767-2797`

```ts
saveWorkflow: async (updates: HogFlow) => {
    updates = sanitizeWorkflow(updates, values.hogFunctionTemplatesById)
    if (!props.id || props.id === 'new') {
        const result = await api.hogFlows.createHogFlow(updates)
        ...
    }
    return await api.hogFlows.updateHogFlow(props.id, {
        ...updates,
        base_updated_at: values.saveBaseUpdatedAt ?? values.originalWorkflow?.updated_at ?? null,
    })
}
```

Note that the write path uses the hand-written client at `frontend/src/lib/api.ts:6736`, not the generated one.

Three callers reach the loader.

- The form's `submit` (`workflowLogic.ts:2844`), behind the Save button (`WorkflowSceneHeader.tsx:234-253`).
- `saveWorkflowPartial` (`workflowLogic.ts:3309-3316`), behind the enable and disable button.
- The autosave listener (`workflowLogic.ts:3490-3509`), which debounces 3 seconds and skips an active workflow.

`duplicate` calls `api.hogFlows.createHogFlow` directly and bypasses the loader (`workflowLogic.ts:3525`). It creates a new row, so it is harmless here.

### The trap

`products/workflows/frontend/Workflows/WorkflowSceneHeader.tsx:137-140`

```tsx
onClick={() =>
    saveWorkflowPartial({
        status: workflow?.status === 'draft' ? 'active' : 'draft',
    })
}
```

`saveWorkflowPartial` merges `{status}` into the full form value and saves the whole object (`workflowLogic.ts:3310`).
The resulting `PATCH` carries `actions`, `edges`, and every other field.

So a blanket guard on the loader, or a blanket disable on the `workflow` form, breaks the status control that the ticket requires to keep working.
Runs, metrics, and the invocations table survive either, because none of them writes through `workflowLogic`.

### Where the guard goes

The canvas mutates the form through a small set of sibling actions on `workflowLogic`, each with its own listener.

- `setWorkflowInfo` (`workflowLogic.ts:3436-3439`), every structural edit: delete (`hogFlowEditorLogic.tsx:2359`), drop and copy (`:2646`), move (`:2750`), variables (`panel/HogFlowEditorPanelVariables.tsx:21`), output mapping (`panel/hogFlowOutputMappingLogic.ts:363`).
- `setWorkflowActionConfig` (`workflowLogic.ts:3440-3459`) and `partialSetWorkflowActionConfig` (`:3461-3468`).
- `setWorkflowAction` (`:3469-3473`) and `setWorkflowActionEdges` (`:3474-3481`).
- `setWorkflowValue` (`:3482-3484`), called from the header and from `hogflows/steps/StepTrigger.tsx`.

Every one of those listeners ends in an autosave.
That is the answer to "where would a single guard sit": on those listeners plus the autosave, not on the loader and not on the form.
The status control, the manual and batch run buttons (`workflowLogic.ts:3529` and `:3563`), the invocations table, and both metrics surfaces then stay untouched.

### There is no read-only mode to extend

The workflows frontend has no `isReadOnly`, `readOnly`, `viewOnly`, or `canEdit` selector.
A grep for `readOnly` across `products/workflows/frontend` returns two unrelated hits, in `Workflows/templates/TemplateJsonModal.tsx:48` and `OptOuts/OptOutList.tsx:218`.

Editability is not gated on `status` either.
The string `'archived'` appears only in the generated schema files. An archived workflow's canvas is fully editable today.

The only edit-blocking affordances are transient: a spinner overlay while an external edit reconciles (`Workflow.tsx:17`) and the conflict banner beside it (`Workflow.tsx:18-36`).

## 4. What the API would need

Enforce it server-side.
A frontend-only lock is a suggestion, and the whole point of the mode is that a second writer exists.

### There is no single chokepoint

`perform_update` looks like the natural home, and its existing MCP branch is the precedent to copy.

`products/workflows/backend/api/hog_flow.py:2863-2875`

```python
def perform_update(self, serializer):
    # Guardrails for MCP/LLM callers (gated on x-posthog-client: mcp; the frontend and raw API are
    # unaffected). We check the raw request payload, not serializer.validated_data — HogFlowSerializer.validate
    # injects derived fields like 'trigger' and 'billable_action_types' which would otherwise make every
    # status-only PATCH look like a mixed edit.
    route_to_draft = False
    if self._is_mcp_request(self.request):
        keys = set(self.request.data.keys())
        has_status = "status" in keys
        has_non_status = bool(keys - {"status"})
```

That branch already rejects `actions` and `edges` outright (`hog_flow.py:2884-2890`), which is the same rejection in a different costume.
It also shows the field-level classification the status trap needs.

But `perform_update` covers `PUT` and `PATCH` only.
The viewset has nine further write actions that never call it: `rerun` (`:2772`), `graph` (`:3060`), `action_email` (`:3143`), `publish` (`:3342`), `discard_draft` (`:3437`), `restore_revision` (`:3489`), `bulk_delete` (`:3822`), `batch_jobs` (`:4057`), and `schedules` (`:4101`).
Three of them write the row directly with `locked.save(update_fields=...)` and no serializer at all, so a serializer-level guard misses them silently.

### The shape that works

Override `check_object_permissions` on the viewset, following `external_data_source.py:1768-1772`.
DRF calls it from `self.get_object()`, and every detail write action calls `get_object()`: `rerun` (`:2785`), `graph` (`:3070`), `publish` (`:3350`), `discard_draft` (`:3441`), `restore_revision` (`:3497`), and the rest.
One override therefore covers the serializer-free paths that a serializer guard misses.

A permission class with `has_object_permission` works as well (`products/cdp/backend/api/plugin.py:247-257`), and `posthog/api/routing.py:280` appends it through the `permission_classes` attribute.
The override is the smaller change.

Two gaps remain.

- `bulk_delete` is `detail=False` (`hog_flow.py:3822`), so it never calls `get_object()`. It needs an explicit check beside the existing per-object editor check at `:3836-3841`.
- `create` has no object yet, which is fine. Only the owning client creates a code-managed row. Guard the reverse instead: reject a client that tries to claim an existing workflow, the way `dag.py:96-97` reserves the managed name.

### The field-level rule

Content edits are rejected. Lifecycle stays open.

The serializer already names the content fields as `DRAFT_CONTENT_FIELDS` (`hog_flow.py:2894`), used to decide what stages into a draft.
The same set is the right thing to reject.
Leave `status` writable so enable and disable keep working from the UI and from the lifecycle MCP tools.

### The carve-out for the owning client

The guard must let the code path through, or the workflow can never be updated again.
Identify that path with `get_event_source(request)` (`posthog/event_usage.py:332-357`), not with the raw `X-PostHog-Client` header.
That matches how `_should_validate_strictly` already reads the caller (`hog_flow.py:668-678`) and how `ExternalDataSource` stamps `created_via` (`external_data_source.py:2100-2113`).

### Error text

Copy the shape the MCP guard uses at `hog_flow.py:2886-2890`: name the rule, then name the fix.
The message should point at the source that owns the workflow.
Use DRF's `code="immutable"`, following `posthog/api/llm_prompt_serializers.py:420-437`.

### What it costs downstream

`read_only_fields` protects a field, never a row (`hog_flow.py:1955-1968`), so it does not do this job. It only controls how the field is emitted.
Mark the new fields read-only after create, give each a `help_text`, and run `hogli build:openapi`.
The text reaches `api.schemas.ts` and the MCP tool descriptions verbatim.

## 5. Pointing back at the source

Nothing in the model can hold a link today.
The mode needs two values.

- A provenance enum, so the UI can decide without parsing a string. `created_via` is the established name and `ExternalDataSource.CreatedVia` is the established shape.
- A source reference, so the UI can link out. A nullable `URLField` is the smallest thing that works.

Keep the reference opaque to the backend. Store it and echo it. Do not validate that it is a GitHub URL.

## The minimal 1.1 change

Add two nullable columns to `HogFlow` in a new `0017_*` migration: a `created_via` enum copying `ExternalDataSource.CreatedVia` (`external_data_source.py:31-36`), and a nullable `source_url` naming the file that owns the workflow. Stamp `created_via` server-side from `get_event_source(request)` rather than trusting the payload, the way `external_data_source.py:2100-2113` does, and make both write-once on update the way `external_data_source.py:1015-1016` does. Expose them on `HogFlowSerializer` with `help_text` (`hog_flow.py:1931-1968`) and run `hogli build:openapi` so they reach `api.schemas.ts` and the MCP schemas; follow `managed_viewset_kind` (`saved_query.py:265-266`) and surface a value the UI can name an owner from, not a bare boolean. Server-side, override `check_object_permissions` on `HogFlowViewSet` in the shape of `external_data_source.py:1768-1772`: let safe methods and status-only writes through, and reject anything touching `DRAFT_CONTENT_FIELDS` (`hog_flow.py:2894`) on a code-managed row. That one override covers `graph`, `publish`, `discard_draft`, `restore_revision`, and every other detail write that never reaches `perform_update`; add the same check inside `bulk_delete` (`hog_flow.py:3836-3841`), which is not a detail route, and give the owning client an explicit bypass keyword rather than a second code path, as `saved_query_dag_sync.py:194` does. Frontend-side, derive one `canEditWorkflow` selector in `workflowLogic` beside `workflowUserAccessLevel` (`workflowLogic.ts:2971-2975`), early-return from the canvas mutation listeners and the autosave (`workflowLogic.ts:3436-3509`), and thread it into `<ReactFlow>` as `nodesConnectable={false}` with the delete and drop handlers removed (`HogFlowEditor.tsx:66-83`) while hiding the step palette (`HogFlowEditorPanelBuild.tsx:25`). Leave `saveWorkflowPartial` alone except for a status-only path, so the enable button does not send the graph (`workflowLogic.ts:3309-3316`). For the badge and the link, copy `ViewsTab.tsx:172-199`: a muted attribution line that names the source and links to it, a tooltip on the locked control, and hidden rather than disabled actions where permissions are meaningless. Let the ownership reason shadow the access-control reason the way `EditableOverviewSection.tsx:46` does, so the lock reads like every other lock in the product. The runs, metrics, assets, and history tabs need no change; they are already read-only (`WorkflowScene.tsx:72-113`). Keep the canvas clickable, because per-step metrics and logs live inside it (`HogFlowEditorPanel.tsx:113-124`).

## One gap found on the way

The canvas never reads the caller's access level.
`workflowUserAccessLevel` exists (`workflowLogic.ts:2971-2975`) and is consumed only in the scene header (`WorkflowSceneHeader.tsx:81`, `:130`, `:184`, `:227`) and the list table (`WorkflowsTable.tsx:260-320`).
No file under `hogflows/` imports it or `AccessControlAction`.

So a Viewer-level user gets a fully interactive canvas today.
They can drag in steps, delete nodes, and edit configs.
The autosave then fires a real `PATCH` (`workflowLogic.ts:3508`) that only the backend rejects, because the autosave guard checks `autoSaveEnabled`, `props.id`, `editTemplateId`, `status`, `workflowChanged`, and `workflowHasErrors`, and no permission at all (`workflowLogic.ts:3493-3500`).

The `isCodeManaged` guard above lands in exactly the places that fix this.
Make the selector `canEditWorkflow` instead, combine both conditions, and the 1.1 effort closes the gap for free.
