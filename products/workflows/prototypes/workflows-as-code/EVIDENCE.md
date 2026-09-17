# Evidence

What this prototype was checked against, on a machine with no PostHog stack. Every output below
is verbatim, produced by a script in `dev/` that you can rerun.

Toolchain: bun 1.4.2, TypeScript from `bunx tsc` (5.x, fetched on demand). No local PostHog, no
docker, no hogli.

## Reproduce

```bash
bun install                                # @types/bun only, needed for the typecheck
bun run example/onboarding.workflow.ts     # the emitted definition
bun run dev/record-transcript.ts           # the wire-level fake-server transcript
bun run dev/identity-transcript.ts         # write-back, unchanged, updated, deleted id
bun run dev/validation-demo.ts             # validate() on a hand-written definition
bunx tsc --noEmit                          # the SDK and the example type-check
bunx tsc --noEmit -p dev/breakages/tsconfig.json   # the two deliberate breakages
```

## 1. The emitted definition

`bun run example/onboarding.workflow.ts`, unchanged:

```json
{
  "name": "Onboarding nudge (workflows as code)",
  "description": "Prototype workflow, authored in TypeScript and pushed from CI.",
  "status": "draft",
  "exit_condition": "exit_only_at_end",
  "actions": [
    {
      "id": "trigger_node",
      "name": "Trigger",
      "type": "trigger",
      "config": {
        "type": "event",
        "filters": {
          "events": [
            {
              "id": "user signed up",
              "name": "user signed up",
              "type": "events",
              "order": 0,
              "properties": []
            }
          ],
          "properties": [],
          "filter_test_accounts": false
        }
      }
    },
    {
      "id": "delay_1",
      "name": "Wait a day",
      "type": "delay",
      "config": {
        "delay_duration": "1d"
      }
    },
    {
      "id": "branch_1",
      "name": "On a paid plan?",
      "type": "conditional_branch",
      "config": {
        "conditions": [
          {
            "name": "Paid plan",
            "filters": {
              "properties": [
                {
                  "key": "plan",
                  "operator": "exact",
                  "value": [
                    "pro",
                    "enterprise"
                  ],
                  "type": "person"
                }
              ]
            }
          }
        ]
      }
    },
    {
      "id": "webhook_1",
      "name": "Tell the CRM to follow up",
      "type": "function",
      "config": {
        "template_id": "template-webhook",
        "inputs": {
          "url": {
            "value": "https://example.com/hooks/onboarding"
          },
          "method": {
            "value": "POST"
          },
          "body": {
            "value": {
              "distinct_id": "{event.distinct_id}",
              "plan": "{person.properties.plan}"
            }
          }
        }
      }
    },
    {
      "id": "exit_node",
      "name": "Exit",
      "type": "exit",
      "config": {
        "reason": "Onboarding nudge finished"
      }
    }
  ],
  "edges": [
    {
      "from": "trigger_node",
      "to": "delay_1",
      "type": "continue"
    },
    {
      "from": "delay_1",
      "to": "branch_1",
      "type": "continue"
    },
    {
      "from": "branch_1",
      "to": "exit_node",
      "type": "continue"
    },
    {
      "from": "webhook_1",
      "to": "exit_node",
      "type": "continue"
    },
    {
      "from": "branch_1",
      "to": "webhook_1",
      "type": "branch",
      "index": 0
    }
  ]
}
```

Two things to read here. The branch edge carries `index: 0` and `config.conditions` has exactly
one entry, both produced from the same array position in the source file. And the `webhook_1`
path rejoins `exit_node` through a `continue` edge, so every non-exit node has a next step.

## 2. Push against the fake endpoint

`dev/fake-posthog.ts` is a `Bun.serve` stand-in for `/api/projects/{id}/hog_flows/`. It records
each exchange and answers with the shape the real endpoints return, including the read-only
fields a client never sends. The transcript below is two runs against one project, with no id in
the file either time, so the second run has to find the workflow by name. The key is redacted by
the recorder, and the value used is the placeholder `phx_REPLACE_ME`.

