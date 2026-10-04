# Decision step: which decisions lifecycle teams want, and how other tools offer them

Research for [Silthus/posthog#244](https://github.com/Silthus/posthog/issues/244), part of the map [Silthus/posthog#240](https://github.com/Silthus/posthog/issues/240) ("AI decisions in workflows, a decision step backed by Jev").
Code references are to upstream `PostHog/posthog` `master` at `39cc02e` (2026-10-04).
Vendor facts were read from each vendor's own documentation in October 2026.

## Answer in brief

- Lifecycle teams want a workflow to make four kinds of per-person decisions: **route** a person to a branch, **pick** the content they get, **label** them for later steps, and **gate** people out. The catalog below lists 18 concrete decisions and one counter-example (C5).
- A System One question fits a decision when the answer is one of a short, describable set (yes/no, or one of at most 16 options), and the evidence is text that the step can already see: the trigger event, person properties, group properties, and workflow variables. Fuzzy text such as job titles, free-text survey answers, signup "what will you use this for" fields, and support replies is where a model adds most over a `conditional_branch`.
- A System One question does not fit when the decision needs arithmetic over history (spend in the last 30 days, days since last login), data the step does not see, free-text output, or optimization against an outcome (which offer converts best). Those belong to filters, HogQL, the "Generate text" node (spec #22), or experiments.
- The market splits in two. The big messaging platforms mostly offer **outcome-optimized ML** (send time, channel, a winning path or variant learned from conversions). Author-written **LLM classification that routes people** is newer and lives mainly in automation and CRM tools. See [How other tools offer AI decisions](#how-other-tools-offer-ai-decisions).
- The first version must serve five acceptance examples well: onboarding track routing, a persona label kept for later steps, email template choice, a fit gate with a confidence threshold, and reply triage. See [Acceptance examples](#acceptance-examples-for-the-spec).

## What a decision step can see and do today

These facts bound which decisions are realistic for a first version.

- **State.** A workflow step runs with the trigger `event` (name, properties, distinct id, timestamp), the `person`, `groups`, and workflow `variables` ([`nodejs/src/cdp/types.ts:99-130`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/nodejs/src/cdp/types.ts#L99-L130)). It does not see the person's event history unless an earlier step fetched it.
- **Question types.** System One answers a yes/no ("noul") question with a probability, a choice question with the picked option, a confidence, and a probability per option, and a score question with a fractional index into 2 to 10 ordered rubric levels ([`posthog/llm/system_one.py:1-13`, `46-114`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/posthog/llm/system_one.py#L1-L13)).
- **Limits.** The team-billed facade caps a choice at 16 options ("JevK5 answers with one letter per option, A to P") and a request at 32 questions ([`products/ml_inference/backend/facade/contracts.py:37-39`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/ml_inference/backend/facade/contracts.py#L37-L39)). HogQL `decide()` uses the same 16 ([`posthog/hogql/functions/prompt_jev.py:8`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/posthog/hogql/functions/prompt_jev.py#L8)).
- **Instructions versus data.** User text goes into `state` and the instructions refer to it by name, so user text cannot become an instruction ([`posthog/llm/system_one.py:8-9`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/posthog/llm/system_one.py#L8-L9)). For a workflow, the author's question and option descriptions are instructions; event and person data are state.
- **Existing callers precompute facts.** Error tracking asks a four-way severity choice with one sentence per option, and adds derived facts such as "Handled by the application: yes" to the state instead of asking the model to work them out ([`products/error_tracking/backend/logic/severity_inference.py:25-34`, `55-60`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/error_tracking/backend/logic/severity_inference.py#L25-L34)). Signals asks a yes/no question plus a category choice with a "none" option ([`products/signals/backend/system_one_decision.py:232-242`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/signals/backend/system_one_decision.py#L232-L242)). These are the shapes a workflow author would write too.
- **Where the answer goes.** Any step can write a workflow variable through `output_variable` ([`graph-schema.md:36`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/workflows/skills/building-workflows/references/graph-schema.md#L36)), capped at 5 KB ([`hogflow-executor.service.ts:949`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/nodejs/src/cdp/services/hogflows/hogflow-executor.service.ts#L949)). A `conditional_branch` with N conditions has N `branch` edges plus one `continue` edge for no match ([`graph-schema.md:46`, `107-110`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/workflows/skills/building-workflows/references/graph-schema.md#L46)).
- **Email template choice is fixed at save.** `function_email` copies a saved template's body into the step at save time ([`graph-schema.md:51`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/workflows/skills/building-workflows/references/graph-schema.md#L51)). So "pick a template per person" means a branch per template, or one email body with liquid `{% if %}` on a variable.
- **Prior attempt.** The closed upstream PR [PostHog/posthog#107832](https://github.com/PostHog/posthog/pull/107832) ("Classify with Jev") motivated the step with "spam or real, which team, and which priority". It wrote `jev_category` and `jev_confidence` variables and left branching to a separate condition step. Its reviews flagged a mock that accepted more than 16 categories while the live route rejected them, missing per-team rate limits, and missing `team_id` cost attribution.

## Decision catalog

Each row names the decision, the question shape, and the evidence the model reads.
"Fit" rates how well a System One model answers it from the state a workflow step sees: **strong** (fuzzy text, short describable option set), **conditional** (works only when the right facts are in the state), **weak** (a deterministic filter or another tool does it better).

### Route to a branch

| # | Decision | Shape | Evidence in the state | Fit |
|---|---|---|---|---|
| R1 | Which onboarding track a new signup gets (for example self-serve product, data team, agency, enterprise evaluation) | Pick one of 3 to 5, plus "unclear" | Signup event properties, free-text "what brings you here", role, company size | Strong |
| R2 | Which type of user this is, to send different user types different sequences (developer, marketer, founder, student) | Pick one of 3 to 6 | Job title, email domain, signup answers | Strong |
| R3 | Dynamic cohort choice: which nurture cohort a person belongs in when the cohort is defined by a description rather than a property filter | Pick one of up to 16 | Person properties, latest event | Strong when the cohort definition is fuzzy; weak when a property filter already defines it |
| R4 | Where a cancellation or downgrade goes (price objection gets an offer, missing feature gets a roadmap note, "not using it" gets re-onboarding) | Pick one of 3 to 5 | Cancellation survey answer, plan | Strong |
| R5 | Whether a signup looks like a sales-assisted lead and goes to the sales hand-off path | Yes/no | Company name, email domain, title, company size answer | Conditional: the model has no firmographic database, so it judges only what the text says |
| R6 | Which channel to use next (email, push, SMS) | Pick one | Engagement history | Weak: an outcome-optimization problem on history the step does not see |

### Pick content

| # | Decision | Shape | Evidence in the state | Fit |
|---|---|---|---|---|
| C1 | Which of N saved email templates fits this person | Pick one of N (N up to 16), each option described in one sentence | Person properties, trigger event | Strong when each template has a clear audience description |
| C2 | Which feature to highlight next | Pick one of up to 16 features | Properties or variables that record which features the person used | Conditional: needs the usage facts precomputed into properties or variables |
| C3 | Which offer to make (discount, extended trial, onboarding call, none) | Pick one of 3 to 4 | Plan, cancellation reason, company size | Conditional: the model picks by described fit, not by learned conversion; pair it with a `random_cohort_branch` holdout to measure |
| C4 | Which tone or language variant to send (formal or casual, or locale from free text) | Pick one | Free-text answers, browser locale | Strong for language from text; conditional for tone |
| C5 | Write a personal subject line or opening sentence | Free text | Anything | Not a decision: "Generate text" node (spec #22) |

### Label

| # | Decision | Shape | Evidence in the state | Fit |
|---|---|---|---|---|
| L1 | Write the person's use case or intent as a person property for later steps, insights, and other workflows | Pick one of up to 16, stored | Signup answers, first events | Strong |
| L2 | Write a persona or segment label (the R2 answer kept, not only routed) | Pick one, stored | As R2 | Strong |
| L3 | Rate ICP fit as A, B, or C | Pick one of 3, or a 3-level score | Company, title, size answers | Conditional, like R5; the score mode is not needed when 3 ordered labels work as a choice |
| L4 | Label the sentiment or topic of a survey answer or reply (bug, feature request, praise, billing, other) | Pick one of up to 16 | The response text | Strong |

### Gate

| # | Decision | Shape | Evidence in the state | Fit |
|---|---|---|---|---|
| G1 | Skip signups that look fake or junk (gibberish names, throwaway domains, test accounts) | Yes/no with a threshold | Name, email, signup properties | Strong |
| G2 | Send this announcement only to people it is relevant to ("Is a feature about X relevant to this person?") | Yes/no | Person properties, use-case label | Conditional: as good as the label or properties it reads |
| G3 | Stop automated marketing when a reply contains a complaint, a legal threat, or an unsubscribe request in prose | Yes/no | Reply or message text | Strong |
| G4 | Skip a follow-up when the person already said the problem is solved | Yes/no | Last message text | Strong |

The four examples named for this ticket map to rows: dynamic cohort choice is R3 (and R1), sending to different types of users is R2, labeling is L1 and L2, and picking email templates is C1.

## Which decisions fit a System One question

A System One model fits when all four hold:

1. **The answer is closed.** Yes or no, or one of at most 16 options that the author can describe in one sentence each. An "unclear" or "none" option is part of the set, as signals does with its "none" safety category.
2. **The evidence is in the state.** The decision reads the trigger event, person and group properties, and variables. A human reading the same JSON would answer it in seconds.
3. **The evidence is fuzzy text.** If a property filter answers the question exactly (`plan = "free"`, `country = "DE"`), a `conditional_branch` is cheaper, deterministic, and free of AI credits. The model earns its cost on job titles, free-text answers, replies, and company descriptions.
4. **A wrong answer is cheap or catchable.** A fallback branch, a confidence threshold, or a later human check bounds the damage.

Decisions that need something else:

| Need | Examples | Better tool |
|---|---|---|
| Arithmetic or counts over history | Spend in the last 30 days, days since last login, number of sessions | Precompute into a property, a cohort, or a HogQL query, then a `conditional_branch`. Existing callers precompute facts and pass them as state (error tracking severity). |
| Free-text output | Subject lines, summaries, extracted company names | "Generate text" node (spec #22) |
| Optimization against an outcome | Best send time, channel, offer that converts best | Experiments (`random_cohort_branch`) or a dedicated optimizer. A System One model judges fit, it does not learn from outcomes. |
| Data outside the state | Firmographics, full event history, billing data | Fetch it in an earlier step and write it to a variable first |
| Many labels at once | Tag a person with every matching interest | Several yes/no questions in one request (up to 32), or one choice with the most specific label |
| Ordered rating | Lead score 1 to 5 | A choice over ordered labels works for a first version; a score question (2 to 10 levels) exists in the wire types if a caller needs a fractional score |

## How other tools offer AI decisions

Read from each vendor's own docs in October 2026. Items marked *(unverified)* could not be confirmed on the vendor's page.

### The two families

| Family | Who | What it decides | Author control |
|---|---|---|---|
| Outcome-optimized ML | Braze Intelligent Selection, Intelligent Timing and Channel, Experiment Paths "Winning Path"; Iterable Channel Decisioning, Send-Time Decisioning, journey experiments; Klaviyo predictive scores; Salesforce Einstein Scoring Split; MoEngage Intelligent Path Optimizer | A variant, path, channel, or send time, learned from conversions or engagement | A goal metric, candidate variants, a control group, a fallback for thin data. No written question. |
| LLM answering an author's question | Braze Agent step; Customer.io "Run LLM action"; HubSpot Data Agent "Custom prompt"; Zapier "AI by Zapier"; n8n Text Classifier; Salesforce Prompt Builder in Flow | A label, a typed field, or a branch, from a prompt the author writes | Prompt, output type or fixed values, fallback value or branch, model tier, a one-record preview |

### Per vendor

- **Braze.** The [Agent step](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/agent_step) is a Canvas step with one path out that writes a typed output variable. A later Audience Paths or Decision Split step branches on `{{context.<var>}}`. The model sees only what the author passes in: "Agents cannot search user profiles for attributes you did not configure them to receive", and agents "don't learn from whether their output worked" ([FAQ](https://www.braze.com/docs/user_guide/brazeai/agents/faq)). Authors set instructions, an output schema, and per-field fallback values used on failure or when the daily limit is hit. Cost is Braze credits per completed call, timeouts included; limits are 5,000 calls a minute per workspace and a per-agent daily cap ([reference](https://www.braze.com/docs/user_guide/brazeai/agents/reference)). Agent Console logs show each call's input and output. Per-user "Personalized Paths" "isn't available for new Experiment Path steps" ([Experiment Paths](https://www.braze.com/docs/user_guide/messaging/canvas/canvas_components/experiment_step)); per-recipient optimization moved to [Decisioning Studio](https://www.braze.com/docs/user_guide/brazeai/decisioning_studio), which sends outside the Canvas.
- **Customer.io.** [Run LLM action](https://docs.customer.io/messaging/send/workflows/llm-actions/) is a workflow step with one path out. It writes typed fields, including single and multi select, to journey or profile attributes; a True/False or multi-split branch reads them. The prompt uses Liquid over `customer`, `journey`, and the trigger event; it cannot read events that did not trigger the workflow. Authors pick a model tier and set per-field fallbacks. "Test prompt" is free. Each person who reaches the step spends [AI credits](https://docs.customer.io/accounts/billing/ai-credits/) scaled by model and context size; when credits run out the step uses its fallbacks and the workflow continues. I found no "AI branch" node and no per-person log of answers *(unverified)*.
- **Iterable.** No per-person LLM step in a journey. AI decisions are ML features: Channel Decisioning picks email, SMS, or push from engagement history with a fallback order ([Channel Optimization](https://support.iterable.com/hc/en-us/articles/13102589168916-Channel-Optimization)); Brand Affinity and Predictive Goals write weekly scores to the profile that ordinary split tiles read ([Brand Affinity](https://support.iterable.com/hc/en-us/articles/360052990191-Brand-Affinity)); experiments run a 90/10 bandit ([Experiment Winner Selection](https://support.iterable.com/hc/en-us/articles/15906178005524-Experiment-Winner-Selection)). Nova Agents help authors build journeys, not run them. *(Iterable support pages returned 403 to a direct fetch; these claims come from indexed excerpts of those pages.)*
- **Klaviyo.** No prompt-based split. The [multi-branch split](https://help.klaviyo.com/hc/en-us/articles/52369094030235) has up to 20 paths, including an "Everyone else" path that cannot be removed, and routes on profile data, events, segments, random samples, and predictive scores such as churn risk and CLV ([predictive analytics](https://help.klaviyo.com/hc/en-us/articles/360020919731)). It shows profile counts and lists per path, and a flow preview explains which path one profile takes. AI in flows is authoring help (Flows AI, Composer).
- **HubSpot.** The Data Agent [Custom prompt action](https://knowledge.hubspot.com/workflows/use-ai-to-manage-data-in-workflows) (beta) returns a "Response"; with output type Enumeration the author lists fixed values, and a separate branch on "one property or action output" routes on it. "The prompt will not include any extra context" beyond the tokens the author inserts. "Test action" runs it on one record. When credits run out the action fails with a null output. [Smart properties](https://knowledge.hubspot.com/properties/create-smart-properties) fill a dropdown property from a prompt and consume credits "even when a value isn't filled". The [rate sheet](https://legal.hubspot.com/hubspot-product-and-services-catalog) prices one AI action in a workflow at 10 credits.
- **Zapier.** [AI by Zapier](https://help.zapier.com/hc/en-us/articles/8496342944013-Use-AI-by-Zapier-to-analyze-and-return-data) is one step with templates for "Summarize, Write, Classify, or Extract" and typed output fields. [Paths](https://help.zapier.com/hc/en-us/articles/8496288555917-Add-branching-logic-to-Zap-workflows-with-Paths) are rule-only with a Fallback branch, so routing is classify, then branch. Cost has a published formula: 1 task per run on the Standard tier, which Zapier recommends for classification, 3 or 5 on higher tiers; paths cost nothing ([tier pricing](https://help.zapier.com/hc/en-us/articles/46425475442829-AI-by-Zapier-model-tier-pricing)).
- **n8n.** The [Text Classifier](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.text-classifier) is the only node found that asks and routes in one step: named categories with descriptions, an option to allow several classes, and "When No Clear Match" set to "Discard Item" (the default) or an "Other" branch. No confidence threshold.
- **Salesforce.** Journey Builder's [Einstein Scoring Split](https://help.salesforce.com/apex/HTViewHelpDoc?id=mc_jb_einstein_splits.htm&language=en_us) routes on trained engagement personas with a remainder path. In Flow, a Prompt Builder action can return [structured output](https://developer.salesforce.com/blogs/2026/04/building-ai-automations-with-prompt-builder-structured-outputs) that a Decision element reads. Prompts bill Einstein Requests or Flex Credits by prompt size ([rate card](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/assets/pdf/agentforce/Flex-Credits-Rate-Card-08.18.2026.pdf)).

### Patterns that matter for the spec

- **Two steps is the norm, one node is rare.** Braze, Customer.io, HubSpot, Zapier, and Salesforce make the LLM write a value and leave routing to an ordinary split. Only n8n puts the question and the branches in one node. The map's destination (a question whose answers drive branches and are kept for later steps) is the n8n shape plus the stored value that the two-step tools give.
- **Nobody exposes confidence.** Every vendor has a fallback path or value, and none lets an author set a confidence threshold for LLM routing. System One returns a probability per answer, and signals already turns a yes/no probability into a verdict with a per-prompt threshold ([`products/signals/backend/system_one_decision.py:357-358`](https://github.com/PostHog/posthog/blob/39cc02e7c9421/products/signals/backend/system_one_decision.py#L357-L358)). A threshold with an "unsure" path is a real differentiator.
- **Never drop people silently.** n8n's default discards unmatched items. A decision step needs a mandatory fallback path for no answer, model failure, and no credits, as Klaviyo's "Everyone else" and Customer.io's fallbacks do.
- **The model sees only what is passed in.** Every LLM step reads the author's tokens or the trigger record, never full history. PostHog's step has the trigger event, person, groups, and variables by default; the spec must decide whether to send all of it or let the author pick context, as PR #107832 did.
- **Cost is explained per call.** The clearest vendors give a per-run rate or formula (Zapier, HubSpot, Salesforce) and a usage dashboard. Customer.io makes the prompt test free; Braze charges timeouts but not rate-limit blocks. The panel should state what a decision costs and that the mocked test walk spends nothing.
- **Observability splits.** LLM steps show call logs with input and output (Braze); journey tools show per-path counts and profile lists (Klaviyo). No vendor documents why one person went down one path. Per-branch counts plus a per-run log with the answer and its probability would cover both.

## Acceptance examples for the spec

These five examples cover the four decision kinds and the four uses named for this ticket.
Each one is answerable from the state a step already sees, needs no arithmetic, and fits one System One question.

### A1. Route a new signup to an onboarding track (R1, R3)

- **Trigger:** signup event with a free-text "what do you want to do first" answer, plus role and company size properties.
- **Question:** "Which onboarding track fits this person best?" Options, each with a one-line description: product analytics, data team, agency, enterprise evaluation, unclear.
- **Wiring:** one branch per option, plus the fallback path. "Unclear" and failures both reach a generic onboarding path.
- **Accept when:** the author writes the question and option descriptions in the panel without templating person data into the question, each option gets its own branch, the picked track is kept as a variable, and a person whose answer is blank or nonsense goes to "unclear" rather than a confident wrong track.

### A2. Label the person's use case for later steps and other workflows (L1, L2)

- **Trigger:** the same signup, or a first key event.
- **Question:** "What is this person's main use case?" Up to 16 described options.
- **Wiring:** no branching needed. The answer lands in a workflow variable; a following "Update person property" step writes it to the person, and later branches in this workflow read the variable, not the person property, which can be stale after a `$set`.
- **Accept when:** a decision step whose answers all continue on one path is valid, the variable holds the option key, and the run log shows the answer with its probability.

### A3. Pick which email template a person gets (C1)

- **Trigger:** a person enters a nurture workflow.
- **Question:** "Which of these emails fits this person best?" Three options that name the saved templates and the audience each is written for.
- **Wiring:** three branches, each with its own `function_email` step that references one saved template, and a fallback branch to a default email. A template is copied into the step at save, so the decision drives the branch, not the template id.
- **Accept when:** the builder makes a three-branch-plus-fallback layout easy to build, and the mocked test walk lets the author choose which branch to follow without spending credits.

### A4. Gate out people who are not a fit (G1, R5)

- **Trigger:** signup.
- **Question (yes/no):** "Is this a real person signing up for work, not a test, junk, or throwaway account?"
- **Wiring:** a probability threshold set by the author. At or above it, continue; below it, exit or go to a review path. Model failure and no credits take a separate path the author chooses (continue or exit).
- **Accept when:** the author sets the threshold in the panel, the panel says what a decision costs, and failure handling does not depend on the model answering.

### A5. Triage a reply or survey answer (L4, G3, R4)

- **Trigger:** a survey response or a reply event with free text.
- **Question:** "What is this message mainly about?" Options: bug report, feature request, billing or cancellation, praise, complaint that needs a person, other.
- **Wiring:** "complaint that needs a person" exits the marketing path and notifies the team; the others route to their follow-ups.
- **Accept when:** the free text travels as state and never as instructions (a reply that says "ignore your instructions" cannot change the options), and a batch of many responses at once stays within rate limits and credit checks.

### What the first version can leave out

- Several labels per person in one step (several yes/no questions, or a multi-select).
- A score mode: A1 to A5 need no fractional score; ordered labels work as a choice.
- Outcome learning: pair a decision with `random_cohort_branch` to measure lift, as Braze suggests with Experiment Paths.
