# A PostHog-owned workflow DSL instead of the `@posthog/workflows` npm SDK

This note answers [Silthus/posthog#167](https://github.com/Silthus/posthog/issues/167), part of map [#68](https://github.com/Silthus/posthog/issues/68).
The question: should workflows as code drop the npm SDK before anyone depends on it,
and use a PostHog-owned DSL instead?
In that design the server owns the schema, the API and the MCP server both serve it, and the Rust `posthog-cli` checks, pushes and pulls files.

Read on 2026-09-29. Sources and the commits they were read at:

- PostHog repository: `master` at `bbad9e7e3cd`. All `posthog` paths below are from that commit unless a PR is named.
  The workflows viewset moved to `products/workflows/backend/presentation/views/hog_flow.py` on 2026-09-29 (`d69478c6941`, #107597).
  Earlier tickets cite `products/workflows/backend/api/hog_flow.py` for the same code.
- The SDK and its CLI: [PostHog/posthog-js#5090](https://github.com/PostHog/posthog-js/pull/5090) at head `887e88a0`, path `packages/workflows/src/`.
- The reverse renderer: [PostHog/posthog#104452](https://github.com/PostHog/posthog/pull/104452) at `14ad61343c5`.
- The authoring skill: [PostHog/posthog#104313](https://github.com/PostHog/posthog/pull/104313) at `1af2608455a`.
- External docs and repositories: the URL is given at each claim.

Facts already established on #24, #25, #70 to #74, #97 and #110 are reused, not re-derived.
A claim that rests on my own reading rather than a source says "inference".

## Verdict

**Recommendation: a hybrid that is mostly Michael's hypothesis, with one correction.**
Drop the npm SDK before it ships, but do not invent a grammar.
Author workflows in **YAML**, validated against a **JSON Schema that the server generates** from one set of authoring models.
Put **both directions of the codec on the server**: the compiler (authoring document to definition) next to the reverse renderer that already exists in Python.
The Rust `posthog-cli` becomes a thin client, `workflows init | check | push | pull | schema`, built like the existing `exp endpoints` YAML commands.

The correction: "no package version to chase" holds only if the **server compiles** the file.
If the Rust CLI compiles, the npm version chase becomes a CLI version chase.

The reasons that decide it:

1. **The SDK is a hand-written copy of the schema, and it already lags.**
   `definition.ts` redeclares the definition types, and `steps.ts` types 6 of the 11 action types.
   The rest go through a loosely typed `step()`.
   `TriggerConfig` ends in a catch-all `{ type: string } & JsonObject` (`definition.ts:119-122`).
   Every new action type needs a posthog-js release and a customer upgrade.
   #24 counted six copies of the config shape already; the SDK is the seventh.
   Since 2026-09-24 the compiler (TypeScript, in posthog-js) and the renderer (Python, in posthog) live in two repositories, kept honest by copied golden fixtures.
2. **Everything else already built is format-agnostic or already server-side.**
   The `key` column, `managed_by`, the `source` provenance, the revisions and the project secret key do not care what the file looks like.
   The renderer is already Python in the viewset.
   The Rust CLI already manages endpoints as YAML with `push`, `pull` and `diff` (`cli/src/experimental/endpoints/`).
   It already pulls server-generated typed code (`exp schema pull`, `cli/src/experimental/schema.rs:376-380`).
   The DSL moves the compile half next to the render half and reuses the rest.
3. **YAML plus a served JSON Schema is the only candidate with mature parsers in both Rust and Python, schema-driven editor support, and broad agent familiarity.**
   HCL, CUE, Pkl, KCL, TOML, Starlark and a custom grammar each fail at least one of those three (section 2).
   The errors are precise when the schema dispatches on the step `type` with `if`/`then`.
   A plain `oneOf` gives one useless error per step (demo in section 2.2).

What the SDK does better, stated plainly:

- `tsc` gives in-editor type errors and JSDoc hover for free.
  A YAML file gets the same only with the Red Hat YAML extension, or by running `check`.
- `const notifyCrm = webhook(...)` reuse is natural in TypeScript (#74).
  YAML needs a `define` and `use` construct that the compiler checks.
- It is built, reviewed and proven end to end.
  The DSL route is roughly six PR-sized slices of new work (section 8), and it delays a customer release.

Keep the SDK instead if a customer-usable release in days matters more than the version chase.
The runner-up is the n8n shape: keep the TypeScript syntax, but the server parses it without running it and serves the type definitions (section 6).

## 1. Does a DSL beat the npm SDK? (question 1)

| Criterion                        | npm SDK (posthog-js#5090)                                                                                                                                                                                                                              | YAML DSL, server codec, Rust CLI                                                                                                                                                                                                                | Edge                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Human readability                | Reads well; constructor calls with named options (sample in section 3).                                                                                                                                                                                | Reads as well; one more line per option, no imports (section 3).                                                                                                                                                                                | Tie                              |
| Agent writability                | Agents write TypeScript fluently. They need `npm install`, Node 22.22+ and a `tsc` run, because the CLI loader does not type-check (skill on #104313, `SKILL.md:14-16`).                                                                               | Agents write YAML fluently. The schema comes from an MCP tool or `posthog-cli workflows schema`, and `check` prints located errors. No toolchain beyond one binary.                                                                             | DSL, slightly                    |
| Type safety                      | Compile-time, but only as good as the hand copy. Six of eleven action types typed, the other five and every non-event trigger loose. Real `tsc` output: `error TS2345: Argument of type '"3 days"' is not assignable to parameter of type 'Duration'.` | Server-side Pydantic validation is authoritative. JSON Schema covers shape in the editor and offline. Template inputs can be typed per project from `inputs_schema` (section 4.1), which the SDK cannot do (`fn` takes loose `FunctionInputs`). | DSL, once the models exist       |
| Versioning and the package chase | New action type or field: posthog-js release, customer bumps `@posthog/workflows`.                                                                                                                                                                     | New step kind: Django deploy. The file keeps its `version: 1`.                                                                                                                                                                                  | DSL, if compile is on the server |
| Language lock-in                 | Needs a Node and TypeScript toolchain in the customer's repository and CI.                                                                                                                                                                             | One static binary. `posthog-cli` already ships on npm through cargo-dist (#70), and by shell installer.                                                                                                                                         | DSL                              |
| Editor support                   | Best in class with no setup.                                                                                                                                                                                                                           | Completion, hover and validation with yaml-language-server and a `$schema` modeline. Needs the extension.                                                                                                                                       | SDK                              |
| Reuse and composition (#74)      | `const` values placed twice; typed tuples.                                                                                                                                                                                                             | A `define` map plus `- use: name`. JSON Schema checks the shape, the compiler checks the reference. The renderer already hoists repeats (`hoist_repeats`, `code_renderer.py:777`).                                                              | SDK, slightly                    |
| Secrets (#73)                    | `secret('ENV')`, resolved from the environment at push.                                                                                                                                                                                                | `{ secret: ENV }`, resolved by the CLI at push the same way. Same backend path, same caveats (#73).                                                                                                                                             | Tie                              |
| Identity (#72)                   | Required `key`, slug action ids from step names.                                                                                                                                                                                                       | Same rules, enforced by the server compiler.                                                                                                                                                                                                    | Tie                              |
| Round trip                       | Two languages: TypeScript compiler, Python renderer, fixtures copied across repositories.                                                                                                                                                              | One language, one repository: `compile(render(d)) == d` is a Python test.                                                                                                                                                                       | DSL                              |
| Static-only definitions          | The file is a program the CLI imports and runs (`jiti`). #71 wanted the opposite impression.                                                                                                                                                           | The file is data. Nothing runs.                                                                                                                                                                                                                 | DSL                              |

The map's destination is "static definitions only" (#68).
That removes the one thing only a programming language gives: generating workflows with loops and functions.

## 2. Which formats fit (question 2)

### 2.1 Comparison

Crate and package versions are from crates.io and PyPI on 2026-09-29.

| Format                        | Rust parser                                                                                                                                                                                                                                                                                                    | Python parser                                                                                               | Schema, and served from a URL?                                                                                                                           | Editor and LSP                                                                                                                                                                | What a wrong file shows                                                                                                                                                                    | Fit                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **TypeScript SDK** (baseline) | Not parsed; run with `jiti` in Node (#71)                                                                                                                                                                                                                                                                      | None; the renderer only writes it                                                                           | Types in the package; no                                                                                                                                 | `tsc`, any TS editor                                                                                                                                                          | `src/x.ts(7,23): error TS2345: Argument of type '"3 days"' is not assignable to parameter of type 'Duration'.` (run on #5090)                                                              | Works; version chase                                                              |
| **YAML + JSON Schema**        | `serde_yaml` is archived ([repo](https://github.com/dtolnay/serde-yaml)); maintained options `saphyr`, `serde-saphyr` 1.3.0, `yaml-rust2` 0.13.0. Validation: `jsonschema` 0.58.2, instance paths, drafts 4 to 2020-12, remote `$ref` via `reqwest` ([docs.rs](https://docs.rs/jsonschema/latest/jsonschema/)) | PyYAML 6.0.3, ruamel.yaml (keeps comments, [PyPI](https://pypi.org/project/ruamel.yaml/)), `jsonschema` 4.x | JSON Schema; yes, by modeline `# yaml-language-server: $schema=<url>` ([yaml-language-server](https://github.com/redhat-developer/yaml-language-server)) | yaml-language-server in VS Code, JetBrains, Neovim through [SchemaStore](https://www.schemastore.org/)                                                                        | `$.steps[0].duration: '3 days' does not match '^\d+(\.\d+)?[dhms]$'` (section 2.2)                                                                                                         | **Best**                                                                          |
| **HCL**                       | `hcl-rs` 0.19.8, `hcl-edit` 0.9.7; "There is no schema support yet" ([repo](https://github.com/martinohmann/hcl-rs))                                                                                                                                                                                           | `python-hcl2` 8.1.4 ([repo](https://github.com/amplify-education/python-hcl2))                              | No schema language outside Go `hcldec` ([pkg.go.dev](https://pkg.go.dev/github.com/hashicorp/hcl/v2/hcldec)); no                                         | Highlighting only ([vscode-hcl](https://github.com/hashicorp/vscode-hcl)); a schema-aware server means a Go LSP on `hcl-lang` ([repo](https://github.com/hashicorp/hcl-lang)) | Whatever the CLI prints; Terraform's shape is `Error: <summary>` / `on <file> line <N>` ([source](https://github.com/hashicorp/terraform/blob/main/internal/command/format/diagnostic.go)) | Weak: no schema, no editor                                                        |
| **CUE**                       | `cue-rs` 0.2.0, "unstable", needs Go 1.24 and cgo ([docs.rs](https://docs.rs/cue-rs/latest/cue_rs/))                                                                                                                                                                                                           | No released official binding ([cue-py](https://github.com/cue-lang/cue-py))                                 | CUE itself; `cue vet` reads JSON Schema ([docs](https://cuelang.org/docs/concept/how-cue-works-with-json-schema/))                                       | `cue lsp serve` since v0.15.0-alpha.1 ([wiki](https://github.com/cue-lang/cue/wiki/cue-lsp))                                                                                  | `conflicting values ["Charlie","Cartwright"] and strings.MinRunes(1)` (same docs)                                                                                                          | Heavy toolchain                                                                   |
| **Pkl**                       | `rpkl` 0.8.0, "Requires the pkl binary" ([repo](https://github.com/z-jxy/rpkl))                                                                                                                                                                                                                                | `pkl-python`, pre-release ([repo](https://github.com/jw-y/pkl-python))                                      | Pkl modules; yes, `https:` and `package://` imports ([reference](https://pkl-lang.org/main/current/language-reference/index.html))                       | `pkl-lsp` on the JVM ([repo](https://github.com/apple/pkl-lsp))                                                                                                               | `–– Pkl Error ––` then ``Type constraint `isBetween(0, 130)` violated.`` with a source frame ([blog](https://pkl-lang.org/blog/introducing-pkl.html))                                      | Heavy toolchain                                                                   |
| **KCL**                       | `kcl-lang` from git, in-process ([docs](https://www.kcl-lang.io/docs/reference/xlang-api/rust-api))                                                                                                                                                                                                            | `kcl-lib` 0.13.0 ([PyPI](https://pypi.org/project/kcl-lib/))                                                | KCL schemas; `kcl import -m jsonschema` ([docs](https://www.kcl-lang.io/docs/tools/cli/kcl/import))                                                      | `kcl-language-server`                                                                                                                                                         | Not found in docs                                                                                                                                                                          | Niche (CNCF sandbox, [cncf.io](https://www.cncf.io/projects/kcl/))                |
| **TOML**                      | `toml` 1.1.6                                                                                                                                                                                                                                                                                                   | `tomllib` (read), `tomli_w` (write)                                                                         | JSON Schema via Taplo `#:schema` ([docs](https://taplo.tamasfe.dev/configuration/directives.html))                                                       | Taplo, Even Better TOML                                                                                                                                                       | Taplo validation messages                                                                                                                                                                  | Weak: nested branches need `[[a.b.c]]` tables ([spec](https://toml.io/en/v1.0.0)) |
| **Starlark**                  | `starlark` 0.14.2, no API stability promise ([repo](https://github.com/facebook/starlark-rust))                                                                                                                                                                                                                | `starlark-pyo3` ([repo](https://github.com/inducer/starlark-pyo3))                                          | None; it is code                                                                                                                                         | `starlark_lsp`, "subpar" for custom embeddings (same repo)                                                                                                                    | Runtime errors                                                                                                                                                                             | Executable, so not a definition                                                   |
| **Custom grammar**            | Build it: `pest`, `chumsky` or `lalrpop`, with `miette` (already a CLI dependency, `cli/Cargo.toml:49`)                                                                                                                                                                                                        | Build it again: `lark`                                                                                      | Build it                                                                                                                                                 | Build it: tree-sitter grammar plus an LSP                                                                                                                                     | Whatever we write                                                                                                                                                                          | Most readable, highest cost, no agent training data                               |

Why the others lose, in one line each:

- **HCL** reads well and Terraform users know it, but it has no schema language outside Go and no schema-aware editor support without writing a Go language server.
- **CUE** and **Pkl** give the strongest types of the set, but neither has a first-class Rust or Python binding: the CLI would carry a Go archive or a JVM or native binary.
- **KCL** has a Rust core and a Python binding, but little adoption and a crates.io name clash with an unrelated `kcl-lib`.
- **TOML** cannot express a nested branch graph readably.
- **Starlark** is executable, which is what #71 moved away from.
- **A custom grammar** needs two parsers, a highlighter grammar, a language server and a formatter, and agents have never seen it.
  That last cost matters most, because agents write these files (#68 standing preferences).

### 2.2 What an agent sees on a wrong file

The same mistakes, a duration written `3 days` and `subject` misspelled `subjct`, against a two-kind schema.
Python `jsonschema` 4.24.0 and PyYAML 6.0.3; the script is in the appendix.

```text
--- oneOf
$.steps[0]: {'type': 'delay', 'name': 'Wait three days', 'duration': '3 days'} is not valid under any of the given schemas
$.steps[1]: {'type': 'email', ...} is not valid under any of the given schemas
--- if/then
$.steps[0].duration: '3 days' does not match '^\\d+(\\.\\d+)?[dhms]$'
$.steps[1]: 'subject' is a required property
$.steps[1]: Additional properties are not allowed ('subjct' was unexpected)
```

- The Rust `jsonschema` crate has the same `oneOf` problem ([issue #649](https://github.com/Stranger6667/jsonschema/issues/649)).
- Python's `best_match` treats `oneOf` errors as weak and does not descend into them ([docs](https://python-jsonschema.readthedocs.io/en/stable/errors/)).
- Pydantic 2.12, which the backend would use to define the models, emits `oneOf` plus an OpenAPI `discriminator` for a tagged union.
  Plain JSON Schema validators ignore `discriminator`, so the served schema needs a post-processing step that rewrites each tagged union into `if`/`then`.
- Pydantic's own errors are already located per kind: `steps.0.delay.duration -> String should match pattern ...`, `steps.1.email.subjct -> Extra inputs are not permitted` (run locally).
  The server response is the authoritative check. The CLI maps each path back to a YAML line and column.

### 2.3 YAML pitfalls, observed

PyYAML implements YAML 1.1 implicit typing ([yaml.org bool type](https://yaml.org/type/bool.html)).
Running it on three lines of a plausible workflow file:

```text
>>> yaml.safe_load("on: x\nno: y\nversion: 1.10")
{True: 'x', False: 'y', 'version': 1.1}
```

The first draft of the sample below used `on:` for the trigger, and it parsed as the boolean key `True`.
Rules that follow:

- Name the trigger key `trigger:`, never `on:`.
- Make `version` an integer, and quote string values that look like numbers or booleans in rendered output.
- The server parses YAML only if it must (for example a `source` text field on an MCP tool).
  The CLI sends JSON, so Python's YAML 1.1 behavior never reaches the compiler on the CLI path (inference).

## 3. The same workflow in four candidates

The workflow: when `trial started` fires, wait three days, then branch on the person property `plan`.
`pro` gets a thank-you email; `trial` triggers a CRM webhook signed with a secret; then exit.
Invented for this note. Integration id `12` and every URL are placeholders.

**TypeScript SDK (baseline).** Type-checked with `tsc --noEmit` against #5090 with no errors.

```ts
import { branch, delay, email, onEvent, path, person, secret, webhook, workflow } from '@posthog/workflows'

const thankCustomer = email({
  name: 'Thank the new customer',
  from: { integrationIds: [12], name: 'The Example team' },
  to: '{person.properties.email}',
  subject: 'Thanks for upgrading',
  text: 'Your pro plan is live.',
  html: '<p>Your pro plan is live.</p>',
})

const tellCrm = webhook({
  name: 'Tell the CRM',
  url: 'https://example.com/hooks/trial',
  body: { distinct_id: '{event.distinct_id}' },
  signingSecret: secret('CRM_WEBHOOK_SECRET'),
})

export const trialUpgradeNudge = workflow({
  key: 'trial-upgrade-nudge',
  name: 'Trial upgrade nudge',
  on: onEvent({ event: 'trial started' }),
  steps: path(
    delay('3d', { name: 'Wait three days' }),
    branch({
      name: 'Which plan?',
      branches: [
        { name: 'Upgraded to pro', when: [person('plan', 'exact', ['pro'])], then: path(thankCustomer) },
        { name: 'Still on trial', when: [person('plan', 'exact', ['trial'])], then: path(tellCrm) },
      ],
    })
  ),
  exit: { reason: 'Trial nudge finished' },
})
```

**YAML (recommended).** Parsed with PyYAML; the schema URL is a proposal, not an endpoint that exists.
Each step's `type` is the SDK constructor name, and every other key is that constructor's option, so the renderer's intermediate tree maps onto it directly (section 7).

```yaml
# yaml-language-server: $schema=https://us.posthog.com/api/workflows/schema/v1.json
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
            to: '{person.properties.email}'
            subject: Thanks for upgrading
            text: Your pro plan is live.
            html: <p>Your pro plan is live.</p>
      - name: Still on trial
        when:
          - { person: plan, operator: exact, value: [trial] }
        then:
          - type: webhook
            name: Tell the CRM
            url: https://example.com/hooks/trial
            body:
              distinct_id: '{event.distinct_id}'
            signing_secret: { secret: CRM_WEBHOOK_SECRET }
exit:
  reason: Trial nudge finished
```

Reuse, if a step appears twice, is a named definition the compiler resolves:

```yaml
define:
  tell-crm:
    type: webhook
    name: Tell the CRM
    url: https://example.com/hooks/trial
    signing_secret: { secret: CRM_WEBHOOK_SECRET }
steps:
  - use: tell-crm
```

YAML anchors (`&tell-crm` and `*tell-crm`) also work, but they vanish at parse time, so neither the server nor a later `pull` can see them (inference).

**HCL.** Not parsed; a sketch.
Block order carries the path, which HCL bodies preserve in the native syntax but a JSON-to-HCL conversion may not (inference).

```hcl
version = 1
key     = "trial-upgrade-nudge"
name    = "Trial upgrade nudge"

trigger "event" {
  event = "trial started"
}

delay "Wait three days" {
  duration = "3d"
}

branch "Which plan?" {
  arm "Upgraded to pro" {
    when {
      person   = "plan"
      operator = "exact"
      value    = ["pro"]
    }

    email "Thank the new customer" {
      from    = { integration_ids = [12], name = "The Example team" }
      to      = "{person.properties.email}"
      subject = "Thanks for upgrading"
      text    = "Your pro plan is live."
      html    = "<p>Your pro plan is live.</p>"
    }
  }

  arm "Still on trial" {
    when {
      person   = "plan"
      operator = "exact"
      value    = ["trial"]
    }

    webhook "Tell the CRM" {
      url            = "https://example.com/hooks/trial"
      body           = { distinct_id = "{event.distinct_id}" }
      signing_secret = secret("CRM_WEBHOOK_SECRET")
    }
  }
}

exit {
  reason = "Trial nudge finished"
}
```

**A small custom grammar.** Not parsed; a sketch of the most readable form a grammar could take.

```text
workflow trial-upgrade-nudge "Trial upgrade nudge" {
  trigger event "trial started"
  wait 3d "Wait three days"
  branch "Which plan?" {
    when person.plan exact ["pro"] as "Upgraded to pro" {
      email "Thank the new customer" {
        from integration 12 name "The Example team"
        to "{person.properties.email}"
        subject "Thanks for upgrading"
        text "Your pro plan is live."
        html "<p>Your pro plan is live.</p>"
      }
    }
    when person.plan exact ["trial"] as "Still on trial" {
      webhook "Tell the CRM" {
        post "https://example.com/hooks/trial"
        body { distinct_id "{event.distinct_id}" }
        signing_secret secret(CRM_WEBHOOK_SECRET)
      }
    }
  }
  exit "Trial nudge finished"
}
```

Reading them side by side (inference): the TypeScript and YAML versions carry the same information in about the same space.
TypeScript front-loads the steps as constants; YAML reads top to bottom in run order.
HCL and the grammar read best for a person, but they buy that with the costs in section 2.1.

## 4. Can the served schema come from what exists? (question 3)

### 4.1 What is derivable today

| Piece                                                                     | Where it lives                                                                                                                                                                                                           | Derivable?                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action types                                                              | `SUPPORTED_ACTION_TYPES`, `products/workflows/backend/models/hog_flow/hog_flow.py:28-40`                                                                                                                                 | Yes, an enum.                                                                                                                                                                                                                                                                                                                                                                                 |
| Trigger kinds                                                             | `TRIGGER_TYPES`, `hog_flow.py:46`                                                                                                                                                                                        | Yes, an enum.                                                                                                                                                                                                                                                                                                                                                                                 |
| Top-level fields (`name`, `status`, `exit_condition`, `variables`, `key`) | `HogFlowSerializer` and its field serializers, `presentation/views/hog_flow.py:2028-2257`, `:2989`                                                                                                                       | Yes, through drf-spectacular.                                                                                                                                                                                                                                                                                                                                                                 |
| Per-type action `config`                                                  | `HOG_FLOW_ACTION_CONFIG_SCHEMA`, `presentation/views/hog_flow.py:1174-1222`                                                                                                                                              | **No.** The first `anyOf` branch is a free-form object with `additionalProperties: True`, placed first on purpose so the MCP Zod parse never strips a key (comment at `:1154-1159`). Only `wait_until_condition` is typed. The rest is prose in the field's `help_text` (`:1312` on) and imperative checks in `HogFlowActionSerializer.validate`.                                             |
| Function template inputs                                                  | `inputs_schema` on each template, served by `/api/projects/:id/hog_function_templates/` and the MCP tools `cdp-function-templates-list` and `-retrieve` (`products/cdp/mcp/cdp_function_templates.yaml:12-14`, `:39-41`) | **Yes, and already dynamic.** Item types are a closed list (`posthog/cdp/validation.py:598-624`), and `string`, `number`, `boolean`, `json`, `dictionary` and `choice` map onto JSON Schema directly. The webhook template shows the shape (`nodejs/src/cdp/templates/_destinations/webhook/webhook.template.ts:40-112`). Templates are per project, so this part must be served per project. |
| The whole OpenAPI spec                                                    | `path("api/schema/", SpectacularAPIView.as_view())`, `posthog/urls.py:112`                                                                                                                                               | Served live today, but it inherits the free-form `config`.                                                                                                                                                                                                                                                                                                                                    |

The more important finding: **the authoring schema is not the definition schema, whatever gets derived.**
The SDK compiles a friendlier shape into the definition, and a DSL would too:

- action ids come from step-name slugs;
- edges and branch indices come from placement;
- `{ value: ... }` input wrappers and the `filters` wrapper on conditions are added for the author;
- the email `design` is built from `html`.

That compile logic is `emit.ts` (722 lines on #5090).
So the source of truth is a **new, small set of authoring models**, not a projection of the serializers.
There is one model per step kind, shaped like the SDK's constructor options.
The models sit in `products/workflows/backend/` beside a `compile()` and the existing `render()`.
Enums and template inputs are pulled into those models from the places above.

The in-repo precedent for "Pydantic models that both validate writes and generate OpenAPI" is dashboards' widget specs, established on #24:

- `pydantic_config_field` in `products/dashboards/backend/widget_specs/pydantic_openapi.py:78`;
- the `POSTPROCESSING_HOOKS` entry at `:98`;
- `validate_widget_config` in `registry.py:100-105`;
- the derived `EXPECTED_WIDGET_TYPES` at `registry.py:275`.

The same models would give generated TypeScript types and MCP Zod through the normal `hogli build:openapi` path (`hogli.yaml:502-529`).

Per-type definition `config` models (the full #24 port) would make pass-through steps typed as well.
They are a separate, larger change that also benefits the UI and MCP.
The DSL can ship without them by keeping a loosely typed `type: step` escape hatch, as the SDK does.

### 4.2 One source for the API endpoint and the MCP tool

MCP tools are generated from OpenAPI operations: `products/workflows/mcp/tools.yaml` names an `operation`, and `generate-tools` emits the handler (#108 Notes).
So the sharing is mechanical (design, not built):

1. A read action on `HogFlowViewSet`, for example `GET /api/projects/:id/hog_flows/authoring_schema/`, returns the JSON Schema.
   It merges the static models with the project's templates and email integration ids.
2. A `tools.yaml` entry, for example `workflows-get-authoring-schema`, points at that operation.
   The tool's input schema is baked into the MCP build, but its output is whatever Django returns at request time.
   A new step kind therefore reaches agents with the Django deploy, with no MCP rebuild (inference from how generated tools forward to the API).
3. `posthog-cli api call workflows-get-authoring-schema '{}'` reaches the same tool from a shell.
   The `api` command embeds the MCP tool catalog at CLI release time (`cli/build.rs`, `services/mcp/scripts/build-cli-release.ts:12`, `services/mcp/src/cli/tools.ts:26-50`).
   So the tool appears in the CLI after one CLI release, then its output stays live.
4. A static, unauthenticated copy of the project-independent part at a stable URL feeds the editor modeline.
   Editors fetch it without credentials.
   `posthog-cli workflows schema` writes the project-merged version to a local file, the Terraform `init` pattern (#97, and section 6).

The n8n MCP server is the closest shipped analog.
It serves `get_workflow_sdk_reference`, `get_node_types` ("TypeScript type definitions for n8n nodes"), `validate_workflow` ("Always validate before creating or updating a workflow") and `create_workflow_from_code` from the instance itself ([tools reference](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference.md)).

### 4.3 Versioning

The file carries a required integer `version: 1`, like ASL's `Version` ([spec](https://states-language.net/spec.html)) and Kubernetes' `apiVersion`.
Proposed rules (design):

- **Additive changes stay in the version.** A new step kind or optional field is a Django deploy; old files still validate.
- **A breaking change adds `version: 2`.** The server keeps the v1 models and a v1-to-v2 converter.
  This mirrors Kubernetes serving several CRD versions with one storage version ([docs](https://kubernetes.io/docs/tasks/extend-kubernetes/custom-resources/custom-resource-definitions/)).
  It also mirrors Terraform's per-resource schema `version` with state upgraders ([docs](https://developer.hashicorp.com/terraform/plugin/framework/resources/state-upgrade)).
- **`check` on a deprecated version** prints the `status`, `message`, `why`, `fix` refusal, with `fix` naming `posthog-cli workflows pull`, which always renders the current version.
- **Schema URLs carry the major version** (`.../schema/v1.json`), so a modeline never silently moves to v2.

## 5. What the PostHog CLI needs (question 4)

The CLI is Rust with `clap` derive (`cli/Cargo.toml`, `cli/src/commands.rs`).

- **Where commands go.** `ExpCommand` already holds `Endpoints`, "Manage PostHog endpoints as YAML files" (`cli/src/commands.rs:227`), and `Schema` (`:252`).
  A `Workflows` variant next to them, in `cli/src/experimental/workflows/`, copies the layout of `cli/src/experimental/endpoints/` (`mod.rs`, `pull.rs`, `push.rs`, `diff.rs`).
  Telemetry names go in `telemetry_command_name` (`commands.rs:318`).
  It graduates to a top-level `workflows` command later, as `hermes` and `proguard` did (`commands.rs:231-248`).
- **Auth and transport exist.** `utils/auth.rs:74-76` reads `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID` and `POSTHOG_CLI_HOST`, then falls back to `~/.posthog/credentials.json`.
  `PHClient::project_url` builds `/api/projects/:id/...` (`cli/src/api/client.rs:267`).
  These are the same credentials the SDK's CLI reuses (#69), and a project secret key works as a `Bearer` token (#106).
- **The YAML-resource pattern exists.** `EndpointYaml` (`endpoints/mod.rs:60-84`) has `to_api_request` (`:351`), `from_api_response` (`:427`) and `validate` (`:509`).
  Parse errors surface through `serde_yaml::from_str(...).with_context(...)` (`endpoints/push.rs:481`).
  Its validation is hand-coded in Rust, the pattern this design avoids for workflows.
- **New dependencies.** `serde_yaml` 0.9 (`cli/Cargo.toml:59`) is archived.
  A maintained YAML parser with source positions is needed to map an error path to a line.
  `jsonschema` is needed for the offline check. `reqwest`, `similar` and `miette` are already present.

| Command            | What it does                                                                                                                                                                                                              | Cost (inference)                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `schema`           | GET the project-merged schema, write `.posthog/workflows.schema.json`, print it or a field with `--field steps.email` for agents                                                                                          | Small                             |
| `init <file>`      | Write a starter file with `version`, a `key` from the file name and the modeline (#72 decision 4)                                                                                                                         | Small                             |
| `check <file>`     | Parse, validate offline against the cached or public schema, then with credentials POST to a dry-run compile and print the change list. Without credentials it degrades and exits 0 (#71)                                 | Medium                            |
| `push <file>`      | Resolve `{ secret: NAME }` from the environment, send the document by `key`, print `created`, `updated` or `unchanged` with the version. `--force`, `--allow-move`, `--project`, `--host` as decided on #72, #99 and #105 | Medium                            |
| `pull <key or id>` | GET the rendered YAML and write the file                                                                                                                                                                                  | Small, because the server renders |

For scale: the endpoints module is 3,157 lines with its tests.
The SDK's Node CLI is 1,643 lines (`packages/workflows/src/cli/`) plus a 2,137-line compiler that would move to the server.

Agent capabilities that come with this:

- The schema is served by an MCP tool and by `posthog-cli workflows schema`, and it is always current.
- `check` output uses the `status`, `message`, `why`, `fix` contract with a `file:line:col` prefix.
- `posthog-cli api skill install` fetches skills from the latest context-mill release at run time (`services/mcp/src/resources/internals.ts:6`, `services/mcp/src/cli/skills.ts:24`).
  A workflows skill therefore updates without a CLI release.

## 6. What comparable tools do (question 6)

| Tool               | Authoring format                                                                                                                 | Schema source                                                                                                                                                                                                                                                   | Dynamic or packaged                                                                                              | Old files                                                                                                         | Pull back to source                                                                                                               | Editor and agent feedback                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions     | YAML data ([syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax))                         | Community JSON Schema in SchemaStore ([file](https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/github-workflow.json)); not in the REST API ([API](https://docs.github.com/en/rest/actions/workflows))                                     | Packaged, third party                                                                                            | No version field                                                                                                  | No write API, nothing to pull                                                                                                     | VS Code extension ([repo](https://github.com/github/vscode-github-actions)); actionlint prints `file:line:col: message [rule]` ([repo](https://github.com/rhysd/actionlint))        |
| Terraform          | HCL data ([docs](https://developer.hashicorp.com/terraform/language/syntax/configuration))                                       | Provider returns it over gRPC `GetProviderSchema` ([proto](https://github.com/hashicorp/terraform/blob/main/docs/plugin-protocol/tfplugin6.proto))                                                                                                              | Fetched at `init`, pinned by the lock file ([docs](https://developer.hashicorp.com/terraform/cli/commands/init)) | Provider constraints; schema `version` plus state upgraders                                                       | `-generate-config-out`, experimental ([docs](https://developer.hashicorp.com/terraform/language/import/generating-configuration)) | terraform-ls; `validate -json` diagnostics with range ([docs](https://developer.hashicorp.com/terraform/cli/commands/validate))                                                     |
| Pulumi             | Code in five languages, or Pulumi YAML                                                                                           | Package `schema.json` drives per-language SDK codegen ([docs](https://www.pulumi.com/docs/iac/using-pulumi/extending-pulumi/schema/))                                                                                                                           | Plugin fetched; SDK packaged or generated                                                                        | SDK and plugin versions                                                                                           | `pulumi import` emits code ([docs](https://www.pulumi.com/docs/iac/guides/migration/import/))                                     | Language tooling                                                                                                                                                                    |
| Temporal           | Code, "no separate DSL" ([docs](https://docs.temporal.io/workflows))                                                             | None                                                                                                                                                                                                                                                            | n/a                                                                                                              | `patched()` markers, worker versioning ([docs](https://docs.temporal.io/develop/typescript/workflows/versioning)) | n/a                                                                                                                               | Language tooling                                                                                                                                                                    |
| Inngest            | TypeScript code run on your compute ([docs](https://www.inngest.com/docs/learn/how-functions-are-executed))                      | None                                                                                                                                                                                                                                                            | n/a                                                                                                              | Step memoization ([docs](https://www.inngest.com/docs/learn/versioning))                                          | n/a                                                                                                                               | Language tooling                                                                                                                                                                    |
| Trigger.dev        | TypeScript code in a deployed image ([docs](https://trigger.dev/docs/how-it-works))                                              | None                                                                                                                                                                                                                                                            | n/a                                                                                                              | Runs locked to a version ([docs](https://trigger.dev/docs/versioning))                                            | n/a                                                                                                                               | Language tooling                                                                                                                                                                    |
| Windmill           | YAML `flow.yaml` in OpenFlow ([docs](https://www.windmill.dev/docs/openflow))                                                    | `openflow.openapi.yaml` in the repo ([file](https://github.com/windmill-labs/windmill/blob/main/openflow.openapi.yaml))                                                                                                                                         | Packaged (inference)                                                                                             | Not documented                                                                                                    | `wmill sync pull` writes YAML ([docs](https://www.windmill.dev/docs/advanced/cli/sync))                                           | `wmill lint` validates against schemas ([docs](https://www.windmill.dev/docs/advanced/cli/lint))                                                                                    |
| n8n                | Workflow JSON, or "Workflow SDK" TypeScript the server parses                                                                    | Node types served by the instance (`/types/nodes.json`, [server.ts](https://github.com/n8n-io/n8n/blob/master/packages/cli/src/server.ts))                                                                                                                      | Dynamic, from the instance                                                                                       | Per-node `name@version`                                                                                           | JSON export, public API                                                                                                           | Built-in MCP: `get_node_types`, `validate_workflow`, `create_workflow_from_code` ([reference](https://docs.n8n.io/connect/connect-to-n8n-mcp-server/mcp-server-tools-reference.md)) |
| AWS Step Functions | ASL JSON, `.asl.json` ([docs](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-amazon-states-language.html))        | ASL spec; server `ValidateStateMachineDefinition` returns `diagnostics` with `code`, `message`, `location` like `/States/HelloWorld/Parameters` ([API](https://docs.aws.amazon.com/step-functions/latest/apireference/API_ValidateStateMachineDefinition.html)) | Server-side validation                                                                                           | Optional `Version` ([spec](https://states-language.net/spec.html))                                                | Workflow Studio export ([docs](https://docs.aws.amazon.com/step-functions/latest/dg/workflow-studio.html))                        | Workflow Studio, the validate API                                                                                                                                                   |
| Argo Workflows     | Kubernetes YAML, `apiVersion: argoproj.io/v1alpha1` ([docs](https://argo-workflows.readthedocs.io/en/latest/workflow-concepts/)) | CRD OpenAPI served by the API server, plus a published JSON Schema ([api/](https://github.com/argoproj/argo-workflows/tree/main/api))                                                                                                                           | Both                                                                                                             | `apiVersion`; served and storage versions                                                                         | `argo template get -o yaml` ([docs](https://argo-workflows.readthedocs.io/en/latest/cli/argo_template_get/))                      | `kubectl explain` reads the server's OpenAPI ([docs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_explain/)); `argo lint`                                         |

What the table says for PostHog:

- **The code-first tools run user code.**
  Temporal, Inngest, Trigger.dev and Pulumi execute the program in the user's runtime, so a host language is the product.
  PostHog workflows are data that PostHog's engine interprets.
  That puts them with GitHub Actions, Argo, Step Functions and Windmill, which all author YAML or JSON.
- **Kubernetes is the strongest "server serves the schema" precedent.**
  Its docs also say the published OpenAPI rules "may not be complete, and usually aren't", so `--dry-run=server` is the precise check ([docs](https://kubernetes.io/docs/concepts/overview/kubernetes-api/)).
  That argues for a server-side validate endpoint behind `check`, not only a schema.
- **Step Functions shows the error contract to copy.** A server validation API returns a machine code, a message and a JSON-pointer location.
- **n8n is the counter-example worth weighing.** It keeps a TypeScript-looking syntax for agents, parses it on the server, and serves the types from the instance.
  The docs do not say whether the code is run in a sandbox or statically parsed.
  For PostHog that shape would need a TypeScript parser in Python or in the Rust CLI.
  It would also leave the file looking like a program, which #71 set out to avoid.
- **GitHub Actions is the counter-example for hosting.** Its schema lives in SchemaStore, maintained outside GitHub, so it trails the product.
  A schema published through SchemaStore is a second release channel.
  Serve it from the PostHog host instead.

## 7. What happens to the work already built (question 5)

| Work                                                                                                                                                                                                                                                                  | Keep SDK                                                  | YAML DSL (recommended)                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `key` column and list filter ([#103849](https://github.com/PostHog/posthog/pull/103849), [#105958](https://github.com/PostHog/posthog/pull/105958))                                                                                                                   | Kept                                                      | **Kept unchanged.** Identity by `key` is format-agnostic.                                                                                                                                                                                                                                                                                                                                                          |
| Project secret key on the viewset ([#104202](https://github.com/PostHog/posthog/pull/104202)), first revision ([#104156](https://github.com/PostHog/posthog/pull/104156)), `managed_by` and `source` ([#103540](https://github.com/PostHog/posthog/pull/103540), #77) | Kept                                                      | **Kept unchanged.** A push sets the same fields.                                                                                                                                                                                                                                                                                                                                                                   |
| Reverse renderer, `products/workflows/backend/services/code_renderer.py` (1,044 lines, #104452)                                                                                                                                                                       | Kept, and must track posthog-js releases through fixtures | **Retargeted.** The walk, arm detection, hoisting and warnings build an intermediate tree of `_Call(name, args)` nodes (`:96-99`, `render_step` `:411`, `hoist_repeats` `:777`). A TypeScript printer turns that tree into text (`_quote` to `_items`, `:111-205`). A `_Call("webhook", {...})` becomes `{type: webhook, ...}`, so only the printer and the JS identifier helpers change (inference from reading). |
| Golden fixtures, `products/workflows/backend/test/fixtures/code_renderer/` (8 cases, 22 files)                                                                                                                                                                        | Copied into posthog-js too                                | The `.json` and `.roundtrip.json` inputs stay. Each `.ts` becomes a `.yaml`. The round trip becomes one Python test with no second repository.                                                                                                                                                                                                                                                                     |
| `workflows-get-code` MCP tool and the Copy code button (#104452)                                                                                                                                                                                                      | Kept                                                      | Kept, returning YAML. Changing the format is cheap while #104452 is unmerged.                                                                                                                                                                                                                                                                                                                                      |
| Authoring skill `writing-workflows-as-code` ([#104313](https://github.com/PostHog/posthog/pull/104313))                                                                                                                                                               | Kept; it waits for the npm publish (`SKILL.md:14`)        | Rewritten for YAML and `posthog-cli`. The `status`, `message`, `why`, `fix` reference (`references/errors.md`) carries over. Field-by-field docs move into the served schema's `description`s.                                                                                                                                                                                                                     |
| `@posthog/workflows` SDK and CLI ([posthog-js#5090](https://github.com/PostHog/posthog-js/pull/5090), +6,945 lines, draft)                                                                                                                                            | Ships                                                     | **Closed or parked.** Its decisions carry over: the key rule, slug action ids, required step names, `secret` semantics, the refusal statuses, `check` without credentials exiting 0, `--force`, `--allow-move`. `emit.ts` rules port to the Python compiler; the `cli/` behavior ports to Rust.                                                                                                                    |
| Proposal [posthog-js#5089](https://github.com/PostHog/posthog-js/issues/5089)                                                                                                                                                                                         | Stands                                                    | Answered with a pointer to this decision.                                                                                                                                                                                                                                                                                                                                                                          |
| Example folder (#104157) and CI job (#104164)                                                                                                                                                                                                                         | Rebuilt on the npm package                                | Rebuilt on YAML. The CI job installs `posthog-cli` and needs no Node.                                                                                                                                                                                                                                                                                                                                              |
| Locked decisions on #69 and #39 ("Node CLI as the package bin")                                                                                                                                                                                                       | Stand                                                     | **Reversed.** Everything else locked on #69, #71, #72, #74 and #77 stands.                                                                                                                                                                                                                                                                                                                                         |

One unrelated fact found on the way: the viewset moved to `presentation/views/hog_flow.py` today (`d69478c6941`).
PRs #103849, #104202, #103540 and #104452 still edit `products/workflows/backend/api/hog_flow.py`, so they need a restack either way.

## 8. Rough cost

Slices, each one PR-sized. Sizes are relative and inferred, not estimated in days.

| #   | Slice                                                                                                                                                                                                        | Size               | Replaces                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------- |
| 1   | Authoring models (Pydantic, one per step kind, `version: 1`), JSON Schema with `if`/`then` post-processing, the `authoring_schema` action, the MCP tool, the static public copy                              | Medium             | `definition.ts`, `steps.ts` types              |
| 2   | Server compiler, authoring document to definition: slug ids, edges, arm indices, `html` to design (`build_html_wrap_design` already exists in `posthog/cdp/validation.py`), secret placement, located errors | Medium             | `emit.ts`                                      |
| 3   | Renderer retarget to YAML, fixtures to `.yaml`, `compile(render(d)) == d` test                                                                                                                               | Small to medium    | TypeScript printer                             |
| 4   | `validate` (dry run with change list) and push-by-key endpoints over the existing create and update path, setting `key`, `managed_by`, `source`                                                              | Small to medium    | SDK `cli/client.ts`, `normalize.ts`, `diff.ts` |
| 5   | `posthog-cli exp workflows init, check, push, pull, schema`                                                                                                                                                  | Medium             | SDK `cli/`                                     |
| 6   | Skill rewrite, `workflows-get-code` to YAML, example folder and CI job                                                                                                                                       | Small              | #104313, #104157, #104164                      |
| 7   | Optional: per-type definition `config` models (the #24 widget-specs port)                                                                                                                                    | Large, independent | The free-form `config` branch                  |

Slices 1 and 2 are the critical path.
Slice 7 is what makes "strong type safety" true for every action type, and it is worth doing whichever option wins.
Without it the DSL, like the SDK, types the six common steps and passes the rest through.

## 9. Open questions for Michael

1. **Is losing the TypeScript reading and editing experience acceptable?**
   If not, the n8n shape (TypeScript syntax, parsed not run, types served) is the runner-up. It needs a TypeScript parser on the server or in the Rust CLI.
2. **Server-side compile: yes?** It is what makes the version chase go away, and it adds an authoring-document write path to the workflows API.
   The workflows team owns that API, so this needs their agreement before slice 1.
3. **Is slice 7 a prerequisite or a follow-up?** It decides whether v1 claims strong typing for all action types or for the common six.
4. **Public schema URL:** is an unauthenticated, project-independent schema endpoint acceptable? Without it, editors only get a schema after `posthog-cli workflows schema` writes a local file.
5. **Timing:** does a customer need something before this lands? If so, one path is to ship nothing. Another is to ship the SDK as `0.x` and say it will be replaced. Shipping it as stable is not among them.
6. **What to do with posthog-js#5089 and #5090:** close them, or keep #5089 open as the home of a later, generated, types-only package?

## 10. What I could not verify

- The deploy cadence of the MCP server relative to Django.
  "A new step kind reaches agents with the Django deploy" assumes the tool forwards to the API at request time, which is how generated tools work, and that the tool itself already exists.
- Whether yaml-language-server honors the OpenAPI `discriminator` keyword. I assumed it does not and designed around it.
- The exact Rust `jsonschema` 0.58 message for a failed `oneOf`, and whether its newer error `context` helps. Only the Python behavior was run.
- Which maintained Rust YAML crate gives usable source positions for mapping a JSON path to `file:line:col`. `saphyr` and `yaml-rust2` expose markers per their docs, but I did not build with them.
- Whether n8n runs Workflow SDK code in a sandbox or parses it statically. Its docs say "parses the code into a workflow".
- Whether `/api/schema/` is reachable without authentication on PostHog Cloud.
- The HCL, CUE and custom-grammar samples were not parsed. The TypeScript sample was type-checked; the YAML sample was parsed.

## Appendix: the error demo

Run with Python 3, `jsonschema` 4.24.0 and PyYAML 6.0.3.

```python
import yaml
from jsonschema import Draft202012Validator

DUR = {"type": "string", "pattern": r"^\d+(\.\d+)?[dhms]$"}
delay = {"type": "object", "properties": {"type": {"const": "delay"}, "name": {"type": "string"}, "duration": DUR},
         "required": ["type", "name", "duration"], "additionalProperties": False}
email = {"type": "object", "properties": {"type": {"const": "email"}, "name": {"type": "string"}, "to": {"type": "string"},
         "subject": {"type": "string"}, "text": {"type": "string"}},
         "required": ["type", "name", "to", "subject", "text"], "additionalProperties": False}
kinds = {"delay": delay, "email": email}
one_of = {"type": "object", "properties": {"steps": {"type": "array", "items": {"oneOf": list(kinds.values())}}}}
if_then = {"type": "object", "properties": {"steps": {"type": "array", "items": {
    "type": "object", "required": ["type"], "properties": {"type": {"enum": list(kinds)}},
    "allOf": [{"if": {"properties": {"type": {"const": k}}, "required": ["type"]}, "then": v} for k, v in kinds.items()]}}}}
doc = yaml.safe_load("""
steps:
  - type: delay
    name: Wait three days
    duration: 3 days
  - type: email
    name: Thank the new customer
    to: "{person.properties.email}"
    subjct: Thanks for upgrading
    text: Your pro plan is live.
""")
for label, schema in [("oneOf", one_of), ("if/then", if_then)]:
    print(f"--- {label}")
    for e in sorted(Draft202012Validator(schema).iter_errors(doc), key=lambda e: list(e.absolute_path)):
        print(f"{e.json_path}: {e.message}")
```