```text
--- first run (create path) ---
GET /api/projects/2/hog_flows/?search=Onboarding%20nudge%20(workflows%20as%20code)&limit=500
  headers  {"authorization":"Bearer phx_REDACTED","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     (no body)
  <- 200 {count: 0, results: []}
POST /api/projects/2/hog_flows/
  headers  {"authorization":"Bearer phx_REDACTED","content-length":"1426","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     {name: "Onboarding nudge (workflows as code)", status: "draft", actions: 5, edges: 5}
  <- 201 {id: "0199c0de-0000-0000-0000-000000000001", version: 1, ...whole definition echoed}
result: created 0199c0de-0000-0000-0000-000000000001 (version 1)
url:    https://posthog.example.com/project/2/workflows/0199c0de-0000-0000-0000-000000000001

--- second run (matched by name, nothing changed) ---
GET /api/projects/2/hog_flows/?search=Onboarding%20nudge%20(workflows%20as%20code)&limit=500
  headers  {"authorization":"Bearer phx_REDACTED","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     (no body)
  <- 200 {count: 1, results: ["Onboarding nudge (workflows as code)"]}
GET /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/
  headers  {"authorization":"Bearer phx_REDACTED","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     (no body)
  <- 200 {id: "0199c0de-0000-0000-0000-000000000001", version: 1, ...whole definition echoed}
result: unchanged 0199c0de-0000-0000-0000-000000000001 (version 1)
url:    https://posthog.example.com/project/2/workflows/0199c0de-0000-0000-0000-000000000001
```

Notes on what this proves and what it does not:

- The rerun never creates a duplicate, and it never writes either: it fetches the workflow and
  finds it already matches the file.
- `Authorization: Bearer …` is the only auth header, and there is no `X-PostHog-Client` header,
  so the request is the non-MCP client that may `PATCH` `actions` and `edges` directly.
- The body carries only writable fields: `name`, `description`, `status`, `exit_condition`,
  `actions`, `edges`. `trigger`, `version`, `billable_action_types`, `abort_action`,
  `action_redirects` and the `draft*` fields are read-only on `HogFlowSerializer` and are never
  sent.
- The fake server accepts whatever the SDK sends. It does not validate, so it proves the request
  shape and the control flow, not that PostHog accepts this definition.

### Lookup by name

`HogFlowFilterSet` filters on `id`, `created_at`, `updated_at` and `status` only. The one
name-ish filter is `search`, handled in `safely_get_queryset`: a case-insensitive regex over
`name` and `description`, with spaces matching runs of space, dash or underscore. That is a
substring match, so it can return near misses and cannot stand in for an exact match.

`push()` therefore sends `?search=<name>&limit=500` to narrow the page, then matches `name`
exactly on the client. Two workflows sharing the name fail with `ambiguous_name` rather than
picking one. This path only runs for a file with no `id` yet. Once the id is in the file the
name is not used for identity at all, which is also what makes renaming a workflow an edit
rather than a second workflow.

## 3. Identity in the source file

`dev/identity-transcript.ts` copies the example to `example/scratch.workflow.ts` and runs that
copy as a real child process four times, because the write-back finds its target from the
entrypoint bun started and faking the entrypoint would fake the thing under test. The scratch
file is deleted at the end, so the example in git is never touched. Verbatim:

