from django.test import SimpleTestCase

from parameterized import parameterized

from products.workflows.backend.services.llm_models import (
    WORKFLOW_LLM_DEFAULT_MODEL,
    WORKFLOW_LLM_MODEL_CHOICES,
    WORKFLOW_LLM_SUPPORTED_MODELS,
)


class TestWorkflowLLMModels(SimpleTestCase):
    @parameterized.expand([(model,) for model in WORKFLOW_LLM_MODEL_CHOICES])
    def test_picker_model_is_accepted_by_validation(self, model: str) -> None:
        self.assertIn(model, WORKFLOW_LLM_SUPPORTED_MODELS)

    def test_the_default_model_is_one_the_picker_offers(self) -> None:
        self.assertIn(WORKFLOW_LLM_DEFAULT_MODEL, WORKFLOW_LLM_MODEL_CHOICES)
