# Evidence for the research note `workflows-secrets-in-code.md`. This is not a product test and it
# does not live in the product test tree.
#
# It answers one question the existing suite leaves open: a whole-definition write that sends the
# action but OMITS a secret input key which is already stored. Keep, clear, or reject? The existing
# cases in posthog/cdp/test/test_validation.py cover a present-but-empty value (`{}`) and the
# read-back mask, never an absent key. It runs against the serializer the workflows API uses
# (HogFlowConfigFunctionInputsSerializer), so it needs no database.
from products.workflows.backend.api.hog_flow import HogFlowConfigFunctionInputsSerializer

INPUTS_SCHEMA = [
    {"key": "url", "type": "string", "label": "URL", "secret": False, "required": True},
    {"key": "api_key", "type": "string", "label": "API key", "secret": True, "required": False},
]
STORED = {"api_key": {"value": "STORED-VALUE", "order": 1}}


def _validate(inputs: dict, existing: dict) -> dict:
    serializer = HogFlowConfigFunctionInputsSerializer(
        data={"inputs_schema": INPUTS_SCHEMA, "inputs": inputs},
        context={"function_type": "destination", "encrypted_inputs": existing},
    )
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data["inputs"]


def test_omitted_secret_key_recovers_the_stored_value() -> None:
    validated = _validate({"url": {"value": "https://example.com"}}, STORED)
    assert validated["api_key"]["value"] == "STORED-VALUE"


def test_omitted_secret_key_with_nothing_stored_stays_absent() -> None:
    validated = _validate({"url": {"value": "https://example.com"}}, {})
    assert "api_key" not in validated


def test_sent_secret_value_overwrites_the_stored_value() -> None:
    validated = _validate({"url": {"value": "https://example.com"}, "api_key": {"value": "ROTATED"}}, STORED)
    assert validated["api_key"]["value"] == "ROTATED"
