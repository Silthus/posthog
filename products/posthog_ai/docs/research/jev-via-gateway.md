# Can PostHog's LLM gateway route to Jev (Typesafe AI)?

Research ticket: `Silthus/posthog#87`. Part of map `Silthus/posthog#80`.

## Which gateway PostHog AI uses today

Two gateways exist. `services/llm-gateway` (Python, FastAPI) is under an unofficial code
freeze; `PostHog/ai-gateway` (Go) is the default for new work
(`services/llm-gateway/PARITY.md:1-12`).

The sandbox agent runtime (`products/posthog_ai/`, `products/tasks/backend/`) uses both,
chosen per run. `products/tasks/backend/temporal/process_task/ai_gateway_token.py:1-8`
mints a short-lived `phe_` token for the Go gateway when the run's product is on an
allowlist (`MINTABLE_PRODUCTS`, same file, lines 62-76). `posthog_ai` and `posthog_code`
runs are not on that list, so most sandbox runs still fall back to the Python gateway. A
mint failure or an unmapped product also degrades to the Python gateway rather than
failing the run (file docstring, lines 1-8).

Django code that is not sandbox-routed calls the Python gateway directly through
`get_llm_client()` / `build_openai_client()` / `build_anthropic_client()` in
`posthog/llm/gateway_client.py:53-56`. That client builds a base URL of
`{LLM_GATEWAY_URL}/{product}/v1` and only ever emits chat-shaped requests: OpenAI Chat
Completions or Anthropic Messages.

Per `services/llm-gateway/PARITY.md`, three reasons keep PostHog AI's own traffic on the
Python gateway for now: first-party product policy (OAuth allowlists, project access
checks, billing), Django plan/quota enforcement, and OpenRouter access, which the Go
gateway does not have at all ("OpenRouter or Cloudflare Workers AI" row, blocking
contract: "These provider paths are not available in Go.").

## How providers and models are registered

**Python gateway.** Providers are a fixed, hardcoded map:
`_PROVIDER_TO_API_KEY` in `services/llm-gateway/src/llm_gateway/services/model_registry.py:52-57`
lists exactly `openai`, `anthropic`, `openrouter`, `fireworks_ai`, each tied to a settings
attribute and env var. Cloudflare Workers AI and Modal are wired separately through their
own allowlists (`CLOUDFLARE_ALLOWED_MODELS`, `MODAL_ALLOWED_MODELS`, same file, lines
7-21). Model discovery for the four LiteLLM-backed providers comes from LiteLLM's cost
map, not a PostHog-owned catalog (`README.md`, "Supported models" section: "All OpenAI,
Anthropic, OpenRouter, and Fireworks AI chat models are supported... The `/v1/models`
endpoint returns provider-specific model IDs from LiteLLM's model map").

Every route the gateway exposes is chat- or messages-shaped:
`services/llm-gateway/src/llm_gateway/api/routes.py:1-11` wires only `anthropic_router`,
`models_router`, `openai_router`, `usage_router`. The README's "API endpoints" section
lists `POST /v1/chat/completions`, `POST /v1/responses`, `POST /v1/messages`,
`POST /v1/messages/count_tokens`, plus product-scoped variants of the first two. There is
no generic pass-through or custom-body endpoint.

Adding a provider to the Python gateway means adding it to LiteLLM's provider set (for
the four supported ones) or hand-building a bespoke integration like Cloudflare's and
Modal's, each with its own allowlist, cost data, and routing code
(`model_registry.py:7-21`, `_glm_backend_configured` lines 88-93). The Python gateway is
frozen, so any such change needs a named blocked caller and a documented parity gap per
`PARITY.md:14-20`.

**Go gateway.** `PARITY.md`'s "Providers" row: "OpenAI, Anthropic, Azure OpenAI, Bedrock,
and configured Modal, Fireworks, and Baseten hosts." No OpenRouter, no Cloudflare, and (by
omission) no generic custom-endpoint provider. The repo itself,
`gh api repos/PostHog/ai-gateway/readme --jq .content | base64 -d`, returned 404 (`Not
Found`) from this environment, so its source is not readable here; this research relies
entirely on the parity doc in `services/llm-gateway/PARITY.md`, which is current as of
2026-09-08 per its own "Last verified" line.

Both gateways register providers as code, not data: a new provider needs a Python or Go
change and a deploy, not a config edit.

## Whether a non-chat endpoint fits

Jev's `systemone` endpoint does not fit either gateway's shape. Per
`https://docs.typesafe.ai/api`, the request body is `{state, model, questions}`, where
`questions` is a map of named objects (`noul`, `choice`, or `score` type, each with its
own `criteria`/`instructions` fields), and the response is `{model, answers, usage}` with
`answers` keyed the same way, each carrying `type`-specific fields such as
`probabilities` and `confidence`. That is a bespoke JSON contract, not an OpenAI
`messages` array or an Anthropic `messages` request.

