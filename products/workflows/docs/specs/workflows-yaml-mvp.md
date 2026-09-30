# Spec: the YAML MVP for workflows as code

This spec resolves [Silthus/posthog#168](https://github.com/Silthus/posthog/issues/168), part of map [#68](https://github.com/Silthus/posthog/issues/68).
It turns the decisions locked on [#167](https://github.com/Silthus/posthog/issues/167#issuecomment-5903796788) into a build plan.
The research behind it is [`workflows-dsl.md`](https://github.com/Silthus/posthog/blob/research/workflows-dsl/products/workflows/docs/research/workflows-dsl.md) on `research/workflows-dsl`.
Nothing here reopens a decision locked on #167 or #168.

Written on 2026-09-30 against upstream `master` at `645e1a78140`.
The workflows viewset lives at `products/workflows/backend/presentation/views/hog_flow.py` since PostHog/posthog#107597.

## What a person gets

A workflow is one YAML file in a repository.
PostHog serves a JSON Schema for the file, checks a file and reports a change plan, applies a file by its `key`, and renders any workflow back as a file.
A slim CI job calls `check` on a pull request and `apply` on `master`, authenticated with the project secret API key.
Nothing is installed: no npm package, no SDK, no CLI.
The server owns both translations, so a new workflow feature needs no client release.

## Decisions

1. **The document shape** is the research sample with four changes: the trigger key is `trigger`, a step may carry an optional `id`, the secret syntax is gone, and there is no `define`/`use` reuse. Section "The document".
2. **Pydantic document models are the one source.** They validate on the server, generate the served JSON Schema, and feed the compiler and the renderer. The served schema dispatches every union on `type` with `if`/`then`, so one wrong step gives one precise error. Section "Models and schema".
3. **Four routes on the workflows viewset**: `GET hog_flows/code_schema/`, `POST hog_flows/code_check/`, `POST hog_flows/code_apply/`, `GET hog_flows/{id}/code/`. The request carries the YAML as a string in a JSON body. Every document error carries `status`, `message`, `why`, `fix`, a `path`, and a `line` and `column`. Section "Endpoints".
4. **Four MCP tools**: `workflows-get-code-schema`, `workflows-check-code`, `workflows-apply-code`, `workflows-get-code`, all behind the feature flag `workflows-as-code` until their routes serve in production. Section "MCP tools".
5. **Reading back.** The renderer on PostHog/posthog#104452 is retargeted from `@posthog/workflows` TypeScript to YAML in a new PR. `workflows-get-code` keeps its name and returns YAML. The Copy code button leaves the MVP and comes back with the read-only editor behind its flag. Section "Reading back as YAML".
6. **The authoring skill** on PostHog/posthog#104313 is rewritten for YAML and the MCP tools on the same branch, and moves to `products/workflows/skills/writing-workflows-as-code/`. Section "The authoring skill".
7. **Dogfooding.** PostHog's own `products/workflows/workflows/` folder holds YAML files, and one path-filtered job checks them on pull requests and applies them on `master` with curl and jq. #101 and #102 are superseded by one new ticket; #96 is rewritten. Section "Dogfooding".
8. **Six slices**, each a draft PR good enough to merge as it stands. Section "Slices".

No secrets in the MVP.
`check` and `apply` refuse a value for a secret-typed template input, with a located error that names the step and the input.
"Keep a value set in the UI" was not picked: a code-managed workflow is read-only in the UI, so nobody could set that value there without releasing the workflow first.
One thing works without new code: when a file leaves a secret-typed input out, the serializer's existing re-merge keeps a value already stored on the live workflow under the same step id (#73).
The spec states this as behavior, not as a feature.

## The document

### A sample

Invented for this spec. Integration id `12` and every URL are placeholders.

```yaml
version: 1
key: trial-upgrade-nudge
name: Trial upgrade nudge
trigger:
  type: event
  event: trial started
steps:
  - type: delay
    name: Wait three days
    duration: 3d
  - type: branch
    name: Which plan?
    arms:
      - name: Upgraded to pro
        when:
          - { person: plan, operator: exact, value: [pro] }
        then:
          - type: email
            name: Thank the new customer
            from: { integration_ids: [12], name: The Example team }
            to: '{{ person.properties.email }}'
            subject: Thanks for upgrading
            text: Your pro plan is live.
            html: <p>Your pro plan is live.</p>
      - name: Still on trial
        when:
          - { person: plan, operator: exact, value: [trial] }
        then:
          - type: webhook
            id: tell_the_crm
            name: Tell the CRM
            url: https://example.com/hooks/trial
            body:
              distinct_id: '{event.distinct_id}'
exit:
  reason: Trial nudge finished
```

### Top-level fields

| Field            | Required | Meaning                                                                                                                                                                                           |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`        | yes      | Integer `1`. Any other value is `unsupported_version`. Additive changes stay in version 1. A breaking change adds version 2 with a server-side converter, as the research proposes (section 4.3). |
| `key`            | yes      | The workflow's identity, unique per project. `^[A-Za-z0-9_-]{1,400}$`, the rule of the `key` column on PostHog/posthog#105958.                                                                    |
| `name`           | yes      | The workflow name.                                                                                                                                                                                |
| `description`    | no       | Defaults to empty.                                                                                                                                                                                |
| `status`         | no       | `draft` or `active`, default `draft` (locked on #69). The file wins on every apply, so an apply can re-enable a workflow a person disabled.                                                       |
| `exit_condition` | no       | One of the model's `ExitCondition` values, default `exit_only_at_end`. The compiler always sends it, because the model's own default is `exit_on_conversion`.                                     |
| `variables`      | no       | A list of `{key, type, default}`, the shape `HogFlowVariableSerializer` accepts.                                                                                                                  |
| `trigger`        | yes      | One trigger, dispatched on `type`.                                                                                                                                                                |
| `steps`          | yes      | The steps in run order. May be empty.                                                                                                                                                             |
| `exit`           | no       | `{reason, description}` for the single exit node.                                                                                                                                                 |

Workflow fields the document does not carry (`conversion`, `trigger_masking`, `email_sending_rate_limit`, `abort_action`) keep their stored value on an update and take their default on a create.
The renderer warns when a pulled workflow sets one of them.

### Triggers

| `type`                             | Fields                                                                                            | Compiles to                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `event`                            | `event` (required), `properties` (conditions, optional), `filter_test_accounts` (default `false`) | An event trigger whose `filters.events` holds that one event                  |
| `schedule`                         | none                                                                                              | A schedule trigger. The cadence is attached with the schedules API, as today  |
| any other value of `TRIGGER_TYPES` | `config` (object, required)                                                                       | The definition's trigger `config` verbatim, with `type` set from the document |

Every trigger may carry `name` and `description`.
The trigger node's id is always `trigger_node` and the exit node's id is always `exit_node`.

### Steps

Every step has `type` and `name` (required), and `id` and `description` (optional).

| `type`     | Fields                                                                                                                                                                                                       | Compiles to                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delay`    | `duration`, the `<number><unit>` form `delay_duration` accepts (`30m`, `3d`), at most `30d`, because the runtime clamps a longer delay to 30 days without a word                                             | `delay`                                                                                                                                                                                                                                            |
| `branch`   | `arms`: one or more `{name, when, then}`. `when` is one or more conditions. `then` is one or more steps                                                                                                      | `conditional_branch` with one condition per arm                                                                                                                                                                                                    |
| `email`    | `from: {integration_ids, name, email}`, `to` (an address string, or `{email, name}`), `subject`, `text`, `html`, `preheader`. Values use the email template's Liquid syntax, `{{ person.properties.email }}` | `function_email` on `template-email`: `integration_ids` becomes `integrationIds`, a string `to` becomes `{email, name: ""}`. The compiler leaves `design` out, because the serializer already wraps HTML-only emails with `build_html_wrap_design` |
| `webhook`  | `url` (required), `method` (default `POST`), `headers`, `body`                                                                                                                                               | `function` on `template-webhook`                                                                                                                                                                                                                   |
| `function` | `template` (a template id), `inputs` (a map of input key to value)                                                                                                                                           | `function` on that template, each input wrapped as `{value}`                                                                                                                                                                                       |
| `step`     | `action_type` (any action type except `trigger` and `exit`), `config` (object), `branches` (a list of step lists, by branch index)                                                                           | That action verbatim. The escape hatch for every action the typed steps do not cover                                                                                                                                                               |

A condition is `{person: <property>, operator, value}` or `{event: <property>, operator, value}`.
It compiles to one entry in the arm's `filters.properties` with `type` `person` or `event`.

### Identity and wiring

- A step's action id is its `id` when set, otherwise the slug of its `name`: lower case, every run of other characters becomes `_`, trimmed (`Which plan?` becomes `which_plan`). This is the rule locked on #72.
- Two steps with the same id are refused with `duplicate_step_id` on the second one. The `fix` says to give one of them an explicit `id` or a different name.
- A renamed step gets a new id, so `check` lists it as removed and added. The plan names the people in the removed step, and its `fix` says to set `id` to the old id to keep them in place (see `POST code_check/`).
- Steps in a list connect with `continue` edges in order. The last step of the top-level list connects to the exit node.
- A `branch` gets one `branch` edge per arm, at the arm's index, to the first step of `then`. Its `continue` edge (no arm matched) and the last step of every arm go to the step that follows the branch, or to the exit node.
- `step` with `branches` wires branch index `i` to the first step of `branches[i]` the same way.

### Reuse

There is no `define`/`use` in version 1.
Reuse needs id disambiguation for a step placed twice, a second resolution pass in the compiler, a reference check, and an extra shape in the schema.
None of the sample workflows repeats a step.
A step written twice is written twice, with two names or two ids.
YAML anchors and aliases are refused (see "Parsing YAML"), so a repeat cannot hide behind them.

## Models and schema

The document models live in `products/workflows/backend/services/workflow_code/document.py`.

- One Pydantic v2 model per trigger kind and per step kind, all with `extra="forbid"`.
- The trigger and step unions are `Annotated[Union[...], Field(discriminator="type")]`.
- `version` is `Literal[1]`. String fields do not coerce numbers, so an unquoted `1.10` in a string field is an `invalid_value` error that says to quote it.
- Enum values come from the existing sources, not from copies: `SUPPORTED_ACTION_TYPES` and `TRIGGER_TYPES` in `models/hog_flow/hog_flow.py`, `HogFlow.ExitCondition`, and the property operators the serializer accepts.
- Every field has a `description`. Agents read these descriptions through the schema, so they replace the field-by-field docs of the old skill.

The served schema is `WorkflowDocument.model_json_schema()` plus one post-processing pass in `schema.py`.
The pass rewrites every tagged union from `oneOf` plus `discriminator` into this shape (research section 2.2):

```json
{
  "type": "object",
  "required": ["type"],
  "properties": { "type": { "enum": ["delay", "branch", "email", "webhook", "function", "step"] } },
  "allOf": [
    {
      "if": { "properties": { "type": { "const": "delay" } }, "required": ["type"] },
      "then": { "$ref": "#/$defs/DelayStep" }
    }
  ]
}
```

It also sets `$schema` to draft 2020-12 and a `title`.
The schema is static and the same for every project: it does not type the inputs of each project's function templates.
Per-project template inputs and fully typed pass-through configs are the follow-up the map names "Fully typed step configs".

Pydantic is the authoritative validator on the server.
The served schema exists for editors and agents.
A test holds the two together: for a table of wrong documents, `jsonschema` (4.24, already in the lockfile) on the served schema reports exactly one error per wrong step, at the same path the server reports.

The compiler (`compiler.py`) turns a validated document into the definition fields `HogFlowSerializer` accepts.
It ports the rules of the SDK's `emit.ts` from posthog-js#5090 by reading them, not by copying code.
The renderer (`renderer.py`, slice C) turns a stored definition back into a document and prints it.
Both go through the same models.

## Parsing YAML

`yaml_loader.py` parses with PyYAML, already a dependency, through a `SafeLoader` subclass with these changes:

- **YAML 1.2 core scalar rules.** The loader replaces PyYAML's YAML 1.1 implicit resolvers with the YAML 1.2 core schema's. Only `true`/`false` (three casings) are booleans and only `null`, `~` and the empty value are null. `on`, `off`, `yes`, `no`, `y` and `n` stay strings. So `on:` can never become the key `True`, and `no:` can never become `False` (research section 2.3). The int and float resolvers are the 1.2 core ones, so `1:30` stays a string instead of the sexagesimal `90`. There is no timestamp resolver, so `2026-09-30` stays a string instead of a date.
- **Refused, each with a located `yaml_feature_not_allowed` error:** anchors and aliases, merge keys (`<<`), explicit tags, and mapping keys that are not strings.
- **Duplicate keys are refused** with `duplicate_key` at the second key. PyYAML keeps the last one silently otherwise.
- **Positions.** The loader keeps a map from each value's path to the line and column of its node, so every error can point at the file.

The request carries the file as a string (`content`).
A caller that holds JSON may send the JSON text as `content`: when `content` starts with `{` after whitespace, the server parses it with `json.loads` instead of PyYAML, because PyYAML rejects tabs between tokens and splits `😀` into lone surrogates.
JSON content has no position map, so its errors carry a `path` and null `line` and `column`.
There is one field and one error format.

## Errors

Every document error has this shape:

```json
{
  "status": "invalid_value",
  "message": "steps[0].duration: '3 days' is not a duration.",
  "why": "A delay needs a number followed by one unit: s, m, h or d.",
  "fix": "Write the duration as 3d.",
  "path": "steps[0].duration",
  "line": 10,
  "column": 15
}
```

- `status` is a machine code from one `TextChoices` class. The set: `invalid_yaml`, `yaml_feature_not_allowed`, `duplicate_key`, `content_too_large`, `unsupported_version`, `missing_field`, `unknown_field`, `invalid_value`, `unknown_type`, `duplicate_step_id`, `secret_input`, `unknown_template`, `invalid_workflow`, `status_change_not_allowed`, and `conflict`. Slice D adds its ownership refusals, returned with HTTP 403 in this same shape.
- `path` uses the document's own names (`steps[1].arms[0].then[0].subject`), never the definition's, and drops the union tag Pydantic puts in its `loc`.
- `line` and `column` are 1-based and point at the value, or at the key for `unknown_field`, or at the parent mapping for `missing_field`. They are null when no node exists (an empty file) and for JSON content.
- Errors the serializer or `validate_graph` raise after compiling are mapped back to the step through the compiler's map from action id to document path, and carry `status: invalid_workflow`. The serializer runs with `enforce_graph_structure: True` in its context, as the `graph` action does; without it graph errors are only logged.
- All errors are collected and returned together, in file order, not only the first.

A document error returns HTTP 400 with `{"errors": [...]}` from both `check` and `apply`.
Authentication, permission and not-found errors keep the viewset's standard responses.
Invoke `/writing-user-facing-copy` for every `message`, `why` and `fix`.

## Endpoints

All four routes are `@action`s on `HogFlowViewSet`, under `/api/projects/{project_id}/hog_flows/`.
They live in a new module, `presentation/views/hog_flow_code.py`, as a mixin the viewset inherits.
`hog_flow.py` is over 7,000 lines, so its only edits are the base class list and the action names in the scope lists.
Each action carries `@extend_schema` with request and response serializers that have `help_text` on every field (`/improving-drf-endpoints`).

| Route          | Method | Action        | Scope            | Returns                                     |
| -------------- | ------ | ------------- | ---------------- | ------------------------------------------- |
| `code_schema/` | GET    | `code_schema` | `hog_flow:read`  | The JSON Schema                             |
| `code_check/`  | POST   | `code_check`  | `hog_flow:read`  | The plan, or 400 with errors                |
| `code_apply/`  | POST   | `code_apply`  | `hog_flow:write` | The result and the plan, or 400 with errors |
| `{id}/code/`   | GET    | `code`        | `hog_flow:read`  | The workflow as YAML with warnings          |

`code_check` writes nothing, so it takes the read scope even though it is a POST.
The project secret API key reaches these routes once PostHog/posthog#104202 is on the base: slice D adds the four action names to that PR's `psak_allowed_actions`.

### `GET code_schema/`

Returns the served JSON Schema as the response body, so `curl ... > workflow.schema.json` gives a usable file.
The OpenAPI response type is a free-form object.

### `POST code_check/`

Request:

```json
{ "content": "version: 1\nkey: trial-upgrade-nudge\n..." }
```

`content` is required, at most 1 MiB; longer content is `content_too_large`.

Steps, in order:

1. Parse, validate the models, compile.
2. Look the workflow up by `key` in the team. The viewset's access-level filter covers only `list`, so check the caller's access to the found workflow explicitly with `user_access_control.check_access_level_for_object(workflow, "viewer")`, and return 403 when it fails.
3. Validate a deep copy of the compiled definition through `HogFlowSerializer`, with the context `apply` would use and `enforce_graph_structure: True`. Validation writes nothing to the database, but it changes the dicts it gets, which is why it gets a copy.
4. Build the plan by comparing the serializer's `validated_data` with the stored row, normalized the way `_stage_revision_bump` normalizes both sides (secrets stripped, bytecode and other derived keys dropped). Comparing raw compiled dicts would report every step as changed, because validation adds bytecode, filter defaults and the email design.

Response 200:

```json
{
  "plan": {
    "result": "update",
    "workflow": {
      "id": "0199f0c2-...",
      "key": "trial-upgrade-nudge",
      "name": "Trial upgrade nudge",
      "version": 4,
      "status": "active"
    },
    "changed_fields": ["name"],
    "status": { "from": "active", "to": "active" },
    "added_steps": [{ "id": "wait_a_week", "name": "Wait a week", "type": "delay" }],
    "changed_steps": [
      { "id": "which_plan", "name": "Which plan?", "type": "conditional_branch", "changes": ["config.conditions"] }
    ],
    "removed_steps": [
      {
        "action_id": "wait_three_days",
        "name": "Wait three days",
        "runs": 41,
        "moves_to": { "action_id": "which_plan", "name": "Which plan?" },
        "exits": false
      }
    ],
    "in_flight_runs": 57,
    "position_unknown": 0,
    "empty_variables": [],
    "schedule_conflicts": [],
    "discards_draft": false
  },
  "warnings": [
    {
      "message": "41 people are in Wait three days, which this file removes. They move to Which plan?.",
      "fix": "If you renamed the step, add id: wait_three_days to it to keep them where they are.",
      "path": null
    }
  ]
}
```

- `result` is `create`, `update`, `stage` (see "Active workflows through MCP" below) or `unchanged`. It is `unchanged` when no stored field would change. `workflow` is null on `create`.
- `removed_steps` is the `deleted_steps` list `build_publish_impact` returns (`presentation/views/publish_impact.py`). `in_flight_runs`, `position_unknown`, `empty_variables` and `schedule_conflicts` come from the same call and from the viewset's `_get_in_flight_counts`, with the stored live graph as "live" and the validated definition as "draft". Their serializers are the existing `HogFlowPublishImpact*Serializer` classes. Counts are best effort: `runs` and `in_flight_runs` are null when the counting service is unavailable, never 0.
- `changed_steps` compares steps by action id. `changes` lists the dotted paths, at most two levels deep, whose values differ.
- `discards_draft` is true when the stored workflow has a staged draft that `apply` would discard by writing live content. It is false when `result` is `stage`.
- A removed step with people in it adds one warning, as above.

### `POST code_apply/`

Same request as `check`.
It runs steps 1 and 2 of `check` (with `"editor"` as the access level on an existing workflow), then writes:

- **Create** when no workflow has the key: through `HogFlowSerializer` with `key` set on save, as `perform_create` does. The first revision comes from PostHog/posthog#104156 once that is on the base; `apply` does not duplicate it.
- **Update** when the key exists: inside one `transaction.atomic()`, lock the row with `select_for_update`, build the serializer on the locked row and validate there, then run the sequence `publish` uses today: `_refresh_action_redirects`, `_stage_revision_bump`, `serializer.save()`, `_append_revisions` when the content changed. Validating before the lock would compare against a stale row; PostHog/posthog#103540 fixed the same race in `perform_update`. It then clears a staged draft the way `discard_draft` does, including `unstage_workflow_proposals`.
- **Secrets on update** come from the live row only. The serializer's `existing_encrypted_inputs` context normally merges the staged draft's secrets last; apply builds that context from the live `encrypted_inputs` alone, so discarding a draft never puts the draft's secrets live.
- **Unchanged**: no write, no revision, no activity log entry.
- After a write: `_maybe_reschedule_timing_edits`, `_pause_schedules_on_audience_change`, the activity log, and `_emit_resource_edited`, as `perform_update` does.
- **Status through MCP.** A request from the MCP transport may not create an `active` workflow or change the stored `status`, the rule `perform_create` and `perform_update` already apply. It gets `status_change_not_allowed`, whose `fix` names `workflows-enable` and `workflows-disable`.
- **Active workflows through MCP.** Through the MCP transport, a content change to an active workflow is staged as a draft with the viewset's `_write_draft`, the way `perform_update` routes MCP edits today, and `result` is `staged`. The agent then publishes it with `workflows-publish`, whose preview and confirm token stay the only way an agent puts content live. Every other caller writes live, as the raw API does today.
- **A concurrent create** of the same key hits the unique constraint from PostHog/posthog#105958 and returns 409 with `status: conflict` and a `fix` that says to retry.

Response 201 on create, 200 otherwise:

```json
{
  "result": "updated",
  "workflow": {
    "id": "0199f0c2-...",
    "key": "trial-upgrade-nudge",
    "name": "Trial upgrade nudge",
    "version": 5,
    "status": "active"
  },
  "plan": { "...": "the check plan" },
  "warnings": []
}
```

`result` is `created`, `updated`, `staged` or `unchanged`.
`apply` never refuses a change because people are in a removed step.
Whether it should is Michael's open decision on #98, listed in the map as "Breaking changes to code-defined workflows".

### `GET {id}/code/`

Response 200:

```json
{
  "content": "version: 1\nkey: trial-upgrade-nudge\n...",
  "warnings": [
    {
      "action_id": "tell_the_crm",
      "message": "The input signing_secret of Tell the CRM is a secret. The file leaves it out, and apply keeps the stored value."
    }
  ]
}
```

It renders the live workflow, not a staged draft.
When a draft exists, a warning says so.

### Usage tracking

Four events through the product's existing reporting path (`_report_workflow_action`, or `report_user_action` where no workflow exists yet): `hog_flow_code_schema_fetched`, `hog_flow_code_checked` (`result`, `errors_count`), `hog_flow_code_applied` (`result`, `added_steps`, `removed_steps`), and `hog_flow_code_pulled` (`warnings_count`).
The request's event source tells MCP, API and CI apart, as it does for the other workflow events.
Slice D makes them fire for a project secret API key request the way PostHog/posthog#104202 records that key's activity.

## MCP tools

In `products/workflows/mcp/tools.yaml`, each added by the slice that adds its route:

| Tool                        | Operation                        | Scope            | Annotations             |
| --------------------------- | -------------------------------- | ---------------- | ----------------------- |
| `workflows-get-code-schema` | `hog_flows_code_schema_retrieve` | `hog_flow:read`  | read-only, idempotent   |
| `workflows-check-code`      | `hog_flows_code_check_create`    | `hog_flow:read`  | read-only, idempotent   |
| `workflows-apply-code`      | `hog_flows_code_apply_create`    | `hog_flow:write` | destructive, idempotent |
| `workflows-get-code`        | `hog_flows_code_retrieve`        | `hog_flow:read`  | read-only, idempotent   |

- All four carry `feature_flag: workflows-as-code` with `feature_flag_behavior: enable`. The MCP server deploys apart from Django, and `/implementing-mcp-tools` says to gate a tool whose route is new. Someone with access creates the flag in PostHog's own project; the flag and its removal belong to the launch, not to these PRs.
- The tools forward to Django at call time, so a new step kind reaches agents with a Django deploy and no MCP release.
- `workflows-get-code` keeps the name PostHog/posthog#104452 gave it. That PR never merged, so nothing depends on the TypeScript output.
- Check `TRAILING_ACTIONS` in `services/mcp/src/lib/instructions.ts` for `check` and `apply`, as `/implementing-mcp-tools` asks.

## Reading back as YAML

The renderer on PostHog/posthog#104452 (`products/workflows/backend/services/code_renderer.py` at `14ad61343c5`) builds a tree of `_Call` nodes and then prints TypeScript.
Slice C lifts the walk (arm detection, placements, warnings) into `workflow_code/renderer.py`, builds document models instead of `_Call` nodes, and prints them with a `SafeDumper` in model field order.

- **Lossless or pass-through.** A step renders as a typed step only when compiling that typed step gives back the stored action. Otherwise it renders as `type: step` with its raw config. An email whose `design` is not the HTML wrap of its `html` is the common case.
- **No hoisting.** `hoist_repeats` goes away with `define`/`use`.
- **Secret inputs** are left out, with a warning per input.
- **A workflow without a key** gets the kebab-case slug of its name and a warning that applying the file creates a new workflow, because adopting an existing workflow is deferred (#72).
- **Quoting.** The dumper quotes every string that YAML 1.1 or 1.2 would read as something else (`on`, `no`, `1.10`, `012`), so the file reads the same in any editor and in the loader.
- **Warnings** also open the file as `#` comment lines, so they survive a copy of `content` alone.
- **The round trip** is one parametrized Python test over the fixtures of #104452: `compile(parse(render(d)))`, validated by the serializer, equals the normalized definition, which is the `.roundtrip.json` fixture where one exists and the `.json` input otherwise. Each `.ts` becomes a `.yaml`; the `.json` and `.roundtrip.json` inputs stay.

The Copy code button and its frontend logic from #104452 are not in the MVP.
They come back with the read-only editor, behind its flag, and call `{id}/code/`.

## The authoring skill

Slice E rewrites PostHog/posthog#104313 on its own branch and moves the skill to `products/workflows/skills/writing-workflows-as-code/`, next to `building-workflows`, so it ships with the product's other skills.

- `SKILL.md`: when to use it, the loop (get the schema, write the file, `workflows-check-code`, fix every error, `workflows-apply-code`), how to read a plan, and the rules the schema cannot say: keys are forever, a renamed step moves its people, `status` in the file wins, no secrets.
- `references/errors.md` carries over, rewritten for the statuses above.
- `references/ci.md`: the copy-pasteable GitHub Actions job for a customer repository, with one secret, the project secret API key.
- `references/steps.md` is deleted. Field docs live in the schema's descriptions.
- If the four tools are missing, the skill tells the agent that workflows as code is not enabled for the project yet.
- `building-workflows/SKILL.md` gains one line that points at the new skill.

## Dogfooding

Slice F replaces the npm-shaped work of #101 and #102 (PostHog/posthog#104157 and #104164) with one PR:

- `products/workflows/workflows/welcome-new-signups.yaml`: one draft workflow with an event trigger, a delay, a branch on a person property and an email, and no secret. File name and key match.
- `products/workflows/workflows/README.md`: what the folder is, how to check a file by hand with curl, and what the job does.
- One paragraph in `products/workflows/CONTRIBUTING.md` pointing at the folder.
- `.github/workflows/workflows-as-code.yml`:
  - Triggers `pull_request` and `push` to `master`, both path-filtered to `products/workflows/workflows/**` and the workflow file.
  - No Node, no pnpm, no npm. Each file goes out as `jq -Rs '{content: .}' "$file" | curl --fail-with-body ...`.
  - **Check on a pull request** with a read-only key (`hog_flow:read`). Errors print as `file:line:column: status: message`, then `why` and `fix`, and as GitHub `::error file=...,line=...,col=...::` annotations.
  - **Apply on `master`** with a `hog_flow:write` key held in a GitHub environment that only `master` may use, so a pull request run cannot read it. The body adds `source` (repository, path, commit) for slice D.
  - When a key is not set, the job prints one line and succeeds. A fork pull request has no secrets, so it passes that way.
  - The project id comes from a repository variable that defaults to `2`, and the host from one that defaults to `https://us.posthog.com` (#105).

The job calls production endpoints, so the PR merges only after slices B and D serve there.

Ticket #96 stays, rewritten: once the MVP PRs are merged and deployed, one live check, apply and pull against a throwaway PostHog project, with the project and key from Michael out of band, plus the customer-facing docs and launch surface the map lists as not yet specified.

## Slices

Cross-fork pull requests cannot stack, so a PR that needs unmerged work carries those commits until they merge.
Every slice is a draft PR on upstream `PostHog/posthog` from a branch on the fork `Silthus/posthog`, built test-first from the API test.

| Slice | Outcome                                                                   | Base and carried commits                                                                                                                                                   | Depends on |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A     | Check a workflow YAML file against PostHog                                | Upstream `master` plus the one commit of PostHog/posthog#105958 (`9975cce79e9`, the `key` column)                                                                          | none       |
| B     | Apply a workflow YAML file by key                                         | Slice A's branch                                                                                                                                                           | A          |
| C     | Pull any workflow as YAML                                                 | Slice A's branch                                                                                                                                                           | A          |
| D     | A workflow applied from CI with the project secret key is managed by code | Upstream `master` plus the commits of PostHog/posthog#103540 (which carry #105958, #103849, #104156 and #104202), restacked onto the moved viewset, plus slice B's commits | B          |
| E     | The authoring skill teaches YAML and the MCP tools                        | The branch of PostHog/posthog#104313, rewritten in place                                                                                                                   | C, D       |
| F     | PostHog's own workflows are YAML files that CI checks and applies         | Upstream `master`                                                                                                                                                          | D          |

The tickets on the fork: A is #169, B is #170, C is #171, D is #172, E is #173, F is #174.
Bare PR numbers below (#105958, #103849, #104156, #104202, #103540, #104313, #104452) are on upstream `PostHog/posthog`.

Why this shape:

- **A carries only the column.** Check and apply need `key` only to look a workflow up and to set it on create. #105958 is the model and its two migrations, four files that apply cleanly to `master`. The serializer and list-filter work of #103849 still edits the old `api/hog_flow.py` and is not needed.
- **A is safe alone.** It writes nothing, and its MCP tools stay behind the flag. B follows closely.
- **C does not wait for B.** The round trip needs the compiler, not the write path. B and C touch the same shared files (below), so the conductor runs them one after the other.
- **D is the only slice that needs #103540.** Ownership columns, the code-ownership guard, the first revision on create and the project secret key path all arrive with it. D restacks those commits in its own branch; if the other session has already restacked #105958, #103849, #104156 or #104202, D carries their current heads instead. D never pushes to any of those PRs' branches or to #103540's.
- **D's authored work**: `code_apply` accepts `source: {repository, path, ref}` and `allow_move`. With `source`, apply sets `managed_by: code` and the three `source_*` fields, so the revision records the source. `created_via` stays what #103540 makes it: read-only, stamped from the event source on create, never changed afterwards. The #103540 guard (`code_ownership.py`) exempts every non-session, non-MCP API request today, so the apply refusals are new rules, not existing ones: an apply over a code-managed workflow is refused when it has no `source`, when it comes through the MCP transport, or when its repository and path differ from the stored ones and `allow_move` is not set. The code actions return these refusals as HTTP 403 in the document error shape (`status` is the refusal kind); the guard's own 403 shape for other actions stays as #103540 has it. The four action names join `psak_allowed_actions`. The guard's copy that says to push with the workflows CLI (`code_ownership.py`, the claim refusal) names `apply` instead. The plan gains `managed_by: {from, to}`.
- **E updates #104313 in place.** It is four files with no carried commits, so a rewrite on the same branch keeps its review history. The ticket records the old head `1af2608455a` before a `--force-with-lease` push.
- **C opens a new PR instead of updating #104452.** That branch carries #103540 and the phase 1a work, the TypeScript printer and fixtures, and the frontend button. Over 8,000 lines, almost all of it would be replaced. #104452 is superseded by slice C.
- **F needs no backend commits.** It is a workflow file and YAML files. Its proof runs against a local PostHog on slice D's branch.

### Shared files

These files are edited by more than one slice, so slices that touch them run one at a time:

- `products/workflows/backend/presentation/views/hog_flow.py` (scope lists, base classes, `psak_allowed_actions`): A, B, C, D.
- `products/workflows/backend/presentation/views/hog_flow_code.py`: A, B, C, D.
- `products/workflows/mcp/tools.yaml` and everything `hogli build:openapi` regenerates (`products/workflows/frontend/generated/`, `services/mcp/src/api/generated.ts`, `services/mcp/src/generated/workflows/`, `services/mcp/src/tools/generated/workflows.ts`, `services/mcp/schema/`, the tool-schema snapshots under `services/mcp/tests/`): A, B, C, D.
- `products/workflows/CONTRIBUTING.md`: D, F.

## Out of the MVP

- A public, unauthenticated schema URL and the `# yaml-language-server: $schema=` modeline.
- Deleting or archiving a workflow when its file is gone.
- `posthog-cli workflows`. It may wrap these endpoints later with no logic of its own.
- Secret syntax (#73 holds the options).
- `define`/`use` reuse.
- Per-project typed template inputs, and typed configs for every action type.
- Adopting an existing workflow that has no key.
- The Copy code button, the read-only editor and the ownership badges (behind their flag, after the MVP).
- Refusing an apply that removes a step with people in it (#98, Michael's decision).
