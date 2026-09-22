import math
import unittest
from pilot import choose, features, score


class PilotTests(unittest.TestCase):
    def test_exact_scoring_rejects_answer_leak_formats(self):
        self.assertTrue(score(' 42\n', 42))
        for answer in ['41', '42 or 43', 'The answer is 42', '4.2e1', '']:
            self.assertFalse(score(answer, 42))

    def test_equal_action_budgets_and_determinism(self):
        rows = {str(i): {'entropy': i / 20, 'drift': 1 - i / 20} for i in range(10)}
        for policy in ['confidence', 'random', 'geometry', 'shuffled_geometry']:
            self.assertEqual(len(choose(rows, 3, policy)), 3)
            self.assertEqual(choose(rows, 3, policy), choose(rows, 3, policy))
        self.assertEqual(choose(rows, 3, 'confidence'), {'7', '8', '9'})
        with self.assertRaises(ValueError):
            choose(rows, 11, 'random')

    def test_geometry_changes_routing_without_outcomes(self):
        rows = {'a': {'entropy': .8, 'drift': 0}, 'b': {'entropy': .6, 'drift': 1}}
        self.assertEqual(choose(rows, 1, 'confidence'), {'a'})
        self.assertEqual(choose(rows, 1, 'geometry'), {'b'})

    def test_missing_geometry_explicit(self):
        f = features({'vocab_size': 4, 'observations': [{'entropy_nats': math.log(4), 'cosine_drift': None}]})
        self.assertEqual(f, {'entropy': 1, 'drift': 0, 'geometry_available': False})
        with self.assertRaises(ValueError):
            features({'vocab_size': 4, 'observations': []})


if __name__ == '__main__':
    unittest.main()