```text
--- 1. first run: creates the workflow and writes the id back ---
$ bun run example/scratch.workflow.ts --push
  GET /api/projects/2/hog_flows/?search=Onboarding%20nudge%20(workflows%20as%20code)&limit=500 -> 200
  POST /api/projects/2/hog_flows/ -> 201
  created workflow 0199c0de-0000-0000-0000-000000000001 (version 1)
  wrote the id into example/scratch.workflow.ts. Commit it so the next run finds this workflow.
  https://posthog.example.com/project/2/workflows/0199c0de-0000-0000-0000-000000000001
  exit 0

--- diff of the file after the create ---
--- example/onboarding.workflow.ts	2026-09-17 18:53:26
+++ example/scratch.workflow.ts	2026-09-17 20:00:14
@@ -1,6 +1,7 @@
 import { onEvent, person, run, workflow } from '../sdk'
 
 export const onboarding = workflow({
+    id: '0199c0de-0000-0000-0000-000000000001',
     name: 'Onboarding nudge (workflows as code)',
     description: 'Prototype workflow, authored in TypeScript and pushed from CI.',
 })

--- 2. rerun with the id in the file: nothing changed, so nothing is written ---
$ bun run example/scratch.workflow.ts --push
  GET /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/ -> 200
  unchanged workflow 0199c0de-0000-0000-0000-000000000001 (version 1)
  https://posthog.example.com/project/2/workflows/0199c0de-0000-0000-0000-000000000001
  exit 0

--- 3. the delay changed from 1d to 2d in the file ---
$ bun run example/scratch.workflow.ts --push
  GET /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/ -> 200
  PATCH /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/ -> 200
  updated workflow 0199c0de-0000-0000-0000-000000000001 (version 2)
  https://posthog.example.com/project/2/workflows/0199c0de-0000-0000-0000-000000000001
  exit 0

--- 4. the workflow was deleted in PostHog, and the file still owns its id ---
$ bun run example/scratch.workflow.ts --push
  GET /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/ -> 404
  status: 404
  message: The workflow this file owns is not in PostHog any more.
  why: example/scratch.workflow.ts carries id 0199c0de-0000-0000-0000-000000000001, and PostHog answered 404 for it, so it was deleted or it lives in another project.
  fix: Either remove the id line from example/scratch.workflow.ts and run again, which creates a new workflow and writes the new id back, or restore the workflow with id 0199c0de-0000-0000-0000-000000000001 in PostHog and keep the file as it is.
  exit 1
```

What each run shows:

1. **Create and write back.** No `id` in the file, no workflow by that name, so `POST`, then the
   returned id goes into the `workflow({ ... })` call. The diff is one line, indented to match
   the `name:` line it sits above, which is the anchor the insertion uses.
2. **Unchanged.** The id is in the file now, so there is no list request at all: one `GET` of the
   workflow, a compare, and no write. The version is still 1.
3. **Updated.** One word changed in the file (`1d` to `2d`), the compare disagrees, the whole
   definition goes up in one `PATCH`, and the version moves to 2.
4. **Deleted id.** The workflow is gone from the fake server and the file still carries its id.
   The `GET` returns 404 and the error names both ways out, since only the human knows which one
   they meant.

### What the compare ignores

Change detection projects both sides onto the fields a client may write (`name`, `description`,
`status`, `exit_condition`, `actions`, `edges`), rather than stripping a list of server fields.
Every read-only field falls outside the projection by construction, including read-only fields
added to the serializer later. On top of the projection:

- Per action, only `id`, `name`, `description`, `type`, `config` and `on_error` are compared.
  `bytecode` is dropped wherever it appears, and the epoch-millisecond `created_at` / `updated_at`
  that `HogFlowActionSerializer` documents as frontend-managed (`hog_flow.py:924-925`) are the
  editor's bookkeeping, not the file's.
- Empty is absent on both sides. A freshly created workflow comes back with `filters: null` on
  every action (`filters` has `default=None`, `hog_flow.py:926-928`) and `description: ""`
  (`default=""`, `hog_flow.py:917`), neither of which the file sent. Without this the very next
  run would report `updated`.
- `on_error` needed no defaulting rule after all. It is `required=False, allow_null=True` with no
  `default` (`hog_flow.py:918-923`), so an action that omits it is stored without the key. The
  `null` case is covered by the empty rule.
