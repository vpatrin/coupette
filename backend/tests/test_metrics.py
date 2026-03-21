from unittest.mock import MagicMock

from backend.metrics import llm_tokens, observe_token_usage


class TestObserveTokenUsage:
    def test_records_token_counts(self) -> None:
        response = MagicMock()
        response.usage.input_tokens = 100
        response.usage.output_tokens = 25

        before_in = llm_tokens.labels(service="test", direction="in")._value.get()
        before_out = llm_tokens.labels(service="test", direction="out")._value.get()

        observe_token_usage("test", response)

        assert llm_tokens.labels(service="test", direction="in")._value.get() == before_in + 100
        assert llm_tokens.labels(service="test", direction="out")._value.get() == before_out + 25

    def test_warns_on_missing_usage(self, caplog: object) -> None:
        response = MagicMock(spec=[])  # no attributes — usage will be None via getattr

        before_in = llm_tokens.labels(service="test_missing", direction="in")._value.get()

        observe_token_usage("test_missing", response)

        assert llm_tokens.labels(service="test_missing", direction="in")._value.get() == before_in
