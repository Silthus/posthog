from products.ai_observability.backend.llm.providers.anthropic import AnthropicConfig
from products.ai_observability.backend.llm.providers.openai import OpenAIConfig

# Every model a saved workflow may name. Gemini is absent because the gateway holds no Google
# key, and responses-only models are dropped because they 404 on chat completions.
WORKFLOW_LLM_SUPPORTED_MODELS: frozenset[str] = frozenset(
    model
    for model in [*OpenAIConfig.SUPPORTED_MODELS, *AnthropicConfig.SUPPORTED_MODELS]
    if model not in OpenAIConfig.RESPONSES_ONLY_MODELS
)

# What the builder's model picker offers, cheapest first. A deliberate subset of the validation
# set, so refreshing the picker can never reject a model a saved workflow already names.
WORKFLOW_LLM_MODEL_CHOICES: tuple[str, ...] = (
    "gpt-4.1-mini",
    "gpt-5-mini",
    "gpt-5.4",
    "claude-haiku-4-5",
    "claude-sonnet-4-6",
    "claude-opus-4-8",
)

WORKFLOW_LLM_DEFAULT_MODEL = "gpt-5-mini"

# Pass 2 is pinned here rather than in OpenAIConfig.SUPPORTED_MODELS: that list feeds the
# AI-observability model picker, and extraction is never a user's choice.
WORKFLOW_LLM_EXTRACTION_MODEL = "gpt-5.6-luna"