- Edge `index` is dropped on `continue` edges. This is defensive rather than required: nothing
  server-side writes an `index`, and `graph_validation.py:56-70` only reads it on `branch` edges.
- Actions and edges are sorted before comparing. A graph with the same nodes and the same edges
  is the same graph, and the server's own change check compares lists positionally
  (`hog_flow.py:3014`), so a pure reordering would otherwise cost a version bump for nothing.

## 4. What a PATCH does to version and revisions

Established by reading `products/workflows/backend/api/hog_flow.py` and
`products/workflows/backend/models/hog_flow_revision.py`, not by running anything. For a
whole-definition `PATCH` from a non-MCP client holding a personal API key:

- **Draft routing does not apply.** `route_to_draft` can only become true inside
  `if self._is_mcp_request(...)` (`hog_flow.py:2868-2869, 2894-2895`), so the write goes straight
  to the live row whether the workflow is `draft` or `active`. The two cases are otherwise
  identical here; an active workflow additionally runs `_maybe_reschedule_timing_edits`
  (`hog_flow.py:2954`).
- **`version` moves only when the content moved.** `_stage_revision_bump`
  (`hog_flow.py:2998-3017`) snapshots `DRAFT_CONTENT_FIELDS` (`actions`, `edges`, `trigger`,
  `trigger_masking`, `conversion`, `exit_condition`, `abort_action`, `variables`;
  `hog_flow.py:144-153`), strips secrets from both sides, and returns false on equality. An
  identical `PATCH` leaves `version` where it was.
- **Revisions follow the same gate.** `_append_revisions` is called from one place, under
  `if bump:` (`hog_flow.py:2951, 3019-3037`). There is no status gate, so a draft workflow gets
  revisions exactly like an active one. The first bump writes two rows: a backfill row at the old
  version with `created_by=None`, then the new one. `HogFlowRevision` is unique on
  `(hog_flow, version)` (`hog_flow_revision.py:15`), which is why the bump and the append share a
  transaction. Create writes no revision at all.
- **The server still saves.** `serializer.save()` runs unconditionally (`hog_flow.py:2948`), so
  an identical `PATCH` costs an `updated_at` bump, an activity log entry, a worker config reload
  through the `post_save` receiver, and a recomputation of `action_redirects`.

So the server already skips the version bump and the revision on a no-op. The client-side compare
is still the point of the ticket, and it buys three things the server's check does not: the file
is what decides, so `unchanged` is printed without a write; the four side effects above do not
fire on every CI run; and the server's check is positional over lists and strict about
`null` versus `{}` (`hog_flow.py:3014`, `validation.py:576-578`), so a client that normalizes
differently from the serializer would bump the version on a workflow nobody edited.

## 5. The two deliberate breakages

`bunx tsc --noEmit -p dev/breakages/tsconfig.json`, verbatim:

```text
dev/breakages/branch-without-condition.workflow.ts(11,13): error TS2741: Property 'when' is missing in type '{ name: string; then: (path: Chain) => Chain; }' but required in type 'BranchSpec'.
dev/breakages/string-where-duration-goes.workflow.ts(7,12): error TS2345: Argument of type '"tomorrow"' is not assignable to parameter of type 'Duration'.
```

- **A branch edge whose index has no condition.** The builder derives each branch index from its
  position in `branches`, so the only way to author an edge with no condition behind it is to omit
  `when`. `BranchSpec.when` is required and typed as a non-empty tuple, so both the missing and
  the empty case fail to compile.
- **A string where a duration goes.** `Duration` is the template literal type
  `` `${number}d` | `${number}h` | `${number}m` ``, which is the type-level form of the
  serializer's `^\d*\.?\d+[dhm]$`. `"tomorrow"` does not compile; `"1.5h"` does.

## 6. validate() on a hand-written definition

The builder makes those two mistakes unwritable, so the runtime validator is what catches a
definition that arrived from somewhere else. `bun run dev/validation-demo.ts`, verbatim:

