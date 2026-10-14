from django.test import SimpleTestCase

from parameterized import parameterized

from products.feature_flags.backend.flag_health_verdict import evaluate_flag_health


class TestFlagHealthVerdict(SimpleTestCase):
    @parameterized.expand(
        [
            ("pass", 500, 0, 500, 0, 0.01, 300, "pass"),
            ("harm_at_low_n", 10, 10, 10, 0, 0.01, 300, "harm"),
            ("low_n", 10, 0, 10, 0, 0.01, 300, "insufficient_data"),
            ("missing_off", 500, 0, 0, 0, 0.01, 300, "insufficient_data"),
            ("missing_on", 0, 0, 500, 0, 0.01, 300, "insufficient_data"),
            ("pass_at_bound", 1, 1, 1, 1, 0.9875, 1, "pass"),
            ("below_pass_bound", 1, 1, 1, 1, 0.9874, 1, "insufficient_data"),
            ("harm_at_bound", 1, 1, 1, 0, 0.0, 1, "insufficient_data"),
        ]
    )
    def test_verdict(
        self, _name: str, on_n: int, on_k: int, off_n: int, off_k: int, tolerance: float, minimum: int, expected: str
    ) -> None:
        result = evaluate_flag_health(on_n, on_k, off_n, off_k, tolerance, minimum, 0.05)
        assert result.verdict == expected

    def test_exact_bounds_and_rates(self) -> None:
        result = evaluate_flag_health(1, 1, 1, 0, 0.01, 300, 0.05)
        assert result.on.rate == 1.0
        assert result.off.rate == 0.0
        self.assertAlmostEqual(result.on.bounds.lower, 0.0125)
        assert result.on.bounds.upper == 1.0
        assert result.off.bounds.lower == 0.0
        self.assertAlmostEqual(result.off.bounds.upper, 0.9875)
        self.assertAlmostEqual(result.excessBounds.lower, -0.975)
        assert result.excessBounds.upper == 1.0
