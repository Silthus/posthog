# Evidence

What this prototype was checked against, on a machine with no PostHog stack. Every output below
is verbatim, produced by a script in `dev/` that you can rerun.

Toolchain: bun 1.4.2, TypeScript from `bunx tsc` (5.x, fetched on demand). No local PostHog, no
docker, no hogli.

## Reproduce

```bash
bun install                                # @types/bun only, needed for the typecheck
bun run example/onboarding.workflow.ts     # the emitted definition
bun run dev/record-transcript.ts           # the fake-server transcript
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
each exchange and answers with the shape the real endpoints return. The transcript below is both
paths in one run: an empty project, then a rerun against the workflow the first run created. The
key is redacted by the recorder, and the value used is the placeholder `phx_REPLACE_ME`.

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
result: created 0199c0de-0000-0000-0000-000000000001
url:    http://localhost:51725/project/2/workflows/0199c0de-0000-0000-0000-000000000001

--- second run (update path) ---
GET /api/projects/2/hog_flows/?search=Onboarding%20nudge%20(workflows%20as%20code)&limit=500
  headers  {"authorization":"Bearer phx_REDACTED","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     (no body)
  <- 200 {count: 1, results: ["Onboarding nudge (workflows as code)"]}
PATCH /api/projects/2/hog_flows/0199c0de-0000-0000-0000-000000000001/
  headers  {"authorization":"Bearer phx_REDACTED","content-length":"1426","content-type":"application/json","user-agent":"Bun/1.4.2"}
  body     {name: "Onboarding nudge (workflows as code)", status: "draft", actions: 5, edges: 5}
  <- 200 {id: "0199c0de-0000-0000-0000-000000000001", version: 2, ...whole definition echoed}
result: updated 0199c0de-0000-0000-0000-000000000001
url:    http://localhost:51725/project/2/workflows/0199c0de-0000-0000-0000-000000000001
```

Notes on what this proves and what it does not:

- The upsert never creates a duplicate on a rerun. That is the property the CI job depends on.
- `Authorization: Bearer …` is the only auth header, and there is no `X-PostHog-Client` header,
  so the request is the non-MCP client that may `PATCH` `actions` and `edges` directly.
- The body carries only writable fields: `name`, `description`, `status`, `exit_condition`,
  `actions`, `edges`. `trigger`, `version`, `billable_action_types`, `abort_action`,
  `action_redirects` and the `draft*` fields are read-only on `HogFlowSerializer` and are never
  sent.
- The fake server accepts whatever the SDK sends. It does not validate, so it proves the request
  shape and the upsert control flow, not that PostHog accepts this definition.

### Lookup by name

`HogFlowFilterSet` filters on `id`, `created_at`, `updated_at` and `status` only. The one
name-ish filter is `search`, handled in `safely_get_queryset`: a case-insensitive regex over
`name` and `description`, with spaces matching runs of space, dash or underscore. That is a
substring match, so it can return near misses and cannot stand in for an exact match.

`push()` therefore sends `?search=<name>&limit=500` to narrow the page, then matches `name`
exactly on the client. Two workflows sharing the name fail with `ambiguous_name` rather than
picking one.

## 3. The two deliberate breakages

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

## 4. validate() on a hand-written definition

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

## 5. The CI job

`.github/workflows/workflows-as-code-demo.yml` was written against the repo's workflow
conventions: `workflow_dispatch` only, `timeout-minutes` on the job, the canonical concurrency
block, `permissions: contents: read`, both third-party actions pinned to a full commit SHA with a
version comment, and a sparse checkout of the prototype folder alone.

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
  no hogli), so the Actions file was checked by hand against the conventions, not by the linters.
- **Behavior of a rerun after someone edits the workflow in the UI.** `push()` overwrites with
  whatever the file says. Whether that is the right answer is a question for the spec map, not
  something this prototype settles.
