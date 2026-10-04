# What a decision sees, and how it stays safe

Research for [Silthus/posthog#243](https://github.com/Silthus/posthog/issues/243), part of the map "AI decisions in workflows" ([#240](https://github.com/Silthus/posthog/issues/240)).
Code citations point at upstream `master` at `39cc02e`.
"TypeSafe docs" means the public System One documentation at <https://docs.typesafe.ai>.
TypeSafe serves its own Jev build, and the AI gateway serves PostHog-hosted JevK5 (`posthog/llm/system_one_client.py:1-8`).
So the docs describe the shared protocol and design guidance, not JevK5's measured behavior.

## Recommendation in one screen

- **State is author-picked.** A "Context" dictionary input: each row is a field name the author chooses and a Hog-templated value (`{event.properties.message}`, `{person.properties.plan}`, `{variables.score}`).
  The step sends the rows as one JSON object.
  No "send everything" default: an event trigger pre-fills `event: {event.event}`, and the description asks for the fields the question is about.
- **State cap: 8 KiB of compact JSON, not 65,536 characters.** The deployed model has an 8,192-token cap (`products/signals/backend/temporal/report_safety_judge.py:27-28`), which 65,536 characters can exceed.
  Over the cap, the step fails with a run-log error that names the limit. Never truncate.
- **Instructions are author text only.** The "Question" input has no templating and no `{` autocomplete. The route wraps it as `{"question": <author text>, "data": "Answer about the fields in state."}`.
  For a function-template step, `templating: false` alone is not a guarantee: the inputs serializer keeps a client-sent `templating: "liquid"` (see [The gap](#the-gap-templating-false-is-a-ui-convention)).
- **Options** are a dictionary: option name, then when it applies. 2 to 16 options, 500 characters per name or description. The option name is the branch label and the stored value.
- **Yes/no threshold:** "Answer yes at or above N%", default 50%, any value from 1 to 99. JevK5 compresses some scales, so a useful yes bar can sit below 50%.
- **Unsure is an optional, first-class branch**, off by default. When on, pick-one goes to Unsure below a minimum top probability, and yes/no goes to Unsure between a "no at or below" value and the yes threshold.
- **Privacy:** always `privacy_mode=True`. Check `is_ai_data_processing_approved` on every run. Hide the step where decisions are unavailable or the flag is off. Show it disabled, with the reason, where the org has not approved AI data processing.
- **Fit:** narrow, typed judgments about text the person or event carries: intent, topic, sentiment, safety, fit to a described rubric. Not counting, arithmetic, aggregation over events, or writing text.

The full contract is in [Recommended contract](#recommended-contract).

## What the step can read at run time

A function step's Hog runs with `event`, `person`, `groups`, and `variables` as globals (`nodejs/src/cdp/services/hogflows/actions/hog_function.ts:354-359`, `nodejs/src/cdp/services/hogflows/hogflow-functions.service.ts:102-115`; type at `nodejs/src/cdp/types.ts:89-130`).

| Source             | Reachable as                                                                | Notes                                                                                                                                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger event      | `event.event`, `event.properties.*`, `event.distinct_id`, `event.timestamp` | Real only for event, webhook and tracking-pixel triggers. A `batch` trigger is an audience of persons, and a `schedule` trigger is person-less (`products/workflows/skills/building-workflows/references/graph-schema.md:74-75`).                                                                                          |
| Person             | `person.properties.*`                                                       | The person read at dequeue. Only `wait_until_condition` refreshes it (`nodejs/src/cdp/services/hogflows/actions/conditional_branch.ts:85-104`), so a property an earlier step wrote through `$set` can be stale.                                                                                                           |
| Groups             | `groups.<type>.properties.*`                                                | Forwarded to function steps (`nodejs/src/cdp/services/hogflows/actions/hog_function.test.ts:244-254`).                                                                                                                                                                                                                     |
| Workflow variables | `variables.*`                                                               | The only channel for earlier steps' outputs: a step writes them through `output_variable`. All variables together are capped at 5,120 bytes (`nodejs/src/cdp/services/hogflows/hogflow-executor.service.ts:947-962`). The `actions` global in the type (`nodejs/src/cdp/types.ts:128-144`) is not populated for workflows. |

So "earlier steps' outputs" means "workflow variables". They are small by construction, which makes them the cheapest state to add.

## State

### Author-picked, not a default bundle

The author picks every field. The step sends no default set.

- **Cost.** The gateway bills on input tokens: "Tokens the model read, which is what the request is billed on" (`products/ml_inference/backend/presentation/serializers.py:124`). Person property bags carry many `$initial_*` and `$geoip_*` keys that a question never needs.
- **Accuracy.** TypeSafe says to pass only the relevant context and to avoid "distractions and context rot" ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)).
- **Trigger shape.** No single default fits every trigger: a batch run has no meaningful event, and a schedule run has no person (table above).
- **Prior art.**
  - PR [#107832](https://github.com/PostHog/posthog/pull/107832) used a `context` input of type `json`, defaulting to `{subject: '{event.properties.subject}', message: '{event.properties.message}'}` (its `posthog-jev-classify.template.ts`).
  - HogQL `decide()` sends one author-chosen expression per row (`posthog/hogql/transforms/prompt_jev.py:155-166`).
  - Every existing PostHog caller builds a small, purpose-made state: a search string, a stack trace capped at 2,000 tokens, observation text cut to 500 characters, a 2,000-character signal record (`products/replay_vision/backend/search_rerank.py:59-60`, `products/error_tracking/backend/temporal/lifecycle/issue_created/activities.py:63`, `products/signals/backend/emission/pipeline.py:61`).

### Shape: a named object

Send state as a JSON object whose keys are the author's field names.

- TypeSafe recommends objects "so each part of the state has a descriptive name and its relationships remain clear" ([state](https://docs.typesafe.ai/concepts/state)). A question points at a field by name in backticks ([API](https://docs.typesafe.ai/api)).
- Named keys let the question say "the `message`", which a flat string cannot.
- Replay Vision rerank uses the same pattern: `{"search": q, "observations": {...}}`, and the question names `observations.o3` (`products/replay_vision/backend/search_rerank.py:35-37,57-60`).

The input is a `dictionary` with Hog templating, so `{person.properties}` can still insert a whole object when an author wants it. A value that renders to an object stays an object.

### Size

- **The model cap is 8,192 tokens.** Signals chunks report text at 6 KiB, "A UTF-8 byte can become one token, so this leaves room under the deployed model's 8,192-token cap for framing" (`products/signals/backend/temporal/report_safety_judge.py:27-28`).
- **The 65,536-character cap is an API guard, not a fit guarantee.** It lives in the presentation serializer (`products/ml_inference/backend/presentation/serializers.py:9,76-79`). The facade's `DecisionRequest.state` is an unbounded `JsonValue` (`products/ml_inference/backend/facade/contracts.py:13,64`). A workflow route that calls the facade must enforce its own cap. PR #107832 copied the 65,536 figure.
- **HogQL `decide()` caps each input at 8 KiB** and a batch at 32 KiB (`posthog/hogql/transforms/prompt_jev.py:44-46,218-219`).
- **An oversized request comes back as a 4xx.** Replay Vision treats 400, 413 and 422 as request faults that a retry cannot fix (`products/replay_vision/backend/jev_watch_feed.py:70,310`).

Recommendation:

- Cap rendered state at 8,192 bytes of compact UTF-8 JSON, the HogQL per-input figure. With a 2,000-character question and typical option text, this keeps a request under the token cap.
- Check the cap before the call, and fail with a terminal, non-retried run-log error that names the limit. Map a gateway 400, 413 or 422 to the same kind of error.
- Do not truncate. A truncated field silently changes what the question is about, and person properties grow over time, so the failure must be loud.
- The test panel shows the rendered state and its size.

## Instructions

### Author text only

`posthog/llm/system_one.py:8-9` states the rule: "Keep user text in `state` and refer to it from the instructions by name. Never interpolate it into `instructions`, so user text cannot become an instruction."

Callers that take a question from a person follow it:

- HogQL `decide()` requires the question to be a non-empty string literal (`posthog/hogql/functions/prompt_jev.py:69-78`), and options to be string literals (`:95-109`). The runner wraps it as `{"input": "Evaluate only the text in state.row_N.", "question": <literal>}` (`posthog/hogql/transforms/prompt_jev.py:160-166`).
- PR #107832 set `templating: false` on `question` and `categories`, with the comment "Event data goes in the context, so it can never become part of the instructions". It passed only those two into `ChoiceQuestion` (its template and `workflow_classifications.py`). An external review on the PR confirmed the separation.
- Replay Vision keeps session prose in state, and the instructions "refer to it by observation id only" (`products/replay_vision/backend/jev_watch_feed.py:107-111`).

Option descriptions travel in `criteria`, which the model reads as part of the question, so they follow the same rule.

### The gap: `templating: false` is a UI convention

For a function-template step, `templating: false` in `inputs_schema` does not stop a rendered value:

1. `InputsItemSerializer` accepts a client-sent `templating` of `hog` or `liquid` on any input (`posthog/cdp/validation.py:659-662`).
2. When the schema says `templating: False`, the serializer skips transpiling. It also leaves the client's `templating` value in place (`posthog/cdp/validation.py:819, 932-938`).
3. The worker renders any input whose `templating` is `liquid` (`nodejs/src/cdp/services/hog-inputs.service.ts:48-52`).

So a hand-built API or MCP payload can make the question render `{{ person.properties.bio }}` into the instructions.
The person who does this is a workflow editor, not the data subject, so this is a footgun rather than a privilege escalation. It still breaks the guarantee the step advertises.

Close it in one place:

- **Native action type:** the question and options live in the action config, which the executor never templates. Nothing else is needed.
- **Function template:** the Django route reads the question and options from the saved action, or the hog flow serializer rejects a `templating` value on those inputs. Do not trust the worker-rendered value.

### How the builder makes it clear

- Label the input "Question" and give it no `{` autocomplete. Description: "Write the question in plain words. Jev reads person and event data from Context, not from here."
- Put Context directly under the question. Description: "The data Jev reads to answer. Refer to a field by its name, for example `message`."
- TypeSafe puts field paths in backticks inside the question ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)); the placeholder does the same.
- Limit: 2,000 characters (`products/ml_inference/backend/presentation/serializers.py:10,51-54`).

## Options

### Pick one

- A dictionary input: the key is the option name, the value is "when this applies".
- 2 to 16 options. The gateway's JevK5 "answers with one letter per option, A to P" (`products/ml_inference/backend/facade/contracts.py:38-39`, `posthog/llm/system_one_client.py:40-42`). HogQL `decide()` enforces the same range (`posthog/hogql/functions/prompt_jev.py:8,114-117`). The protocol allows 255 ([choice](https://docs.typesafe.ai/primitives/choice)), so 16 is the gateway model's limit.
- At most 500 characters per name or description (`products/ml_inference/backend/presentation/serializers.py:11,36-39`).
- Descriptions are optional on the wire: a criteria value may be `None` (`posthog/llm/system_one.py:65-78`). Still, TypeSafe says names and descriptions both reach the model, so "write descriptions that separate the options from each other". It also suggests an `other` or `none of the above` option when the list may not cover every input ([choice](https://docs.typesafe.ai/primitives/choice)). Emoji search and signals both carry a `none` option (`posthog/emoji_search/match.py:88,103`, `products/signals/backend/system_one_decision.py:61-62`).
- Pre-fill two rows with descriptions, and suggest an "Other" row in the description.
- The option name is the branch label and the value written to the decision variable, so it must be unique and stable. Renaming an option is an edit to the branches.

### Yes or no

- One question. The answer is the probability of yes (`posthog/llm/system_one.py:45-62`, [noul](https://docs.typesafe.ai/primitives/noul)). A noul answer has no `confidence` field ([API](https://docs.typesafe.ai/api)).
- Optional "What yes means" and "What no means" map to `criteria: {"true": ..., "false": ...}` (`posthog/llm/system_one.py:45-62`). TypeSafe: add them "when the boundary is subtle", and test with and without ([noul](https://docs.typesafe.ai/primitives/noul)). Taxonomic event match and search rerank set them (`posthog/taxonomic_search_intent/event_match.py:78-83`, `products/replay_vision/backend/search_rerank.py:35-37`).
- The facade accepts a dict for a noul question but does not check its keys (`products/ml_inference/backend/facade/contracts.py:55-56`), so the route builds exactly `true` and `false`.
- Description hint: "Ask one thing. Phrase it so that yes is the case you act on." Both are TypeSafe rules ([noul](https://docs.typesafe.ai/primitives/noul)).

### The yes/no threshold

Thresholds are per question in every caller, and they spread widely:

| Caller                      | Yes at | Source                                                         |
| --------------------------- | ------ | -------------------------------------------------------------- |
| Replay "What to watch" feed | 0.3    | `products/replay_vision/backend/jev_watch_feed.py:75-82`       |
| Navbar app ranking          | 0.5    | `frontend/src/layout/panel-layout/navbar/tabs/appRanking.ts:8` |
| Taxonomic event match       | 0.7    | `posthog/taxonomic_search_intent/event_match.py:35`            |
| Signal safety               | 0.90   | `products/signals/backend/temporal/safety_filter.py:111`       |

The 0.3 comes with a calibration note: "JevK5 compresses the scale: it scores sessions with real friction near 0.3 and routine sessions near 0.1, so a higher bar empties the tier" (`products/replay_vision/backend/jev_watch_feed.py:75-82`).
TypeSafe's guidance: "Use 0.5 when yes and no are equally easy to act on. Raise it when acting on a false yes is expensive" ([noul](https://docs.typesafe.ai/primitives/noul)).

Recommendation: a "Answer yes at or above N%" input, default 50%, accepting 1 to 99.
A range that starts at 50% would rule out the watch-feed shape. The raw probability is always written to a variable, so a `conditional_branch` can express any other rule.

## Low confidence

### What "confidence" means

- TypeSafe defines choice confidence as `(p_max - 1/n) / (1 - 1/n)`: 0 for an even spread, 1 for all mass on one option ([confidence](https://docs.typesafe.ai/confidence)). The ml_inference serializer describes the field the same way: "How far the chosen option stands out from the rest, from 0 (a coin flip) to 1" (`products/ml_inference/backend/presentation/serializers.py:107-110`).
- PR #107832 described the same field as "The model's probability for the chosen category" (its `WorkflowClassificationResponseSerializer`). That is a different number: with 4 options and `p_max = 0.4`, confidence is 0.2.
- The Go gateway is a separate repository, so JevK5's exact formula is not visible here. Treat it as unverified.

Recommendation: base the author's certainty on `probabilities[choice]`, the top option's probability. The step can read and explain it, and it does not shift when the author adds an option. TypeSafe lists "the top probability, with a threshold set per question" as a valid alternative ([confidence](https://docs.typesafe.ai/confidence)).

### Unsure is an optional, first-class branch

| Choice                                                              | For                                                                                                                                                                                                                                                                                                                                                                            | Against                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| First-class "Unsure" branch, shown only when the author turns it on | Matches the protocol's guidance: "Escalate uncertain cases to a person" ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)), "Values in the middle can go to a person rather than either code path" ([noul](https://docs.typesafe.ai/primitives/noul)), "Don't guess" ([confidence](https://docs.typesafe.ai/confidence)). Visible on the canvas. | One more branch slot.                                                                                            |
| Fall through to a default branch                                    | No new slot.                                                                                                                                                                                                                                                                                                                                                                   | The canvas cannot show which edge catches doubt. An author misreads "Other" as "unsure".                         |
| Nothing; the author branches on a confidence variable               | Zero new surface.                                                                                                                                                                                                                                                                                                                                                              | Every careful author rebuilds the same pattern with a `conditional_branch`, and the default acts on a coin flip. |

Recommendation: the first row, off by default, so the simple case keeps 2 to 16 edges. Turning it on adds exactly one edge, labeled "Unsure":

- Pick one: "Only pick when the top option is at least N% likely". Below that, Unsure.
- Yes or no: a second value, "Answer no at or below M%", under the yes threshold. Between M and the yes threshold, Unsure. This is TypeSafe's band example, with no at 0.2 and yes at 0.8 and review in between ([noul](https://docs.typesafe.ai/primitives/noul)).

Existing callers show both habits.
Taxonomic search intent acts only above confidence 0.6 and otherwise does nothing (`posthog/taxonomic_search_intent/prompt.py:63-64`, `posthog/taxonomic_search_intent/classify.py:200-208,262`).
Error tracking severity applies the top choice with no threshold and only logs confidence (`products/error_tracking/backend/temporal/lifecycle/issue_created/activities.py:240-249`).
A workflow sends messages and writes properties, so the default should be the second habit and the careful path one toggle away.

### Calibration

- TypeSafe's build guide calls its probabilities calibrated ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)). Its confidence page makes no calibration claim and says thresholds depend on "the performance of the model for your use case" ([confidence](https://docs.typesafe.ai/confidence)).
- "API compatibility does not guarantee equivalent judgments or calibration across models" (`docs/internal/ai-observability-judge-inputs.md:110`).
- JevK5 compresses at least one scale (watch feed note above).

So the step records the probabilities on every run (decision variable plus run log), and the description says "Start strict, then adjust after you see real answers."

## Privacy

### `privacy_mode`: always on

- The facade field: "The gateway records the request state and answers into the internal AI observability project unless asked not to. Set this when the state carries customer content." (`products/ml_inference/backend/facade/contracts.py:72-74`). It becomes the `X-PostHog-Privacy-Mode: true` header (`products/ml_inference/backend/logic/decisions.py:110-111`).
- A signals comment says the opposite, "the Go gateway stores no input" (`products/signals/backend/temporal/safety_filter.py:291-292`). The gateway is a separate repository, so neither claim is checkable here. The flag costs nothing, so set it regardless.
- Replay Vision's watch feed sets it, "the same rule every other Replay Vision LLM call follows" (`products/replay_vision/backend/jev_watch_feed.py:240-251`). It is the only System One caller that does.
- `build_system_one_client` has no privacy parameter and sends no privacy header (`posthog/llm/system_one_client.py:69-93,154-192`). PR #107832 used it, so it sent ticket content without privacy mode. A new route must use the facade with `privacy_mode=True`.
- A workflow decision's state is person and event data every time, so there is no author toggle.

### What lands in traces

- The request carries `X-PostHog-Properties` (labels plus `ai_product`), `X-PostHog-Product`, `X-PostHog-Trace-Id` and `X-PostHog-Distinct-Id` (`posthog/llm/gateway_client.py:285-307`). The facade forces `team_id` into the properties, so billing reaches the customer (`products/ml_inference/backend/logic/decisions.py:99-100`).
- Without privacy mode, state and answers go to PostHog's internal AI observability project (facade comment above), not the customer's project. With privacy mode, what the gateway still records (token counts, model, latency, labels) is decided in the gateway and is not verifiable here.
- Nothing lands in the customer's own LLM analytics from this path. The "Generate text" spec gets team-side traces from the instrumented OpenAI SDK (spec [#22](https://github.com/Silthus/posthog/issues/22), Billing). The System One facade has no such client. The author's view of a decision is the run log and the decision variable.
- Never log state or a gateway error body; both can echo customer data. Existing callers log only the status (`products/ml_inference/backend/presentation/views.py:84-85`, `posthog/hogql/transforms/prompt_jev.py:170-177`, `products/signals/backend/system_one_decision.py:484-488`).
- Labels to send: `ai_product="workflows"`, properties `hog_flow_id` and the action id, `trace_id` = the invocation id. Spec #22 settled one trace per workflow run for Generate text. Without a trace id the gateway stamps a fresh one per request (`posthog/llm/gateway_client.py:336-337`).

### AI data processing approval

- `decide()` checks region, `organization.is_ai_data_processing_approved`, and the `ml-inference-decisions` flag (`products/ml_inference/backend/logic/decisions.py:43-69`). `decide_when_available()` checks region only and leaves the gate to the caller (`products/ml_inference/backend/facade/api.py:30-38`).
- A workflow step owns its own flag, so it calls `decide_when_available()` and checks approval itself on every run. PR #107832 returned a 403 that failed the step with "Approve it in organization settings". Replay Vision checks approval in its sweep (`products/replay_vision/backend/temporal/jev_watch_rank/activities.py:146-150`).
- Approval can be withdrawn after a workflow goes live, so a save-time check is not enough.
- The field defaults to `True` for new organizations (`posthog/models/organization.py:250`).
- The settings switch reads "Enable PostHog features that use third-party AI services" (`frontend/src/scenes/settings/organization/OrgAI.tsx:20`), and its tooltip lists Alphabet, Anthropic, Microsoft, and OpenAI (`frontend/src/scenes/settings/organization/aiConsentCopy.tsx:6-7`). PostHog-hosted Jev is not named. Every gated Jev caller still treats this switch as the gate. The workflow step follows that precedent; the copy mismatch is a separate question for the AI platform owners.

Builder visibility:

- Region without decisions (self-hosted, or `decisions_available_here()` false): hide the step.
- Flag off: hide the step.
- Org not approved: show the step disabled, with the reason and the path to approval. The frontend already exposes `dataProcessingAccepted` (`frontend/src/scenes/settings/organization/aiConsentLogic.ts:181-185`) and a consent popover (`frontend/src/scenes/settings/organization/AIConsentPopoverWrapper.tsx:32-36`). Members can ask admins through `request_ai_access` (`posthog/api/organization.py:697-720`).
- A saved step in an org that later withdraws approval fails at run time with a terminal, non-retried error that names the setting.

## What Jev is good at

From the TypeSafe build guide ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)):

- Good: "common-sense judgments over unstructured data", answers constrained to the supplied options, fast (about 100 ms), stable across repeats, outputs that "drive smart `if` statements, thresholds, and comparisons".
- Its most important rule: "Ask the most explicit, narrow, specific, atomic questions you can." Broad questions hide several judgments behind one answer.
- Not for: generation ("It does not generate code or choose its own next action"), deterministic work ("Keep deterministic work in code"; its invoice example does the date math in code), and current facts from model weights.
- State is text only; images, audio, and video are not supported. CJK and other languages "currently have lower accuracy" ([state](https://docs.typesafe.ai/concepts/state)).
- "System One answers contain no written reasoning" (`docs/internal/ai-observability-judge-inputs.md:119`), so the run log can show what Jev decided, never why.

What PostHog's callers ask: every production caller asks a narrow question about one short, purpose-built piece of text.

- Error tracking: "How severe is this error for the people using the application?", four described levels over a capped stack trace (`products/error_tracking/backend/logic/severity_inference.py:24-34,55-69`).
- Signals: is a record actionable under a stated policy, and is content safe, with a choice over six described safety categories (`products/signals/backend/system_one_decision.py:61-68,232-241`).
- Replay Vision: does an observation match a search, and is a session worth watching (`products/replay_vision/backend/search_rerank.py:35-37`, `products/replay_vision/backend/jev_watch_feed.py:111-124`).
- Taxonomic search: which filter tab a typed search wants, and which core event it names (`posthog/taxonomic_search_intent/prompt.py:41-62`, `posthog/taxonomic_search_intent/event_match.py:78-83`).
- Emoji search and navbar app ranking: relevance of catalog items to a short query (`posthog/emoji_search/match.py:75-107`, `frontend/src/layout/panel-layout/navbar/tabs/appRanking.ts:15-31`).

One measured miss: Jev 1.13 (the TypeSafe build) routed failed CI jobs from log excerpts no better than a list of regular expressions, so that use was rejected (`docs/internal/ci-things-already-tried.md:526-538`). Where the signal is a literal pattern, a filter beats a model.

Question shapes for workflows:

| Works well                                                                                                  | Works badly                                                   | Use instead                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| "Is this support message asking for a refund?" (yes/no on text the person wrote)                            | "Has this person done X more than 3 times?" (counting events) | A trigger or `conditional_branch` filter, a cohort, or HogQL |
| "Which team should handle this ticket?" (pick one of described options)                                     | "How many days since signup?" (arithmetic)                    | Hog in a `conditional_branch` or a delay expression          |
| "Does this company look like a fit for the enterprise plan?" (described rubric over a few named properties) | "Write a subject line for this person" (generation)           | Generate text, spec #22                                      |
| "Is this feedback negative?" (sentiment)                                                                    | "Why did this person churn?" (free-form reasoning)            | An AI task                                                   |
| "Which of these emails suits this person?" (pick one, then branch to an email step)                         | "Does the URL contain /pricing?" (literal pattern)            | A property filter                                            |

The state is one person at one moment.
Anything that needs many events belongs in a query; its result can go into a variable or a person property that the decision then reads.

## Recommended contract

### State sent to System One

```json
{
  "<author field>": "<rendered value: string, number, boolean, object, or array>"
}
```

- Built from the Context dictionary, rendered with Hog templating, sent as one JSON object.
- At most 8,192 bytes of compact UTF-8 JSON. Over the cap, a terminal run-log error. No truncation.
- Never contains workflow config, secrets, or the question.

### Question sent to System One

```json
{
  "decision": {
    "type": "noul | choice",
    "instructions": {
      "question": "<author text, never templated>",
      "data": "Answer about the fields in state."
    },
    "criteria": "<choice: {option: description}; noul: {\"true\": ..., \"false\": ...} or absent>"
  }
}
```

### Author-facing inputs

| Input                                                           | Type                                           | Templating                 | Limits                                                        | Default                                                    |
| --------------------------------------------------------------- | ---------------------------------------------- | -------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Question                                                        | string                                         | none, enforced server-side | 2,000 chars                                                   | empty; placeholder "Which team should handle this ticket?" |
| Answer type                                                     | choice: "Yes or no", "Pick one"                | none                       |                                                               | Pick one                                                   |
| Options (pick one)                                              | dictionary: option name to "when this applies" | none, enforced server-side | 2 to 16 rows, 500 chars per name or description, unique names | two example rows                                           |
| What yes means / What no means (yes or no)                      | string, optional                               | none                       | 500 chars each                                                | empty                                                      |
| Answer yes at or above (yes or no)                              | percent                                        | none                       | 1 to 99                                                       | 50                                                         |
| Context                                                         | dictionary: field name to value                | Hog, with `{` autocomplete | 8,192 bytes rendered                                          | `event: {event.event}` on event triggers, empty otherwise  |
| Add an Unsure branch                                            | toggle                                         | none                       |                                                               | off                                                        |
| Only pick when the top option is at least (pick one, Unsure on) | percent                                        | none                       | 1 to 99                                                       | 60                                                         |
| Answer no at or below (yes or no, Unsure on)                    | percent                                        | none                       | below the yes threshold                                       | 20                                                         |

The Unsure defaults follow the closest callers: 0.6 from taxonomic search intent, 0.2 from TypeSafe's band example.

### Outputs

- Branches: one per option (pick one), or Yes and No; plus Unsure when on.
- Variables: the decision (option name, or `yes`, `no`, `unsure`) and the probability it rests on (top option, or probability of yes). Both are small, well under the 5,120-byte budget.
- Run log: the decision, all probabilities, the model id that answered, and input tokens. Never the state.

### Server-side checks per run

1. Decisions available in this region, and the step's flag on for the org.
2. `is_ai_data_processing_approved`; a terminal failure if not.
3. `is_team_over_ai_credit_budget` before the call, and a gateway 402 mapped to an "out of AI credits" terminal error, as HogQL `decide()` does (`posthog/hogql/transforms/prompt_jev.py:118-121,178-179,507-522`).
4. State size, then the call through `decide_when_available()` with `privacy_mode=True`, `ai_product="workflows"`, and the invocation id as trace id.

## Open points for the spec

- Which side reads the question for a function-template step: the Django route from the saved action, or the serializer rejecting `templating` on it. A native action type makes this moot.
- Whether JevK5's returned `confidence` matches TypeSafe's formula. The recommendation avoids depending on it.
- What the gateway records under privacy mode, given the conflicting comments.
- Whether 8 KiB of state is enough for the first use cases, such as long support tickets. Raising it needs the token cap measured against real inputs.
