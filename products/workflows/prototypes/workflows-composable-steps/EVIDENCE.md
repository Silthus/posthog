# Evidence

What ran, what it printed, and what it settles. Every output block below is real
output from this directory, not a transcription.

- Branch: `prototype/workflows-composable-steps`, cut from `prototype/workflows-as-code`.
- Runner: `bun 1.4.2`. Type checker: the `typescript` that `bunx tsc` resolved in this directory.
- Source read, not merged: `sdk/builder.ts` and `sdk/types.ts` on `prototype/workflows-as-code`.
- The v1 surface is the one locked by [#69](https://github.com/Silthus/posthog/issues/69).

Commands:

```bash
bun run dev/run-all.ts
bunx tsc --noEmit
cd dev/breakages && bunx tsc --noEmit -p .
```

One note for anyone who reruns this: `dev/run-all.ts` prints through
`process.stdout.write`, because the repository pre-commit formatter deletes a
`console.log` call and left the first version of the runner silent.

`bun run dev/run-all.ts` exits 0. `bunx tsc --noEmit` exits 0 over `sdk`, `example` and
`dev`. The breakages project exits 1, which is the result it must give.

## The workflow under test

One workflow, three shapes. An event trigger, a day of delay, a two-way branch on the
person's plan, and one webhook step placed in both branch paths:

- `notifyCrm`, a `template-webhook` step with `signingSecret: secret('CRM_TOKEN')`. Placed twice.
- `welcomeEmail`, a typed `.email()` step with inline content. Placed once.
- `waitThenNotify`, a sub-path value of `delay('2d')` then `notifyCrm`. Placed once.

## 1. Step values against chain methods

A step is a frozen value with a name and a config, and with no id and no position
(`sdk/steps.ts`). A chain method in shape A is a thin wrapper that calls the same
constructor and pushes the value. So the two are not rival designs: the value is the
model, and a chain method is sugar for "construct it here".

**A reused step value becomes two nodes with two ids and one definition in the source.**
Section 5 of the run prints every step value and the ids it produced:

```text
delay    "Wait a day"                       -> ["delay_1"]
branch   "Which plan?"                      -> ["branch_1"]
email    "Welcome the paid customer"        -> ["email_1"]
function "Tell the CRM to follow up"        -> ["function_1","function_2"]
delay    "Give the free plan two days"      -> ["delay_2"]
```

**Edges derive from placement, never from the value.** The compiler walks a path, takes
the id of the next placement as the `continue` target, and for a branch emits one
`branch` edge per condition using the array index it is already iterating
(`sdk/compile.ts`, `compilePath`). Nothing an author writes names an id or an index.

**The id of a reused step is the open question, not its node count.** Two id strategies
are implemented so the cost is visible. `positional` counts per kind in placement order,
as the first prototype did. `slug` derives from the step name. Section 9 inserts one
delay at the front of a graph that already has a delay:

```text
before the insert, positional ["trigger_node","delay_1","branch_1","email_1","function_1","exit_node"]
after the insert,  positional  ["trigger_node","delay_1","delay_2","branch_1","email_1","function_1","exit_node"]
after the insert,  slug        ["trigger_node","new_first_delay","wait_a_day","which_plan","welcome_the_paid_customer","tell_the_crm_to_follow_up","exit_node"]
```

Under `positional`, the pre-existing delay moves from `delay_1` to `delay_2`. Every id
after it shifts too. Under `slug`, only the new node gets a new id.

**This matters beyond tidiness.** Secret recovery on the server is keyed by action id
([#73](https://github.com/Silthus/posthog/issues/73)), and revisions bump on any content
change, so churning ids on an unrelated edit rewrites half the definition. Decision 15
on #69 removes the secret hazard, because a secret is always sent and the server never
takes its recovery path. The revision noise stays. Identity is
[#72](https://github.com/Silthus/posthog/issues/72)'s call; this prototype only shows
that a stable id needs a name the author controls.

## 2. Composition of a sub-path

A sub-path is **a value**, and its type is a non-empty tuple:

```ts
export type Path = readonly [Step, ...Step[]]
export const waitThenNotify: Path = path(delay('2d', { name: 'Give the free plan two days' }), notifyCrm)
```

Not a function that takes a chain, and not a loose array.

- A function taking a chain (what `prototype/workflows-as-code` used: `then: (path) => path.webhook(...)`)
  makes a sub-path unnameable without also naming the function, and a caller cannot inspect it.
  It also pushed "this branch is empty" to a runtime error.
- A loose `readonly Step[]` accepts `[]`. An empty branch path emits a branch edge aimed
  at the no-match target, which is the same graph with more edges. The first prototype
  threw a `WorkflowError` for this. The tuple makes it a compile error instead
  (`dev/breakages/empty-branch-path.ts`).

A `Path` composes with spread, so a longer path built from shorter ones costs nothing:
`path(delay('1h'), ...waitThenNotify)`.

## 3. Where the chain survives

The chain survives exactly where order is the information: the **linear spine**. It buys
nothing anywhere else, and all three shapes are declarative for the rest.

| Part of the graph | Shape A            | Shape B            | Shape C            |
| ----------------- | ------------------ | ------------------ | ------------------ |
| Trigger           | `.on(...)`         | `on:` field        | `on:` field        |
| Linear spine      | chained calls      | array order        | array order        |
| Branch            | declarative object | declarative object | declarative object |
| Branch sub-path   | `Path` value       | `Path` value       | array of keys      |
| Exit              | `.exit()`          | `exit:` field      | `exit:` field      |

Shape A's `.exit()` earns its place in one way the field does not: it is the only method
that returns a `Workflow`, so an unterminated graph has no `emit` at all. Shape B gets the
same guarantee from a required field. Both are pinned in
`dev/breakages/exit-is-not-optional.ts`:

```text
exit-is-not-optional.ts(9,6): error TS2339: Property 'emit' does not exist on type 'Chain'.
exit-is-not-optional.ts(11,35): error TS2741: Property 'exit' is missing in type '{ name: string; on: TriggerConfig; steps: Path; }' but required in type 'DeclarativeOptions'.
```

## 4. Type safety under reuse

Every rule the first prototype enforced at the type level survives, and the branch-index
rule gets stronger. `dev/breakages/` is the proof; the whole output of
`bunx tsc --noEmit -p .` in that directory is at the end of this file.

| Rule                                  | Survives reuse | Fixture                            |
| ------------------------------------- | -------------- | ---------------------------------- |
| `Duration` template literal           | Yes            | `duration-under-reuse.ts`          |
| Branch needs at least one condition   | Yes            | `no-condition-and-no-index.ts`     |
| Branch index cannot be authored       | Stronger       | `no-condition-and-no-index.ts`     |
| Branch path cannot be empty           | New            | `empty-branch-path.ts`             |
| Email refuses `template_uuid`         | Yes            | `email-refuses-a-template-uuid.ts` |
| A graph must terminate                | Yes            | `exit-is-not-optional.ts`          |
| A placement must name a declared step | Shape C only   | `keyed-unknown-key.ts`             |

Two of these deserve a note.

**The branch index rule gets stronger, not weaker.** The concern was that turning steps
into values would let an index and its edge drift apart. The opposite happened: there is
no `index` anywhere in the authoring surface, so there is nothing to drift. The compiler
derives the index and the edge from the same array position in one statement
(`sdk/compile.ts`). Writing an index is a compile error:

```text
no-condition-and-no-index.ts(14,100): error TS2353: Object literal may only specify known properties, and 'index' does not exist in type 'BranchSpec'.
```

**The duration rule is unaffected by reuse**, because it is a parameter type on a
function, and a `const` holding the result does not weaken it:

```text
duration-under-reuse.ts(6,33): error TS2345: Argument of type '"soon"' is not assignable to parameter of type 'Duration'.
```

Shape C's key checking works but its errors read badly. A mistyped key inside a branch
path produces a ten-line structural mismatch before it reaches the useful last line
(`Type '"notifyCrm"' is not assignable ... Did you mean '"notify_crm"'?`). Shapes A and B
have no keys, so they have no such error.

## 5. Where `secret()` sits in a reused step

On the step value, once:

```ts
export const notifyCrm: Step = webhook({
  name: 'Tell the CRM to follow up',
  url: 'https://example.com/hooks/onboarding',
  body: { distinct_id: '{event.distinct_id}', plan: '{person.properties.plan}' },
  signingSecret: secret('CRM_TOKEN'),
})
```

This is option 2 from [#73](https://github.com/Silthus/posthog/issues/73), as locked by
decision 15. `secret('CRM_TOKEN')` is a sentinel value in the inputs, resolved at emit
from the deployer's environment (`resolveInputs` in `sdk/compile.ts`). Reuse needs no new
mechanism: the name is on the value, so both placements resolve from the same variable
and both carry the value.

```text
function_1: signing_secret = { "value": "placeholder-signing-secret" }
function_2: signing_secret = { "value": "placeholder-signing-secret" }
```

The value above is a literal placeholder set by `dev/run-all.ts`. No real credential is
in this repository.

An unset variable fails before anything reaches the wire, with the four-field error
contract:

```text
status: missing_secret
message: The environment variable CRM_TOKEN is not set.
why: Step "Tell the CRM to follow up" names it for the secret input "signing_secret", and a secret is always sent rather than recovered from the server, so push has nothing to send.
fix: Set CRM_TOKEN in the environment that runs push, then push again.
```

Two consequences of reuse the implement ticket should carry:

1. **One name, several action ids.** The server stores the encrypted map as
   `{action_id: {input_key: value}}`, so a step placed twice writes the same secret under
   two ids. Nothing needs to know they came from one source line, because the value is
   always sent.
2. **The escape hatch takes the same rule and needs no extra code.** `webhook()` is sugar
   over `fn()`, and `resolveInputs` walks whatever inputs a `fn()` step carries, so
   `fn({ templateId: 'template-hubspot', inputs: { access_token: secret('HUBSPOT_TOKEN') } })`
   resolves through the same path. That is one mechanism, as decision 15 requires.

## 6. Round trip: definition to source to definition

`sdk/generate.ts` walks a definition from its trigger and prints shape B source.
`dev/run-all.ts` writes that source to `dev/generated.workflow.ts`, imports it, emits it
again, and diffs the two definitions. The diff is empty:

```text
diff against the definition it was generated from:
(identical)
```

So a generator can target the shape, and frame item 9 on spec map
[#28](https://github.com/Silthus/posthog/issues/28) is satisfied. Three qualifications
that belong in that ticket rather than here:

1. **A generator flattens reuse.** The definition holds two webhook nodes and no memory
   of the `const`, so the generated source has two `fn({...})` literals. Recovering the
   `const` means matching nodes by value, which is a nicety and not a constraint.
2. **A generator cannot recover a secret name.** A read returns `{"secret": true}`, and
   even the value we sent is a value rather than a variable name. Generated source has to
   emit a placeholder for a person to fill in. This is the same fact that forces the
   diff to exclude secret keys.
3. **Shape B is the easy target and shape A is the harder one.** Shape B is an array, so a
   graph walk maps onto it one step at a time. Shape A needs the walk to become a call
   sequence, which is mechanical but more code. Shape C needs the generator to invent a
   key per node, most likely a slug of the name, which is exactly the `slug` id strategy
   in reverse.

## 7. The shapes emit the same definition

Shape A and shape B are byte identical:

```text
2. Shape A vs shape B (declarative record)
(identical)
```

Shape C differs **only in action ids and in the edges that carry them**, because the key
becomes the id. Every name, type and config is the same. The whole diff:

```text
- A:29       "id": "delay_1",
+ C:29       "id": "wait_a_day",
- A:77       "id": "email_1",
+ C:77       "id": "welcome_email",
- A:98       "id": "function_1",
+ C:98       "id": "notify_crm",
- A:123       "id": "delay_2",
+ C:123       "id": "free_plan_delay",
- A:131       "id": "function_2",
+ C:131       "id": "notify_crm_2",
- A:167       "to": "delay_1",
+ C:167       "to": "wait_a_day",
- A:171       "from": "delay_1",
+ C:171       "from": "wait_a_day",
- A:181       "from": "email_1",
+ C:181       "from": "welcome_email",
- A:182       "to": "function_1",
+ C:182       "to": "notify_crm",
- A:186       "from": "function_1",
+ C:186       "from": "notify_crm",
- A:192       "to": "email_1",
+ C:192       "to": "welcome_email",
- A:197       "from": "delay_2",
+ C:197       "from": "free_plan_delay",
- A:198       "to": "function_2",
+ C:198       "to": "notify_crm_2",
- A:202       "from": "function_2",
+ C:202       "from": "notify_crm_2",
- A:208       "to": "delay_2",
+ C:208       "to": "free_plan_delay",
```

Note the second placement of the same key: `notify_crm` and then `notify_crm_2`. A key
names a step, not a node, so a second placement still needs a suffix.

**Why this matters more than any ergonomic argument.** One compiler serves all three
shapes, and the shapes hold no emit logic at all. So the authoring shape is a reversible
decision. Changing it later costs a facade and a customer's source file, not the
compiler, the validator, the diff or the push path.

## What is not verified here

- No request reached a real PostHog. The definitions above are validated against the
  schema doc and the serializer by reading, exactly as the first prototype was.
- The email step's `from` is left empty, so the server resolves the team's verified sender.
  A workflow with an explicit `fromIntegrationId` is not exercised.
- `status` stays `draft` throughout, and no shape was tested with `active`.
- `onSchedule()` is implemented and type checked but no example uses it, so the emitted
  schedule trigger config has not been diffed against a stored one.
- Shape C's key-to-id mapping is prototype behavior, not a decision. It shows what a
  stable id would look like; [#72](https://github.com/Silthus/posthog/issues/72) owns
  whether ids come from the source at all.

## Appendix: the breakages output in full

```text
duration-under-reuse.ts(6,33): error TS2345: Argument of type '"soon"' is not assignable to parameter of type 'Duration'.
email-refuses-a-template-uuid.ts(12,5): error TS2353: Object literal may only specify known properties, and 'template_uuid' does not exist in type '{ name: string; to: string; subject: string; text: string; html: string; preheader?: string | undefined; fromIntegrationId?: number | undefined; }'.
empty-branch-path.ts(6,14): error TS2322: Type '[]' is not assignable to type 'Path'.
  Source has 0 element(s) but target requires 1.
empty-branch-path.ts(10,79): error TS2322: Type '[]' is not assignable to type 'Path'.
  Source has 0 element(s) but target requires 1.
exit-is-not-optional.ts(9,6): error TS2339: Property 'emit' does not exist on type 'Chain'.
exit-is-not-optional.ts(11,35): error TS2741: Property 'exit' is missing in type '{ name: string; on: TriggerConfig; steps: Path; }' but required in type 'DeclarativeOptions'.
keyed-unknown-key.ts(11,5): error TS2322: Type '["wait_a_day", { branch: { name: string; branches: [{ name: string; when: [PropertyCondition]; then: ["notifyCrm"]; }]; }; }]' is not assignable to type 'readonly [Placement<{ wait_a_day: Step; notify_crm: Step; }>, ...Placement<{ wait_a_day: Step; notify_crm: Step; }>[]]'.
  Type at position 1 in source is not compatible with type at position 1 in target.
    Type '{ branch: { name: string; branches: [{ name: string; when: [PropertyCondition]; then: ["notifyCrm"]; }]; }; }' is not assignable to type 'Placement<{ wait_a_day: Step; notify_crm: Step; }>'.
      The types of 'branch.branches' are incompatible between these types.
        Type '[{ name: string; when: [PropertyCondition]; then: ["notifyCrm"]; }]' is not assignable to type 'readonly [KeyedBranchSpec<"notify_crm" | "wait_a_day">, ...KeyedBranchSpec<"notify_crm" | "wait_a_day">[]]'.
          Type at position 0 in source is not compatible with type at position 0 in target.
            Type '{ name: string; when: [PropertyCondition]; then: ["notifyCrm"]; }' is not assignable to type 'KeyedBranchSpec<"notify_crm" | "wait_a_day">'.
              Types of property 'then' are incompatible.
                Type '["notifyCrm"]' is not assignable to type 'readonly ["notify_crm" | "wait_a_day", ...("notify_crm" | "wait_a_day")[]]'.
                  Type at position 0 in source is not compatible with type at position 0 in target.
                    Type '"notifyCrm"' is not assignable to type '"notify_crm" | "wait_a_day"'. Did you mean '"notify_crm"'?
no-condition-and-no-index.ts(9,37): error TS2322: Type '[]' is not assignable to type 'Conditions'.
  Source has 0 element(s) but target requires 1.
no-condition-and-no-index.ts(14,100): error TS2353: Object literal may only specify known properties, and 'index' does not exist in type 'BranchSpec'.
```
