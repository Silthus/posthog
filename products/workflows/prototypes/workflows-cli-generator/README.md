# The CLI as a generator over workflow files

Throwaway prototype for [issue #71](https://github.com/Silthus/posthog/issues/71), on map [#68](https://github.com/Silthus/posthog/issues/68).
It answers one question: what does it feel like when the workflow file is a definition the CLI loads, and not a program the user runs?

The earlier prototype is in `../workflows-as-code/`.
Read the two side by side. This one does not depend on it.

## What changed

The old prototype's file ends with `await run(onboarding)` under `import.meta.main`, and `--push` picks between print and push.
Here the file exports a workflow and stops.
The CLI loads the file, collects the exports, emits each definition, validates, compares against PostHog, and writes.

The authoring surface in `sdk/index.ts` has no `run()` and no `push()`.
A workflow file cannot do anything when you execute it, because there is nothing in it to execute.

## Run it

```bash
pnpm install --ignore-workspace
node dev/fake-posthog.mjs &        # a local stand-in for the hog_flows API
bash dev/record-transcript.sh      # every command, with the state after each one
```

One command on its own:

```bash
node bin/posthog-workflows.mjs check example/onboarding.workflow.ts
```

`check` works with no credentials.
It validates the file and says that it skipped the diff.

## The commands

| Command        | What it does                                          | Needs credentials              |
| -------------- | ----------------------------------------------------- | ------------------------------ |
| `check <file>` | Load, validate, and show what a push would change     | No. Skips the diff and says so |
| `push <file>`  | Create or update. Writes nothing when nothing changed | Yes                            |
| `diff <file>`  | Show what a push would change                         | Yes                            |

Flags: `--json` for a CI step, `--print` to dump the definition JSON, `--force` to push a rotated secret.

## The files

| File                        | What it holds                                           |
| --------------------------- | ------------------------------------------------------- |
| `bin/posthog-workflows.mjs` | The package bin. Plain JavaScript                       |
| `cli/load.ts`               | jiti loads the file, then the exports are collected     |
| `cli/main.ts`               | The three commands and what each prints                 |
| `cli/client.ts`             | Credentials and the hog_flows calls                     |
| `cli/diff.ts`               | The change list a reviewer reads                        |
| `sdk/`                      | The authoring surface. Lifted from the old prototype    |
| `example/`                  | One real workflow, plus the three ways a file can fail  |
| `dev/fake-posthog.mjs`      | The API stand-in. No request has reached a real PostHog |

`sdk/builder.ts`, `sdk/validate.ts`, `sdk/normalize.ts`, `sdk/types.ts` and `sdk/errors.ts` come from the old prototype.
The changes are the two brands the loader reads, the removed id write-back, and the secret exclusion in the diff.

## What it writes into your repository

Nothing.
`EVIDENCE.md` records the working tree after each of twelve commands.
jiti caches transpiled output under `node_modules/.cache/jiti`, which no one commits.

## What it does not do

It does not type check, and it has no tsconfig preset.
Your own `tsc` catches a type error.

It does not write an id back into the source file.
Identity is the workflow name until [#72](https://github.com/Silthus/posthog/issues/72) decides.

It covers one trigger kind and four action types, the same set as the old prototype.
