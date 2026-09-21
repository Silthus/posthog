# Composable steps prototype

Throwaway code. It answers one question, from [issue #74](https://github.com/Silthus/posthog/issues/74):
how does a person define a step once and reuse it, and what does that do to the fluent builder?

Nothing here ships. The package that ships is built fresh.

## What is here

The same onboarding workflow, written three ways, over one compiler.

| Path                                | What it holds                                                            |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `sdk/steps.ts`                      | Step values. A step has a name and a config, but no id and no position.  |
| `sdk/compile.ts`                    | The one compiler. It derives every action id and every edge.             |
| `sdk/shapes.ts`                     | The three authoring shapes. Each one only produces step values.          |
| `sdk/generate.ts`                   | A definition to source generator, for the round-trip check.              |
| `example/shared.ts`                 | The step values the three examples reuse.                                |
| `example/a-chain.workflow.ts`       | Shape A. A chain for the linear path, `.add()` for a step defined apart. |
| `example/b-declarative.workflow.ts` | Shape B. One record: a trigger, an array of steps, an exit.              |
| `example/c-keyed.workflow.ts`       | Shape C. A registry of named steps, and a flow that places them by key.  |
| `dev/run-all.ts`                    | Emits all three, diffs them, and runs the round trip.                    |
| `dev/breakages/`                    | Files that must not compile. Each one pins a type rule.                  |
| `EVIDENCE.md`                       | Every command, its real output, and what it settles.                     |

## How to run it

```bash
cd products/workflows/prototypes/workflows-composable-steps
bun install
bun run dev/run-all.ts                 # emits, diffs, round trip
bunx tsc --noEmit                      # the prototype must compile
cd dev/breakages && bunx tsc --noEmit -p .   # these must NOT compile
```

`bun` is the runner because this is throwaway. The loader for the shipped package is
`jiti`, and that decision belongs to the CLI ticket.

## The short answer

- A step is a value. The same value placed twice makes two action nodes with two ids,
  one definition in the source.
- A sub-path is a value too: a non-empty tuple of steps, not a callback.
- The chain survives only for the linear path. Branches and the exit are declarative in
  all three shapes.
- Every type rule survives reuse, and the branch index rule gets stronger, because no
  shape lets an author write an index at all.
- A `secret('CRM_TOKEN')` reference sits on the step value, so a reused step names the
  variable once and both copies carry the resolved value.
- A `definition -> source -> definition` round trip is byte identical for shape B.

`EVIDENCE.md` holds the output that backs each of these.
