import copy
import unittest
from cmb_study import TASKS, POLICIES, fixtures, percentile, reference, select, tool_context


class StudyTests(unittest.TestCase):
    def test_independent_pearson_and_lag_convention(self):
        a = [2, -1, 4, 0, 8, -4, 1, 6, -2, 5, 9, 3]
        b = [11, -12] + a[:-2]
        ref = reference(a, b)
        self.assertEqual(ref['lag'], 2)
        self.assertAlmostEqual(ref['correlation'], 1)
        self.assertEqual(reference(a, [-x for x in b])['sign'], -1)

    def test_fixture_separation_and_independent_pairs(self):
        dev, _ = fixtures('dev'); test, gold = fixtures('test')
        self.assertEqual((len(dev), len(test)), (24, 96))
        self.assertFalse(set(r['family'] for r in dev) & set(r['family'] for r in test))
        self.assertEqual(len({tuple(r['a']) for r in dev+test}), 120)
        self.assertTrue(all('answer' not in r for r in dev+test))
        self.assertTrue(all(g['gap'] >= .02 for g in gold.values()))

    def test_midrank_ties(self):
        self.assertEqual(percentile([0, 1, 1, 3]), [0, .5, .5, 1])
        self.assertEqual(percentile([3, 3]), [.5, .5])

    def test_budget_and_label_independence(self):
        rows = [{'id': str(i), 'task': TASKS[i%4], 'entropy': i/10, 'drift': (10-i)/10, 'length': i} for i in range(10)]
        changed = copy.deepcopy(rows)
        for r in changed:
            r['answer'] = 987; r['correct'] = True
        for p in POLICIES:
            self.assertEqual(len(select(rows, p)), 5)
            self.assertEqual(select(rows, p), select(changed, p))

    def test_null_and_real_context_schema_matches(self):
        m = {'lag': 1, 'correlation': .99, 'zero_lag_correlation': -.3, 'strong': 1, 'sign': 1, 'zero_lag_sign': -1}
        for k in m:
            self.assertIn('"'+k+'":', tool_context(m))
            self.assertIn('"'+k+'":null', tool_context(None))


if __name__ == '__main__':
    unittest.main()
