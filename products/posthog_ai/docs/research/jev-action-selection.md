# Jev for chat action selection

Research for [Silthus/posthog#83](https://github.com/Silthus/posthog/issues/83), part of map [#80](https://github.com/Silthus/posthog/issues/80).

**Question.** After a finished agent turn, can Jev (Typesafe AI) select which actions to offer from a fixed catalog, fast and reliably enough to run on every turn? What is the catalog, and what is the state?

**Short answer.** Jev can rank a catalog of up to 255 options in one call and gate each candidate with a yes/no question. It cannot write a button label, a follow-up prompt, or a workflow id. The full PostHog tool catalog (969 tools) is too large for one choice question, so a pre-filter is needed in any case. A per-tool `offer_after` declaration in `tools.yaml` plus the run's tool-call list shrinks the candidate set to a handful, at which point Jev is optional. Recommendation: declare, filter in code, and add Jev only as a relevance gate if the declared set over-offers. The experiment to settle it is a 30-turn offline script.

## The API as it is

**Endpoint and auth.** `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer <API_KEY>` and a JSON body. Keys come from `https://console.typesafe.ai/keys` ([quickstart](https://docs.typesafe.ai/introduction/quickstart), [api](https://docs.typesafe.ai/api)). The pages fetched for this note do not describe a waitlist or an early-access form. The map records early access as of September 2026; nothing in the docs contradicts or confirms it.

**Request.** `state` (string, object, or array of text), `model` (`jev-latest` resolves to `jev-1.13.0`), and `questions`, a map of user-named questions. Each question has `type`, `instructions`, and `criteria` ([api](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models)).

- `choice`: `criteria` is a map of option name to description. Max 255 options. The answer carries `choice`, `probabilities` (sum to 1), and `confidence` (0 to 1) ([primitives/choice](https://docs.typesafe.ai/primitives/choice)).
- `noul`: a yes/no question. Optional `criteria` with `true` and `false` descriptions. The answer is one number, the probability of yes ([primitives/noul](https://docs.typesafe.ai/primitives/noul)).
- `score`: 2 to 10 ordered levels ([api](https://docs.typesafe.ai/api)). Not needed here.

Descriptions and instructions accept JSON structure, so an option can carry `what`, `not_for`, and `examples` fields ([primitives/advanced](https://docs.typesafe.ai/primitives/advanced)). Instructions can point at a state field with a backtick path such as `` `run.final_message` `` ([primitives](https://docs.typesafe.ai/primitives)).

**Response.** `model`, `answers` keyed by question id, and `usage` with `input_tokens` and `output_tokens` ([api](https://docs.typesafe.ai/api)).

**Parallelism.** Every question in a request sees the same state and is evaluated in parallel. Adding questions "usually has little effect on response time" ([primitives](https://docs.typesafe.ai/primitives), [patterns/fan-out](https://docs.typesafe.ai/patterns/fan-out)).

**Limits.** 64k tokens per request; 32k tokens for `state` plus the longest question. Rate limit 250,000 tokens per second and 1,200 requests per minute, marked as adjusting dynamically ([models](https://docs.typesafe.ai/models)). No documented limit on the number of questions.

**Pricing.** Input $0.042 per million tokens. Output is free ([models](https://docs.typesafe.ai/models)).

**Latency.** The API and models pages give no latency numbers. The skill-suggestion cookbook measures about 0.31 s for a 182-option ranking and 0.09 to 0.12 s for a 3-option rerank ([cookbooks/skill_suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion)).

**Confidence.** A statistic of the probability distribution: 1.0 when all mass sits on one option, near 0 when flat. Suggested bands: below 0.5 do not act, 0.5 to 0.9 proceed with caution, above 0.9 act automatically. No calibration numbers are published ([confidence](https://docs.typesafe.ai/confidence)).

**Errors.** 401, 422, 429, 529. The docs recommend exponential backoff on 429 and 529 ([api](https://docs.typesafe.ai/api)).

**SDKs.**

- Python: `typesafe-sdk`, `TypeSafeClient` and `AsyncTypeSafeClient`, helpers `Noul(...)`, `Choice(...)`, `Score(...)`, answers under `response.nouls`, `response.choices`, `response.scores` ([sdk/python](https://docs.typesafe.ai/sdk/python)).
- JavaScript: `@typesafe-ai/sdk`, `new TypeSafeClient()`, `client.systemOne({ state, questions })`, helpers `choice(instructions, criteria)`, `noul`, `score`. Requires Node 20 or newer. The page does not claim browser or edge support ([sdk/javascript](https://docs.typesafe.ai/sdk/javascript), [choice()](https://docs.typesafe.ai/sdk/javascript/api/functions/choice)).

**Which side of PostHog calls it.** The bearer key must stay server side, and the JavaScript SDK targets Node, so the browser is out. The sandbox runtime has no Cloudflare worker: the agent runs in a Modal sandbox (Docker locally) driven by a Temporal workflow (`products/tasks/backend/temporal/process_task/README.md:92`). The turn end reaches Django through the `agent_state_changed` signal on that workflow (`products/tasks/backend/temporal/process_task/workflow.py:3310`). Two viable callers: a Python activity or Django code that runs after that signal, with `typesafe-sdk`; or `services/mcp` (Node), which already owns the tool catalog. Django is the simpler first home because it also owns the persisted conversation.

**Known weaknesses of jev-1.13.** Literal reading of instructions, unreliable counting and date comparison, weaker on double negatives, "accuracy falls as the state grows with content unrelated to the decision," no hostility toward injected instructions in state, and no text generation ([model-jaggedness/jev-1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13)). The last two matter here: the final assistant message contains user-derived content, and the answer must not be asked to produce text.

## The two cookbooks

**Skill suggestion** ([cookbooks/skill_suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion)). The problem is the same shape as ours: a large roster (182 skills in 33 categories), short index descriptions (about 54 characters, max 60), and an agent that picks wrong or picks when nothing applies. The recipe is two requests. Request one: a `choice` over all 182 skills plus three `noul` gates ("is the assistant being asked to act on files, accounts, devices, or services?", "would an expert consult documented procedures?", and an inverted "could a generalist answer in prose?"). The mean of the gates must exceed 0.30 or nothing is suggested. Request two: a `choice` over the top 3 with 700-character excerpts, plus one `noul` per candidate ("does it fit?"), best must exceed 0.30. State is `{"request": ..., "recent_context": ""}`. Result on 488 requests: wrong loads 16.8% to 7.3%, needless loads 9.8% to 4.0%. Caveats the page states: one choice handles 182 options; larger rosters need chunking and a rerank across chunk winners; a wrong suggestion is "more persuasive than no suggestion."

What transfers: the two-stage rank-then-gate, the "none" gate before offering anything, the short-description catalog, and the threshold-based abstain. What does not: the cookbook classifies an incoming request before the agent works. We classify after the agent has finished, so the state is the answer and the tool-call list, not a user request. That is a closer fit for noul gates ("did the answer leave this step undone?") than for a wide ranking.

**Function calling** ([cookbooks/function_calling](https://docs.typesafe.ai/cookbooks/function_calling)). One `choice` picks the function from ten. Arguments are filled only when they are closed sets: a `Literal` gets a `choice`, a `list[Literal]` gets one `noul` per value, a boolean gets a `noul`. "Free text, numbers, and dates receive no questions and retain function defaults." Confidence of the call is the weakest of its judgments; the 14 test commands scored 0.53 to 1.00.

What transfers: picking the tool is a closed set, and a boolean like "send to my own address" is a noul. What does not: a workflow id, an email address, or a prompt string is open. Those must come from the run's tool calls, from attached context, or from the main model. This confirms the map's note: Jev selects, it does not author.

## The catalog

**Counts** (this repo, HEAD `f637db96f1f`, counted with a script over `products/*/mcp/tools.yaml`):

| Set                                                                                    | Count                          |
| -------------------------------------------------------------------------------------- | ------------------------------ |
| `tools.yaml` files                                                                     | 56                             |
| Tool entries across them                                                               | 2,019                          |
| Entries with `enabled: true`                                                           | 836 (428 read-only, 408 write) |
| Tools in `services/mcp/schema/generated-tool-definitions.json`                         | 919                            |
| Tools in `services/mcp/schema/tool-definitions-all.json` (generated plus hand-written) | 969                            |
| Workflows tools in the combined file                                                   | 30                             |

The generated count exceeds the enabled count because `confirmed_action` emits a `-prepare` and `-execute` pair and `wrappers` add query tools (`services/mcp/scripts/yaml-config-schema.ts`, `products/replay/mcp/tools.yaml:172`). Hand-written tools live under `services/mcp/src/tools/` and register in `services/mcp/src/tools/index.ts`. `workflows-enable`, `workflows-disable`, and `workflows-archive` are hand-written in `services/mcp/src/tools/workflows/lifecycle.ts:29`, not in `tools.yaml`. The map's note that Workflows "has `workflows-enable` and `workflows-publish` as separate tools" holds, but only one of the two is YAML-declared. A declaration scheme must cover both sources, or the combined JSON must be the source of truth.

**Sizes.** Full descriptions average 695 characters (674k characters across 969 tools). `summary` averages 27 characters, max 91; `title` averages 25. At roughly four characters per token, the full catalog is about 170k tokens, far over the 32k state budget. The whole catalog as one `choice` also exceeds the 255-option cap by almost four times.

**Candidate set per turn.** Three options, in order of size:

1. Every enabled tool: 836 to 969. Needs chunking into at least four choice questions plus a rerank, and summaries instead of descriptions. The cookbook warns rosters over 182 need this. Not attractive on every turn.
2. Tools in the same product categories as the tools the run called. For the workflow case that is 30 tools, well under 255, with full descriptions at about 25k characters (about 6k tokens). Fits in one request.
3. Tools a product declares as follow-ups of a called tool. For `workflows-create` the product already says in prose: test with `workflows-test-run`, then `workflows-enable` with explicit approval, then `workflows-publish` for later edits (`products/workflows/mcp/tools.yaml:147-149`). That is three candidates.

**Can a per-tool "offer after" field be declared.** Yes. `ToolConfigSchema` in `services/mcp/scripts/yaml-config-schema.ts` is a strict Zod object, so an unknown key fails validation today, and a new optional key such as `offer_after: string[]` (or `follow_ups`) is a one-line schema addition. Precedents for per-tool metadata that codegen copies into `tool-definitions-all.json`: `system_prompt_hint` (24 uses) and `agent_note` (17 uses), written into the definitions by `services/mcp/scripts/generate-tools.ts:2049`. A `superseded_by: string[]` field already carries tool-name references between entries, so a name-list field has a pattern to copy. Hand-written tools would declare the same field on their `ToolBase`.

**Does the declaration make Jev unnecessary.** For the declared case, mostly. With three candidates and the run's tool-call list, code can drop what the run already did (`workflows-test-run` appears in the calls, so do not offer it) with no model. What code cannot judge is whether the answer still wants the step: an agent that tested and then reported a failure should not offer "Enable". That is one noul per surviving candidate, and it is the one place Jev earns a call in the declared path.

## The state

**What the question sees.** State is a string, object, or array of text; no images ([concepts/state](https://docs.typesafe.ai/concepts/state)). The docs recommend an object with named fields. For a turn:

```json
{
  "final_message": "<assistant markdown, 4,000 chars>",
  "tool_calls": [
    { "tool": "workflows-create", "ok": true },
    { "tool": "workflows-test-run", "ok": true }
  ],
  "attached_context": [{ "type": "workflow", "key": "..." }]
}
```

Attached context items are references, not payloads (`products/posthog_ai/README.md`, Seam 1), so they stay small. The final message is untrusted text; jev-1.13 does not treat injected instructions as hostile, so the instructions should name the field they judge and the frontend must not act on a pick without the same approval gate a typed request gets.

**Does it fit.** A 4,000-character answer is about 1,000 tokens. A 200-entry catalog with 60-character summaries is about 12,000 characters, about 3,000 tokens. Together about 4,000 tokens, an eighth of the 32k budget ([models](https://docs.typesafe.ai/models)). With full 695-character descriptions, 200 entries are about 35k tokens and do not fit. So the wide-ranking stage must use summaries, and full descriptions belong only in a rerank over a shortlist, as the cookbook does. Cost per turn at 4,000 input tokens: about $0.00017.

**What the state cannot supply.** The workflow id for "Enable the workflow". It sits in the `workflows-create` result. The frontend already resolves tool names and completions on the tool stream (`useToolStreamListener`, README Seam 3), so the id can be read from the run's tool results in code, without any model.

## The alternative

The main model already writes the "things I did not do" bullets. A trailing structured block in the final message (or a dedicated end-of-turn tool the agent calls) would carry `{ kind: "command" | "follow_up", tool, args, label }` and the id it already knows.

Where the main model wins:

- It can author the label and the follow-up prompt. Jev cannot ([introduction](https://docs.typesafe.ai/introduction): "No text generation").
- It can carry open arguments: the workflow id, an address, a date.
- It knows why it stopped. Jev infers that from prose.
- One model, no new vendor, no new key, no new failure mode.

Where Jev wins:

- No prompt change to the sandbox agent. The catalog and the questions live in PostHog code; the same run gets buttons without a system-prompt edit.
- Determinism and calibration. A probability per option and a confidence number, versus a block the model may skip, misformat, or pad.
- Latency and cost: about 0.3 s and a fraction of a cent, after the turn, off the critical path of the answer.
- Independence. A classifier that never saw the agent's prompt cannot be talked out of a suggestion by the agent's own framing. It can, however, be steered by injected text in the answer.

The honest comparison: the structured block costs a prompt change and a parser, and its reliability depends on the agent. Jev costs a vendor and only answers "which" and "whether". A command button needs "which", "whether", and "with what arguments". Jev cannot do the third, and the declaration plus the tool-call list can do the first two without Jev in the common case.

## Recommendation

1. Declare follow-ups next to the tool. Add an optional `offer_after` list to `ToolConfigSchema` and to hand-written `ToolBase` entries, and emit it into `tool-definitions-all.json`. Start with `workflows-create` offering `workflows-test-run` and `workflows-enable`.
2. Filter in code. After `agent_state_changed(agent_active=False)`, take the union of `offer_after` for the tools the run called, drop tools the run already called, and read arguments such as the workflow id from the matching tool result.
3. Hold Jev in reserve as a relevance gate, one noul per surviving candidate over `{final_message, tool_calls}`, with the abstain threshold from the cookbook (0.30). Add it only if step 2 over-offers on real runs.
4. Keep free-text follow-ups with the main model. If a "Fire a real send" button needs an address the run did not produce, it is a follow-up prompt that fills the composer, not a command.

**Smallest experiment that settles it.** Collect 30 finished sandbox turns that called at least one workflows tool, including the run from the screenshot. For each, a person labels which of the 30 workflows tools should be a button (or none). One Python script with `typesafe-sdk` sends each turn as `{final_message, tool_calls}` and asks: one `choice` over the 30 workflows tools plus `none` (summaries as descriptions), and one `noul` per declared follow-up ("The assistant left this step undone and the user should do it next"). Record the pick, the noul values, the confidence, and the wall time. Pass criteria: the declared-plus-filtered set matches the labels on at least 27 of 30 turns without Jev; if it does not, Jev's nouls at 0.30 must lift it to 27 with p95 under 500 ms. The first outcome means ship the declaration and skip Jev. The second means add the gate. Neither outcome needs a prompt change or a frontend.

## Sources

- https://docs.typesafe.ai/llms.txt
- https://docs.typesafe.ai/introduction
- https://docs.typesafe.ai/introduction/quickstart
- https://docs.typesafe.ai/primitives
- https://docs.typesafe.ai/primitives/choice
- https://docs.typesafe.ai/primitives/noul
- https://docs.typesafe.ai/primitives/advanced
- https://docs.typesafe.ai/concepts/state
- https://docs.typesafe.ai/confidence
- https://docs.typesafe.ai/patterns/fan-out
- https://docs.typesafe.ai/patterns/intent-routing
- https://docs.typesafe.ai/cookbooks/skill_suggestion
- https://docs.typesafe.ai/cookbooks/function_calling
- https://docs.typesafe.ai/api
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/sdk/javascript
- https://docs.typesafe.ai/sdk/javascript/api/functions/choice
- https://docs.typesafe.ai/sdk/python
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
- `products/*/mcp/tools.yaml`, `services/mcp/scripts/yaml-config-schema.ts`, `services/mcp/scripts/generate-tools.ts`, `services/mcp/schema/tool-definitions-all.json`, `services/mcp/src/tools/workflows/lifecycle.ts`, `products/workflows/mcp/tools.yaml`, `products/tasks/backend/temporal/process_task/workflow.py`, `products/tasks/backend/temporal/process_task/README.md`, `products/posthog_ai/README.md`
