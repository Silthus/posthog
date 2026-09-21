# Evidence

What this prototype ran, what it showed, and what is still unverified.
Recorded on 2026-09-21, Node v24.13.0, jiti 2.7.0, macOS arm64.

**No request in this file reached a real PostHog.** Every exchange went to `dev/fake-posthog.mjs`, a
local `node:http` stand-in for `/api/projects/{id}/hog_flows/` that copies four behaviors of the real
serializer: the reply carries read-only fields the client never sent, actions come back with the
`HogFlowActionSerializer` defaults, `version` moves only when the stored content changed, and a
secret-typed input reads back as `{"secret": true}` rather than its value. Credentials in the
transcript are for that stub. `phx_localstub_not_a_real_key` is not a key.

## What the transcript settles

### 1. Loading. jiti evaluates the file in place, and there is no transpile step

`cli/load.ts` calls `createJiti(import.meta.url).import(absolutePath)`. That is the whole loader.
No build, no temporary directory in the user's tree, no generated file. jiti cached five modules under
`node_modules/.cache/jiti/`, which nobody commits:

```text
node_modules/.cache/jiti/example-onboarding.workflow.2c21078e.mjs
node_modules/.cache/jiti/sdk-builder.81ce0b70.mjs
node_modules/.cache/jiti/sdk-secret.e18fd7ff.mjs
node_modules/.cache/jiti/sdk-index.92636143.mjs
node_modules/.cache/jiti/sdk-errors.b284333c.mjs
```

The install is one package with no transitive dependencies and no platform binary:

```text
dependencies:
+ jiti 2.7.0
```

### 2. The file is a definition. Running it does nothing

```console
$ node node_modules/jiti/lib/jiti-cli.mjs example/onboarding.workflow.ts
exit=0
```

No output, no request, no exit code. The old prototype's same file printed a definition or pushed it.

`sdk/index.ts` exports the builder and `secret()`, and nothing else. There is no `run()` to call and no
`push()` to import, so a user cannot write a file that executes itself even by accident.

### 3. A file that exports two workflows, or none

Two workflows in one file is allowed, and the CLI handles both. The alternative, one workflow per file
enforced by a refusal, buys nothing: a push per workflow is the same work either way, and the refusal
would be a convention with no reason behind it.

```console
$ node bin/posthog-workflows.mjs push example/two-workflows.workflow.ts
example/two-workflows.workflow.ts
  trialNudge -> "Trial nudge"
    ...
    result   created
  winback -> "Winback"
    ...
    result   created
pushed 2 workflow(s): 2 created, 0 updated, 0 unchanged.
```

None is a hard failure, and the message names the likely cause rather than the symptom:

```console
$ node bin/posthog-workflows.mjs check example/nothing.workflow.ts
status: no_workflows
message: example/nothing.workflow.ts exports no workflow.
why: The CLI reads the file for exported workflows and found none. An unexported const is invisible, and so is a workflow built inside a function that nothing calls.
fix: Export the workflow from example/nothing.workflow.ts: export const myWorkflow = workflow({ ... }).on(...).exit('done').
exit=1
```

There is a third case that only appears once the file is a definition, and it is the one that would
have cost a user an afternoon. A chain that was exported before `.exit()` closed it is not a workflow,
so without help the CLI would report the file as exporting nothing and send the reader looking for a
missing `export`. `sdk/builder.ts` therefore brands an open chain `workflow_draft`:

```console
$ node bin/posthog-workflows.mjs check example/unfinished.workflow.ts
status: unfinished_workflow
message: example/unfinished.workflow.ts exports "halfBuilt" without an exit step.
why: A workflow is only a workflow once .exit() closes the graph. Until then it is a half-built chain, and the runtime would have nowhere to send a run that reaches the end.
fix: Add .exit('<reason>') to the end of halfBuilt in example/unfinished.workflow.ts.
exit=1
```

