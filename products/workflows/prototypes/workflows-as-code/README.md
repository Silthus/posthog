# Workflows as code (prototype)

**This is a throwaway prototype.** It exists to answer one question, on the branch
`prototype/workflows-as-code`, and nothing here merges to master. It is not part of the pnpm
workspace, it is not packaged, and it touches no code in the workflows product.

The `/prototype` skill offers two shapes, a single-file logic demo and a set of UI variants.
Neither fits an SDK, so this follows the skill's shared rules instead (throwaway and named as
such, one command to run, no persistence, no polish, the state printed after every action) and
takes its artifact from the ticket: an SDK, an example workflow file, and a CI job.

## The question

Does the loop feel right when it is real? A typed `*.workflow.ts` file that, when you run it,
emits a workflow definition and pushes it to a PostHog project, from a laptop and from CI.

## The two commands

```bash
# Print the definition JSON. No credentials needed.
bun run example/onboarding.workflow.ts

# Create or update the workflow in PostHog.
bun run example/onboarding.workflow.ts --push
```

## Environment

`--push` reads three variables:

| Variable             | What it is                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `POSTHOG_API_KEY`    | A personal API key (`phx_…`) with the `hog_flow:write` scope.     |
| `POSTHOG_HOST`       | Your PostHog URL, for example `https://us.posthog.com`.           |
| `POSTHOG_PROJECT_ID` | The project id from your PostHog URL.                             |

Project secret keys (`phs_…`) are rejected: the workflows API does not accept them. The same
three names are repository secrets for the `Workflows as code demo (prototype)` Actions job,
which runs the same file with `--push`.

## Identity

A new workflow file has no `id`. The first `--push` creates the workflow and writes the id
PostHog returned back into the `workflow({ ... })` call of the file that was run:

```ts
export const onboarding = workflow({
    id: '0199c0de-0000-0000-0000-000000000001',
    name: 'Onboarding nudge (workflows as code)',
})
```

Commit that line. From then on the file owns that workflow: push goes straight to it by id and
the name is only a name, so renaming the workflow is an ordinary edit rather than a new
workflow. The CI job commits the same line back to the branch it ran on.

Every run after the first fetches the workflow and compares it with what the file describes,
field by field, ignoring everything the server owns. It prints one of three things:

| Output      | What happened                                                        |
| ----------- | -------------------------------------------------------------------- |
| `created`   | There was no workflow yet. The id was written into the file.          |
| `unchanged` | PostHog already matches the file. No request was made to change it.   |
| `updated`   | The file differs, so the whole definition was sent. The version moved. |

If the id in the file points at a workflow that no longer exists, the push stops and tells you
the two ways out: delete the `id` line to create a new workflow, or restore the old one.

## The demo story

`example/onboarding.workflow.ts` is the whole program. It describes a workflow that starts when
someone signs up, waits a day, checks whether that person is on a paid plan, and calls a webhook
for the ones who are. Running the file prints the definition. Running it with `--push` looks the
workflow up by id, creates it the first time, and after that writes only when the file and
PostHog disagree. It prints the id, the version, and a link to open the workflow in PostHog. The CI job runs the same file, so the workflow in PostHog is
whatever the file on the branch says it is. Pushed workflows land as drafts, so a demo run never
starts sending live traffic.

## What is in here

- `sdk/`: types, the builder, structural validation, the id write-back, the normalizer that
  change detection compares with, and `push()`. Around 1000 lines, no runtime dependencies.
- `example/onboarding.workflow.ts`: the workflow file, and the program.
- `dev/`: a fake hog_flows endpoint and the scripts that produced `EVIDENCE.md`. Not part of the
  SDK.
- `EVIDENCE.md`: what was verified here, and what was not.