Both PostHog gateways only expose `/v1/chat/completions`, `/v1/responses`, `/v1/messages`,
and `/v1/messages/count_tokens` (`services/llm-gateway/src/llm_gateway/api/routes.py:1-11`
for the Python gateway; the Go gateway's OpenAI/Anthropic API rows in `PARITY.md`). Neither
gateway has a route that would carry `state`/`questions` through unmodified, and neither
translates an arbitrary non-chat body the way it translates OpenAI-shaped requests to
Anthropic-shaped providers. A Jev call cannot be expressed as a chat completion without
losing the structured `questions` map and the typed `answers` response — there is no
`messages` array to put `state` and `questions` into that preserves the contract.

The Python SDK (`https://docs.typesafe.ai/sdk/python`, package `typesafe-sdk`) confirms
the same shape from the client side: `TypeSafeClient.system_one(state, questions)`
returning an object with `.nouls`, `.choices`, `.scores` — not an OpenAI/Anthropic
response object.

## Proxying through OpenRouter or Vercel AI Gateway

Jev's status on each aggregator, checked directly:

- **OpenRouter** (`https://openrouter.ai/models?q=typesafe`): the fetched page content was
  client-rendered and did not include the model list, so this check is inconclusive from
  here — report plainly that Jev's presence on OpenRouter could not be confirmed or denied
  from this environment. (Ticket #80's own notes list a `typesafe-sdk` and JS SDK with
  `choice()`/`noul()`/`score()` helpers, and say OpenRouter and Vercel AI Gateway "list
  Jev," so that claim rests on the map author's prior research, not this fetch.)
- **Vercel AI Gateway** (`https://vercel.com/ai-gateway/models`): a model
  `typesafe-ai/jev` is listed, tagged "Evaluation" (not chat), priced at $0.04/1M input
  tokens and $0/1M output tokens, 32K context.

Even if an aggregator lists Jev, that only helps if the aggregator's own API re-exposes
`systemone` as a chat-completion-compatible call (wrapping `state`/`questions` into a
`messages`-shaped request under the hood) — this research did not confirm that wrapping
behavior for either aggregator, only that a catalog entry exists on Vercel's side.

Structurally, only the Python gateway could proxy through OpenRouter at all, because
OpenRouter is one of its four LiteLLM-backed providers
(`_PROVIDER_TO_API_KEY` in `model_registry.py:52-57`). The Go gateway has no OpenRouter
provider (`PARITY.md`, "Providers" row) and no Vercel AI Gateway provider on either side.
So even with a confirmed listing, reaching Jev through an aggregator still means: (a) the
call has to be shaped as a chat completion, which loses Jev's typed question/answer
contract per the section above, and (b) only the frozen Python gateway has a provider path
to OpenRouter, and neither gateway has one to Vercel AI Gateway.

## Recommendation: smallest path to one Jev call from Django

Do not change either gateway. Jev is not a chat model: its request and response shapes
are incompatible with every route both gateways expose, and the aggregator proxy path
does not remove that mismatch even where a listing exists. Routing it through a gateway
would mean adding a bespoke non-chat endpoint to a frozen Python service, or a new
provider integration to a Go service this repo cannot currently even read the source of.

The smallest path is a direct client under `posthog/egress/`, following the pattern
`posthog/egress/github/` sets (README, `limiter.py`, `observability.py`, `transport.py`
per `posthog/egress/README.md`'s "Egress observability" section and "domain-free" lanes
description). Concretely:

1. Add `posthog/egress/typesafe/` with `client.py` exposing a `typesafe_request` helper (or
   a small typed wrapper, following `firecrawl/client.py`'s precedent cited in
   `posthog/egress/README.md`, "Transport" section) that POSTs to
   `https://api.typesafe.ai/v1/systemone` with the `Authorization: Bearer` header and the
   `{state, model, questions}` body.
2. Register a `RatePolicy` via `register_policy("typesafe", provider)` if Jev publishes
   rate limits, else use `RecordedEgressClient` (no gate) like `slack/` and `vapi/`
   (`posthog/egress/README.md`, "Transport" section) if it does not.
3. Add an `EgressObservability` instance so calls get the standard request-volume metric.
4. Store the API key as a Django setting, not inline — the existing `github-api-calls-go-
through-ingress`-style semgrep rules only cover GitHub and Slack today
   (`posthog/egress/README.md`, "Two semgrep rules..." paragraph), so a Typesafe domain is
   on review, not lint, until a rule is added.

This needs no gateway change, no deploy of either gateway, and stays entirely inside
Django's existing outbound-call conventions. It is a new egress domain, sized the same as
adding GitHub or Slack was.