Two workflows in one file that carry the same `name` is also refused, because identity is the name
until [#72](https://github.com/Silthus/posthog/issues/72) decides. Both would claim the same row.
That path is implemented in `cli/load.ts` and is **not** in the transcript.

### 4. What `check` does with no credentials: it degrades and says so, exit 0

This is the sub-question [#69](https://github.com/Silthus/posthog/issues/69) handed to this ticket.
The call is to degrade, and it is not a taste question. A pull request from a fork cannot read
repository secrets, so a `check` that failed without credentials would fail every fork contribution
for a reason the contributor cannot fix. Exit 0 is part of the answer: a non-zero exit is a red check
on the pull request, which is the same failure wearing a different hat.

```console
$ node bin/posthog-workflows.mjs check example/onboarding.workflow.ts   # no credentials
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    diff     not compared
1 workflow(s), all valid.
diff skipped: no PostHog credentials in this environment, so the file was validated offline.
Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID to compare against a project.
exit=0
```

The output says which half ran. The last two lines are what stops "valid, no diff" from reading as
"no changes". `diff` takes the opposite line and refuses, because a diff with nothing to compare
against has no degraded mode to fall back to:

```text
status: missing_config
message: diff needs credentials.
why: A diff compares the file against a project, so there is nothing for it to do offline. check is the command that degrades.
fix: Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID, or run check instead.
```

### 5. `push` when nothing changed writes nothing, and says so

```console
$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # again, nothing changed
    result   unchanged
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  1
pushed 1 workflow(s): 0 created, 0 updated, 1 unchanged.
exit=0
```

`version` stayed at 1 across the second push, so no revision was created. The stub only bumps `version`
when the stored content changed, which is what the real `_stage_revision_bump` does.

### 6. Drift, and what the diff prints

Someone activates the workflow in the PostHog UI. `diff` names the field and both values:

```console
$ node bin/posthog-workflows.mjs diff example/onboarding.workflow.ts   # after the drift
    result   would update
             ~ status: active -> draft
    version  2
1 workflow(s), all valid. 0 would be created, 1 would be updated, 0 unchanged.
```

The next push wins, which is the map's stated rule, and the stored `status` went back to `draft`.

Steps are keyed by name in the change list, not by the generated id. An id is positional (`delay_1`),
so inserting one step would otherwise renumber every id after it and read as a rewrite of the graph.

### 7. Secrets: excluded from the diff, so a rotation needs `--force`

Rotating `ONBOARDING_WEBHOOK_SECRET` alone reports `unchanged` and writes nothing:

```console
$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # rotated secret only
    result   unchanged
pushed 1 workflow(s): 0 created, 0 updated, 1 unchanged.
```

`--force` lands it. The stub's stored secret length moved from 19 to 27 characters:

```console
$ node bin/posthog-workflows.mjs push --force example/onboarding.workflow.ts   # rotation lands
    result   updated
    version  2
```

```json
{ "webhook_1": { "signing_secret": "len=27" } }
```

`version` stayed at 2 through the forced push. That is a consequence nobody named in #69: the secret is
stripped out of the content the server stores, so a rotation-only push bumps no revision. A rotation is
therefore invisible in the revision history, which matters to [#77](https://github.com/Silthus/posthog/issues/77).

### 8. A bug this transcript found, and the fix

The first recording had `push` resolve secrets at the moment it wrote. A push whose diff was empty never
reached the write, so with `ONBOARDING_WEBHOOK_SECRET` unset it printed `unchanged` and exited 0 — the
exact silent success the locked decision forbids. `cli/main.ts` now resolves before the diff:

```console
$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # the secret is not set
status: missing_secret
message: ONBOARDING_WEBHOOK_SECRET is not set.
why: The workflow names it with secret('ONBOARDING_WEBHOOK_SECRET'), and push always sends the resolved value rather than relying on what PostHog already stores.
fix: Set ONBOARDING_WEBHOOK_SECRET in the environment that runs push. In GitHub Actions add it under env: from a repository secret.
exit=1
```

The general rule it implies: anything a push must fail on has to be checked before the change detection,
because change detection is a short circuit that skips everything after it.

### 9. Generated files: none, and the Convex model does not transfer

Twelve state checks in the transcript print the working tree as a delta against the state before the
first command. Every one is empty. No command wrote a file into the repository.

Convex commits `_generated/` because `npx convex dev` generates a typed client from your schema: the
types depend on code you wrote, so they cannot ship inside the package. Nothing here has that shape.
The authoring types come from the package's own `.d.ts`, the ids are the server's and are not written
back, and a manifest of ids would only restate what the source already says.

The one candidate is types for template inputs, which the SDK cannot see today. Those are generated
from the **project's** templates, not from the user's code, so they belong in the installed package or
in a `postinstall`, not in a committed directory. That decision belongs to spec map
[#30](https://github.com/Silthus/posthog/issues/30). Until then: the CLI generates nothing, and there is
no directory for a user to gitignore, commit, or wonder about.

### 10. What CI reads

`--json` on any command. A CI step branches on `ok` and `offline` before it reads anything else:

```json
{
  "command": "check",
  "file": "example/two-workflows.workflow.ts",
  "ok": true,
  "offline": false,
  "workflows": [ ... ]
}
```

### 11. `diff` is `check` with less in it

The transcript shows the two commands printing the same block for the same workflow. `diff` differs in
exactly two ways: it refuses without credentials, and it never writes. `check` already never writes.
So `diff` is `check` minus the offline path, which makes it a second name for a worse version of the
same command. The recommendation is to ship `check` and `push` only. Adding `diff` later costs nothing.

## The same workflow, both models

Old, `../workflows-as-code/example/onboarding.workflow.ts`:

```ts
import { onEvent, person, run, workflow } from '../sdk'

export const onboarding = workflow({
  name: 'Onboarding nudge (workflows as code)',
  description: 'Prototype workflow, authored in TypeScript and pushed from CI.',
})
  .on(onEvent({ event: 'user signed up' }))
  .delay('1d', { name: 'Wait a day' })
  .branch({
    name: 'On a paid plan?',
    branches: [
      {
        name: 'Paid plan',
        when: [person('plan', 'exact', ['pro', 'enterprise'])],
        then: (path) =>
          path.webhook({
            name: 'Tell the CRM to follow up',
            url: 'https://example.com/hooks/onboarding',
            body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
          }),
      },
    ],
  })
  .exit('Onboarding nudge finished')

if (import.meta.main) {
  await run(onboarding)
}
```

New, `example/onboarding.workflow.ts`:

```ts
import { onEvent, person, secret, workflow } from '../sdk'

export const onboarding = workflow({
  name: 'Onboarding nudge (workflows as code)',
  description: 'Prototype workflow, authored in TypeScript and pushed from CI.',
})
  .on(onEvent({ event: 'user signed up' }))
  .delay('1d', { name: 'Wait a day' })
  .branch({
    name: 'On a paid plan?',
    branches: [
      {
        name: 'Paid plan',
        when: [person('plan', 'exact', ['pro', 'enterprise'])],
        then: (path) =>
          path.webhook({
            name: 'Tell the CRM to follow up',
            url: 'https://example.com/hooks/onboarding',
            body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
            signingSecret: secret('ONBOARDING_WEBHOOK_SECRET'),
          }),
      },
    ],
  })
  .exit('Onboarding nudge finished')
```

The graph is identical. Three lines went, one arrived. What went: `run` from the import list, and the
`import.meta.main` block. What arrived: `signingSecret`, which is the locked secrets decision and not
part of this change.

The interesting part is not the four lines. It is that a reader of the new file has nothing to ask about
it. There is no `import.meta.main` to wonder about, no runtime to pick, no question of what happens if
someone runs the file, and no `--push` flag hidden inside a program. The file is a value. The verbs are
in the CLI, where `--help` can list them.

## Still unverified

- **No real PostHog.** Every claim about the API's reply shape is the stub's, not the serializer's. The
  live push is map #68's definition of done and is not retired here.
- **jiti against a real customer tsconfig.** The examples import `../sdk` relatively. Path aliases,
  `paths`, and a monorepo's nested tsconfig are untested. jiti was chosen partly because it reads
  tsconfig, and that claim rests on the research, not on a run here.
- **The duplicate-name refusal** is implemented and not exercised in the transcript.
- **A default export.** `cli/load.ts` treats `default` as one export name among others and the code path
  is shared, but no example file uses `export default`.
- **Two workflows where one is pushed and the other fails.** The loop has no transaction. It stops on the
  first failure with the earlier workflows already written.
- **Windows.** Path handling was not tested off macOS.

## Full transcript

Recorded by `dev/record-transcript.sh` against `dev/fake-posthog.mjs`. The working-tree state after
each command is printed as a delta against the tree before the first command, so a file any command
wrote would appear on its own.

```console

$ node bin/posthog-workflows.mjs check example/onboarding.workflow.ts   # no credentials
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    diff     not compared
1 workflow(s), all valid.
diff skipped: no PostHog credentials in this environment, so the file was validated offline.
Set POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID to compare against a project.
exit=0
--- state: project 2 ---
[]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs check example/onboarding.workflow.ts   # with credentials, nothing pushed yet
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   would create
1 workflow(s), all valid. 1 would be created, 0 would be updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   created
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  1
pushed 1 workflow(s): 1 created, 0 updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 1,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # again, nothing changed
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   unchanged
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  1
pushed 1 workflow(s): 0 created, 0 updated, 1 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 1,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs diff example/onboarding.workflow.ts
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   unchanged
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  1
1 workflow(s), all valid. 0 would be created, 0 would be updated, 1 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 1,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

# someone edits the workflow in the PostHog UI: activates it and renames a step
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "active",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs diff example/onboarding.workflow.ts   # after the drift
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   would update
             ~ status: active -> draft
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  2
1 workflow(s), all valid. 0 would be created, 1 would be updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "active",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # the next push wins
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   updated
             ~ status: active -> draft
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  2
pushed 1 workflow(s): 0 created, 1 updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # rotated secret only
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   unchanged
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  2
pushed 1 workflow(s): 0 created, 0 updated, 1 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=19"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push --force example/onboarding.workflow.ts   # rotation lands
example/onboarding.workflow.ts
  onboarding -> "Onboarding nudge (workflows as code)"
    status   draft
    steps    5 (trigger, delay, conditional_branch, function, exit)
    secret   webhook_1.signing_secret from $ONBOARDING_WEBHOOK_SECRET, resolved at push
    valid    ok
    result   updated
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000001
    version  2
pushed 1 workflow(s): 0 created, 1 updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=27"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/onboarding.workflow.ts   # the secret is not set
status: missing_secret
message: ONBOARDING_WEBHOOK_SECRET is not set.
why: The workflow names it with secret('ONBOARDING_WEBHOOK_SECRET'), and push always sends the resolved value rather than relying on what PostHog already stores.
fix: Set ONBOARDING_WEBHOOK_SECRET in the environment that runs push. In GitHub Actions add it under env: from a repository secret.
exit=1
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=27"
      }
    }
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs push example/two-workflows.workflow.ts   # two workflows in one file
example/two-workflows.workflow.ts
  trialNudge -> "Trial nudge"
    status   draft
    steps    3 (trigger, delay, exit)
    valid    ok
    result   created
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000002
    version  1
  winback -> "Winback"
    status   draft
    steps    3 (trigger, delay, exit)
    valid    ok
    result   created
    url      http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000003
    version  1
pushed 2 workflow(s): 2 created, 0 updated, 0 unchanged.
compared against project 2 on http://localhost:8099 (credentials from the environment).
exit=0
--- state: project 2 ---
[
  {
    "id": "0199c0de-0000-0000-0000-000000000001",
    "name": "Onboarding nudge (workflows as code)",
    "version": 2,
    "status": "draft",
    "secrets": {
      "webhook_1": {
        "signing_secret": "len=27"
      }
    }
  },
  {
    "id": "0199c0de-0000-0000-0000-000000000002",
    "name": "Trial nudge",
    "version": 1,
    "status": "draft",
    "secrets": {}
  },
  {
    "id": "0199c0de-0000-0000-0000-000000000003",
    "name": "Winback",
    "version": 1,
    "status": "draft",
    "secrets": {}
  }
]
--- state: working tree, new since the first command ---
  (empty: the command wrote no file into the repository)

$ node bin/posthog-workflows.mjs check --json example/two-workflows.workflow.ts   # what CI reads
{
  "command": "check",
  "file": "example/two-workflows.workflow.ts",
  "ok": true,
  "offline": false,
  "workflows": [
    {
      "exportName": "trialNudge",
      "name": "Trial nudge",
      "status": "draft",
      "steps": [
        "trigger",
        "delay",
        "exit"
      ],
      "secrets": [],
      "valid": true,
      "problems": [],
      "warnings": [],
      "outcome": "unchanged",
      "changes": [],
      "id": "0199c0de-0000-0000-0000-000000000002",
      "url": "http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000002",
      "version": 1
    },
    {
      "exportName": "winback",
      "name": "Winback",
      "status": "draft",
      "steps": [
        "trigger",
        "delay",
        "exit"
      ],
      "secrets": [],
      "valid": true,
      "problems": [],
      "warnings": [],
      "outcome": "unchanged",
      "changes": [],
      "id": "0199c0de-0000-0000-0000-000000000003",
      "url": "http://localhost:8099/project/2/workflows/0199c0de-0000-0000-0000-000000000003",
      "version": 1
    }
  ]
}
exit=0

$ node bin/posthog-workflows.mjs check example/nothing.workflow.ts
status: no_workflows
message: example/nothing.workflow.ts exports no workflow.
why: The CLI reads the file for exported workflows and found none. An unexported const is invisible, and so is a workflow built inside a function that nothing calls.
fix: Export the workflow from example/nothing.workflow.ts: export const myWorkflow = workflow({ ... }).on(...).exit('done').
exit=1

$ node bin/posthog-workflows.mjs check example/unfinished.workflow.ts
status: unfinished_workflow
message: example/unfinished.workflow.ts exports "halfBuilt" without an exit step.
why: A workflow is only a workflow once .exit() closes the graph. Until then it is a half-built chain, and the runtime would have nowhere to send a run that reaches the end.
fix: Add .exit('<reason>') to the end of halfBuilt in example/unfinished.workflow.ts.
exit=1

$ node node_modules/jiti/lib/jiti-cli.mjs example/onboarding.workflow.ts   # the file as a program
exit=0

--- what jiti cached, and where ---
node_modules/.cache/jiti/example-onboarding.workflow.2c21078e.mjs
node_modules/.cache/jiti/sdk-builder.81ce0b70.mjs
node_modules/.cache/jiti/sdk-secret.e18fd7ff.mjs
node_modules/.cache/jiti/sdk-index.92636143.mjs
node_modules/.cache/jiti/sdk-errors.b284333c.mjs

--- working tree after every command ---
A  bin/posthog-workflows.mjs
A  cli/client.ts
A  cli/diff.ts
A  cli/load.ts
A  cli/main.ts
A  dev/fake-posthog.mjs
AM dev/record-transcript.sh
A  example/nothing.workflow.ts
A  example/onboarding.workflow.ts
A  example/two-workflows.workflow.ts
A  example/unfinished.workflow.ts
A  package.json
A  pnpm-lock.yaml
A  sdk/builder.ts
A  sdk/errors.ts
A  sdk/index.ts
A  sdk/normalize.ts
A  sdk/secret.ts
A  sdk/types.ts
A  sdk/validate.ts
A  tsconfig.json
(only the prototype source, which is what we wrote by hand)
```
