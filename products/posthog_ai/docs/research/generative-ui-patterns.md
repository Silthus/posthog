# Generative UI patterns for chat actions

Research for [ticket 88](https://github.com/Silthus/posthog/issues/88), part of the
[clickable actions map](https://github.com/Silthus/posthog/issues/80). Ticket 80's Notes record the
facts about this repo's current state. This document does not re-derive them; it cites them where
relevant and adds the external patterns the map asked for.

## Vercel AI SDK: `useChat` tool parts

**How output is typed.** AI SDK 5 gives each tool call a typed part on `message.parts`, named
`tool-${toolName}` instead of a generic type. A part carries a `state` field that steps through
`input-available`, `output-available`, and `output-error` as the call progresses.
Source: [AI SDK UI — generative user interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces).

**How a click flows back.** For a tool with no server `execute`, the model still emits a tool call,
but the client is the one that resolves it. The client renders whatever UI it wants for that part
(buttons, a form) and, when the user acts, calls `addToolOutput` (named `addToolResult` in older
docs) with the tool name, `toolCallId`, and an `output`:

```ts
addToolOutput({
  tool: 'askForConfirmation',
  toolCallId: callId,
  output: 'Yes, confirmed.',
})
```

An error path exists too, setting `state: 'output-error'` with `errorText`. The call is documented
as fire-and-forget ("without `await`, to avoid potential deadlocks"). This re-injects the result into
the assistant message stream as a typed part, and the conversation continues from there — no new
turn, no separate endpoint.
Source: [AI SDK UI — chatbot tool usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage).

**What PostHog already has.** This is close to `PermissionInput.tsx`
(`products/posthog_ai/frontend/components/PermissionInput.tsx`): a pending tool call renders an
interactive card, and `respondToPermission` posts the choice back through
`runStreamLogic` (`PermissionInput.tsx:391-398`), resuming the same turn. The difference is
transport (ACP permission request over SSE, not a `toolCallId` reply) and that PostHog's version is
one fixed card shape (options list), not an arbitrary component chosen per tool.

## Vercel AI SDK: RSC `streamUI` / streaming React components

**How output is typed.** `streamUI` hands the model a set of tools whose `generate` function
returns a React component directly, instead of returning JSON. `generate` can be an async generator
that yields a loading component before returning the final one:

```ts
generate: async function* ({ location }) {
  yield <LoadingComponent />
  const weather = await getWeather(location)
  return <WeatherComponent weather={weather} />
}
```

The result's `.value` is a `ReactNode` streamed to the client.
Source: [AI SDK RSC — streaming React components](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components).

**How a click flows back.** Not covered by this page. RSC generative UI usually wires a click to a
Next.js Server Action called directly from the streamed component (the component is server-rendered
JSX, so it can close over a server action reference), rather than a generic reply channel. This
package is also the one the Vercel docs mark legacy in favor of `useChat` tool parts; the AI SDK
migration guide has moved most new generative-UI guidance to the `tool-${toolName}` pattern above.

**What PostHog already has.** Nothing analogous — PostHog does not stream server-rendered
components into the client; every rendered card is a client component keyed off a `ToolRegistryEntry`
(`products/posthog_ai/frontend/components/tool/toolRegistry.tsx:47-52`). This pattern is Next.js/RSC
specific and does not map onto PostHog's Django + SPA architecture without adopting RSC.

## Vercel's own support chat / Chat SDK

**How output is typed.** Vercel's `vercel/chat` package (the SDK behind Vercel's own chat surfaces
across Slack, Teams, Google Chat, Discord) exposes **Cards** — "JSX-based interactive cards (Block
Kit, Adaptive Cards, Google Chat Cards)" — for posting buttons and dropdowns into a thread, and
**Modals** — "form dialogs with text inputs, dropdowns, and validation" — for a fuller form flow.
`thread.post()` accepts a card, plain markdown, or a raw AI SDK stream.
Source: [github.com/vercel/chat](https://github.com/vercel/chat), linking to
[chat-sdk.dev/docs/cards](https://chat-sdk.dev/docs/cards),
[chat-sdk.dev/docs/actions](https://chat-sdk.dev/docs/actions), and
[chat-sdk.dev/docs/modals](https://chat-sdk.dev/docs/modals).

**How a click flows back.** The README documents this at the level of "Actions — handle button
clicks and dropdown selections," but does not give the exact callback signature in the surfaced
content; the full mechanics live behind the linked `/docs/actions` and `/docs/modals` pages, which
were not independently fetched for this ticket. Treat the click-to-handler wiring as unverified
beyond "there is a registered action handler per card action."

**What PostHog already has.** The one-voice approval card in `PermissionInput.tsx` and the
`AssistantMessageForm` quick-reply on the frozen legacy runtime (ticket 80 Notes) are PostHog's
closest equivalents to a Card with buttons. Neither supports a dropdown or a multi-field modal today.

## Typesafe AI (Jev) + json-render: JSON-driven dynamic forms

Ticket 80's Notes already establish what Jev itself does (a classifier over typed questions,
`choice`/`score`/`noul`, `https://api.typesafe.ai/v1/systemone`) and that it selects from a fixed
catalog rather than generating free UI. This section only adds the demo and the rendering library,
which ticket 80 left open.

The `docs.typesafe.ai` demos page lists a single public demo, the smart home assistant
(`docs.typesafe.ai/demos/smart-home`): "a simple Vite/React single-page app" that evaluates a user's
request against speculative questions with an LLM fallback for compound or conversational input. Its
own docs page does not name a form-rendering library or link a GitHub repo for the frontend.
Source: [docs.typesafe.ai/demos](https://docs.typesafe.ai/demos),
[docs.typesafe.ai/demos/smart-home](https://docs.typesafe.ai/demos/smart-home). The
`docs.typesafe.ai/agent-skill` page (installation of the Typesafe skill for coding agents) does not
mention a UI library either.
Source: [docs.typesafe.ai/agent-skill](https://docs.typesafe.ai/agent-skill).

The dynamic-form demo the ticket points at lives on X, not in the Typesafe docs. Chris Tate
(`@ctatedev`, Vercel Labs) posted **JevForm**, described by a third party as "a form that dynamically
branches and chooses what to ask next using @typesafeai's Jev," and stated it was "built with
@vercel json-render (by @ctatedev)."
Source: [x.com/TamirSPIRITT/status/2101079101997982037](https://x.com/TamirSPIRITT/status/2101079101997982037).
Tate's own account frames the pairing directly: "New experiment: json-render + jev. The future
Generative UI is instant. Your components, your actions, your design system. Rendered in
milliseconds."
Source: [x.com/ctatedev/status/2101022101750571357](https://x.com/ctatedev/status/2101022101750571357).

**The React library is `vercel-labs/json-render`** ("The Generative UI framework"), 16k+ stars,
supporting React, Vue, Svelte, Solid, and React Native, with 36 pre-built shadcn/ui components.
Source: [github.com/vercel-labs/json-render](https://github.com/vercel-labs/json-render).

**How output is typed.** A catalog is declared with `defineCatalog(schema, { components: {...},
actions: {...} })`, where each component entry has a Zod `props` schema and a natural-language
`description`. `catalog.prompt()` turns the catalog into the system-prompt guardrail text, so the
model can only emit JSON that matches a declared component's schema — it cannot invent a component
or a prop shape outside the catalog.
Source: [github.com/vercel-labs/json-render](https://github.com/vercel-labs/json-render).

**How a click flows back.** Rendered components receive `{ props, children, emit }`. A click calls
`emit("actionName")`, or the built-in `setState` action with a spec like
`{ "action": "setState", "actionParams": { "statePath": "/path", "value": x } }`. State changes then
re-evaluate `{ "$state": "/key" }` expressions and visibility conditions client-side, so most
interactions close the loop without another model round-trip; `emit` is the hook available for
routing an interaction to a real backend call when one is needed.
Source: [github.com/vercel-labs/json-render](https://github.com/vercel-labs/json-render).

**What PostHog already has.** Nothing that renders an open component catalog from model JSON.
`QuestionRenderer.tsx` and `PermissionInput.tsx` are both hand-coded React for one fixed shape
(a list of questions, a list of approval options); the model supplies content (question text,
option labels) but never a component choice or a prop tree. A `json-render`-style catalog would sit
one layer above today's `ToolRegistryEntry` design (`toolRegistry.tsx:47-84`): the registry already
maps a tool key to a `Renderer`, but each `Renderer` is a fixed React component, not a schema the
model fills in per call.

## MCP Apps (`ui://`)

Ticket 80's Notes already cover MCP UI apps in this repo (`products/*/mcp/apps/`, host support,
`visibility` gating in PostHog Desktop) and the write precedent
(`services/mcp/src/ui-apps/apps/loops-review.tsx`). This section only adds the spec-level typing and
call mechanics.

**How output is typed.** A tool declares a `ui://` resource holding its HTML interface; the host
renders that resource in a sandboxed surface (an iframe) rather than the model emitting typed JSON
per turn. The type contract is the tool's own input/output JSON Schema (standard MCP), not a
component catalog — the "generative" part is which `ui://` resource the host chooses to show, not
what shape the UI takes.
Source: [modelcontextprotocol.io](https://modelcontextprotocol.io),
[github.com/modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps).

**How a click flows back.** The `@modelcontextprotocol/ext-apps` package provides an `App` class
over a `PostMessageTransport`, bridging the sandboxed app and the host. A click inside the app calls
`app.callServerTool({ name, arguments })`, which the host relays to the real MCP server as a normal
tool call and returns the result into the app's JS. This repo's own precedent
(`services/mcp/src/ui-apps/apps/loops-review.tsx:29-46`, cited in ticket 80) shows the two-step
prepare/execute pattern: `callServerTool({ name: 'loops-create-prepare', ... })` returns a
`confirmation_hash`, then a second `callServerTool({ name: 'loops-create-execute', arguments: {
confirmation_hash, confirmation: 'confirm' } })` performs the write.
Source: [github.com/modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps);
`services/mcp/src/ui-apps/apps/loops-review.tsx`.

**What PostHog already has.** Full support, but scoped to external hosts only. Ticket 80's Notes are
explicit: "MCP UI apps do not render in PostHog AI threads. `ui://` apps under `products/*/mcp/apps/`
render in Claude Desktop, ChatGPT, and PostHog Desktop only." 15 products already ship an
`mcp/apps/` directory (`products/actions`, `ai_observability`, `cohorts`, `error_tracking`,
`experiments`, `feature_flags`, `product_analytics`, `replay`, `replay_vision`, `surveys`, `tasks`,
`tracing`, `user_interviews`, `visual_review`, `workflows`), each with an `index.ts` and one or more
view components — the widest existing generative-UI surface in the repo, just not wired into the
sandbox thread this map targets.

## json-schema form renderers (react-jsonschema-form, JSON Forms)

**How output is typed.** Both libraries take a JSON Schema as the single source of truth for a
form's data shape.

`react-jsonschema-form` (`@rjsf/core`) exposes a `Form` component: `schema` (JSON Schema),
`uiSchema` (layout/appearance), a required `validator` implementation, and `formData` to
control/pre-fill values.
Source: [rjsf-team.github.io/react-jsonschema-form/docs/quickstart](https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart).

JSON Forms splits the same idea into two artifacts: the JSON schema for "the underlying data to be
shown in the UI (objects, properties, and their types)," and a separate UI schema for "how this data
is rendered as a form, e.g. the order of controls, their visibility, and the layout." Both are
"interpreted during runtime by the framework and mapped to respective UI components, which already
feature data binding, validation etc."
Source: [jsonforms.io/docs](https://jsonforms.io/docs/).

**How a click flows back.** `react-jsonschema-form`'s `Form` takes an `onChange` handler that
receives an event carrying `formData` (`onChange={(e) => setFormData(e.formData)}`), plus
`onSubmit`, `onError`, `onFocus`, and `onBlur`. JSON Forms manages the same binding internally and
exposes the updated data object to the host application; the fetched page did not surface its exact
callback name.
Source: [rjsf-team.github.io/react-jsonschema-form/docs/quickstart](https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart),
[jsonforms.io/docs](https://jsonforms.io/docs/).

**What PostHog already has.** Neither library is in this repo (`rg -i 'react-jsonschema-form|jsonforms' pnpm-lock.yaml` finds nothing as of this research; not independently re-verified beyond the file listing above). The nearest existing pattern is
`QuestionRenderer.tsx` reading a fixed shape from `parseSandboxQuestions` — a hand-rolled, narrow
schema, not a general JSON-Schema-to-form pipeline. A json-schema renderer would let a product declare
a data shape for a follow-up input (e.g. workflow send parameters) without hand-coding a component,
but it still needs something upstream deciding _which_ schema to show for _which_ tool call — the
same gap `json-render`'s catalog fills for open-ended UI.

## Recommendation

Static actions (ticket 80's v1: `insert` / `send` / `run` buttons declared per product) stay a fixed,
closed set: a product names a button, the chat renders it, a click is one of three known contracts.
None of the libraries above are needed for that v1.

The step after static actions is **a typed argument form for a `run` action**, not full generative
UI. Today a `run` action can only fire a canned message; the "Not yet specified" section of ticket 80
already flags that a command needs arguments (a workflow id, in the example) and that argument
sourcing is unresolved. The lowest-risk next step is to let a product pair a `run` action with a JSON
Schema for its arguments (reusing the OpenAPI-derived schemas `tools.yaml` already generates, per
`/implementing-mcp-tools`), and render that schema with `react-jsonschema-form` or JSON Forms inside
the existing `PermissionInput`-style card — same approval gate, same `runStreamLogic` transport, just
a schema-driven form instead of a fixed option list. This is strictly additive to the `ToolRegistryEntry`
shape already in `toolRegistry.tsx` and needs no new transport, no iframe sandbox, and no model-chosen
component catalog.

Full generative UI — a model choosing an arbitrary component and prop tree per turn, the `json-render`
/ Jev pattern — is the right target only once `run` actions commonly need conditional, multi-step
input (the JevForm case: "hundreds of forms with crazy if/then logic"). That is a bigger investment:
it needs a component catalog maintained per product, a guardrail prompt, and a decision on whether
Jev (once access exists, per ticket 80) picks the component or the main model does. MCP Apps'
`ui://` mechanism is the standards-track version of the same idea, already built and working in
external hosts (`services/mcp/src/ui-apps/apps/loops-review.tsx`), but ticket 80's Notes record that
it does not render inside the sandbox thread at all today — porting it in is its own effort, not a
step on top of static actions.