```text
status: invalid_definition
message: Step "Wait" has delay "90 seconds", which is not a duration.
why: The API accepts a number plus one of m, h or d, matching ^\d*\.?\d+[dhm]$. Seconds and ISO-8601 are rejected.
fix: Write the delay as a number plus m, h or d, for example "30m", "1.5h" or "1d".

status: invalid_definition
message: Branch edge 1 out of step "On a paid plan?" has no matching condition.
why: That step has 1 condition(s), so the only valid branch indexes are 0 to 0.
fix: Add a condition at index 1 on "On a paid plan?", or point the edge at an index that exists.

status: invalid_definition
message: Step "Wait" has no next step.
why: A run that reaches a step with no outgoing edge fails with "No next action found".
fix: Add a step after "Wait", or end that path with .exit().
```

This mirrors `validate_graph` in `products/workflows/backend/api/graph_validation.py` (unique
ids, exactly one trigger, edge endpoints resolve, branch index in range, no duplicate branch
index) plus the duration rule and the "every non-exit node has an outgoing edge" rule.
Unreachable nodes are a warning, not an error, matching the backend treating them as advisory.

## 7. The CI job

`.github/workflows/workflows-as-code-demo.yml` was written against the repo's workflow
conventions: `workflow_dispatch` only, `timeout-minutes` on the job, the canonical concurrency
block, both third-party actions pinned to a full commit SHA with a version comment, and a sparse
checkout of the prototype folder alone.

The job now commits the write-back, because an id that only exists on the runner is an id the
next run does not have. `permissions` moves from `contents: read` to `contents: write`, the
commit uses the `github-actions[bot]` identity, the message ends in `[skip ci]`, and the step
exits early unless `git status --porcelain` shows the example file changed. So a run that found
nothing to create, or a run that reported `unchanged`, commits nothing and pushes nothing. The
example file is inside the sparse checkout, so `git status` sees it.

`actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd` (v6.0.2) is the pin already used
across this repo. `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` (v2.2.0) was read
from the tag on GitHub; `setup-bun` is not used anywhere else in the repo, so there was no
existing pin to copy.

## Not verified here

- **The live push.** No personal API key and no project on this machine, so no request has ever
  reached a real PostHog. Everything in section 2 is against the fake server.
- **That PostHog accepts this definition.** The DRF serializer validates templates, filters,
  inputs and permissions that the SDK deliberately does not. The three inputs the example sends
  (`url` required, `method`, `body`) were checked against the checked-in template fixture
  `products/cdp/backend/api/test/__data__/hog_function_templates.json`, not against a live
  `cdp-function-templates-retrieve`. A template schema is live data, so a project whose catalog
  has drifted from that fixture could still return 400.
- **The workflow URL shape.** `{host}/project/{project_id}/workflows/{id}` was read off the
  frontend route table (`/workflows/:id/:tab` under the project-scoped prefix), not opened in a
  browser.
- **`bin/hogli lint:workflows` and `actionlint`.** Neither is installed here (no `node_modules`,
  no hogli), so the Actions file was checked by hand against the conventions and parsed as YAML,
  not run through the linters.
- **The commit-back step.** It has never run. Whether the sparse, non-cone checkout pushes
  cleanly back to the branch is the first thing to watch on the next live run.
- **What the real serializer echoes.** The fake endpoint reproduces the three defaults the
  compare depends on (`filters: null`, `description: ""`, no `index` on continue edges) from
  reading `hog_flow.py`, not from a real response. A field the serializer injects that was missed
  would show up as a workflow that reports `updated` on every run.
- **Behavior of a rerun after someone edits the workflow in the UI.** The edit now shows up as a
  difference, so the next push reports `updated` and overwrites it with whatever the file says.
  Whether that is the right answer, and whether the user should be told what was overwritten, is
  a question for the spec map rather than something this prototype settles.
