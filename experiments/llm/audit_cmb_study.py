"""Independent evidence audit; imports no collector, scorer, or policy functions.

Uses decimal raw moments for Pearson, grouped ranks for selection, and gain sums
for allocation bootstrap. It writes only the explicitly requested audit receipt.
"""
import argparse
from collections import defaultdict
from decimal import Decimal, localcontext
import gzip
import hashlib
import json
import math
from pathlib import Path
import random
import re


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text())


def require(condition, message):
    if not condition:
        raise ValueError(message)


def decimal_correlation(x, y):
    with localcontext() as context:
        context.prec = 60
        a, b = [Decimal(str(v)) for v in x], [Decimal(str(v)) for v in y]
        n = Decimal(len(a))
        sx, sy = sum(a), sum(b)
        cov = n * sum(u*v for u, v in zip(a, b)) - sx*sy
        va = n * sum(u*u for u in a) - sx*sx
        vb = n * sum(v*v for v in b) - sy*sy
        require(va > 0 and vb > 0, 'undefined decimal Pearson')
        return float(cov / (va*vb).sqrt())


def measurements(row):
    a, b = row['a'], row['b']
    result = {}
    for lag in range(-row['max_lag'], row['max_lag'] + 1):
        start, end = max(0, -lag), min(len(a), len(b)-lag)
        result[lag] = decimal_correlation(a[start:end], b[start+lag:end+lag])
    lag = min(result, key=lambda v: (-abs(result[v]), v))
    sign = lambda v: int(v > 0) - int(v < 0)
    return {'lag': lag, 'correlation': result[lag], 'zero_lag_correlation': result[0],
            'strong': int(abs(result[lag]) >= .8), 'sign': sign(result[lag]),
            'zero_lag_sign': sign(result[0])}


def ranks(values):
    groups = defaultdict(list)
    for i, value in enumerate(values):
        groups[value].append(i)
    output, preceding = [0.] * len(values), 0
    for value in sorted(groups):
        indices = groups[value]
        rank = (preceding + (len(indices)-1)/2) / max(1, len(values)-1)
        for i in indices:
            output[i] = rank
        preceding += len(indices)
    return output


def selected(rows, policy):
    if policy == 'random':
        return set(random.Random(31).sample(list(range(len(rows))), len(rows)//2))
    entropy, drift = ranks([r['entropy'] for r in rows]), ranks([r['drift'] for r in rows])
    if policy == 'shuffled_geometry':
        random.Random(31).shuffle(drift)
    if policy == 'entropy':
        values = entropy
    elif policy == 'length':
        values = [r['length'] for r in rows]
    elif policy == 'task_type':
        values = [{'sign': 0, 'zero_sign': 1, 'strong': 2, 'lag': 3}[r['task']] for r in rows]
    else:
        require(policy in ('geometry', 'shuffled_geometry'), 'unknown policy')
        values = [(a+b)/2 for a, b in zip(entropy, drift)]
    keys = [(-values[i], rows[i]['id'], i) for i in range(len(rows))]
    return {item[2] for item in sorted(keys)[:len(rows)//2]}


def audit(data, run):
    require(decimal_correlation([1, 2, 3], [5, 7, 9]) == 1., 'analytic Pearson failed')
    require(decimal_correlation([1, 2, 3], [9, 7, 5]) == -1., 'analytic Pearson failed')
    require(ranks([2, 1, 2, 3]) == [.5, 0., .5, 1.], 'analytic tied ranks failed')
    manifest, report = read(run/'manifest.json'), read(run/'analysis.json')
    require(manifest['status'] == 'PASS', 'incomplete run')
    for name, expected in manifest['evidence_sha256'].items():
        require(Path(name).name == name and digest(run/name) == expected, 'evidence digest mismatch: '+name)
    dataset = read(data/'dataset-manifest.json')
    for name, expected in dataset['sha256'].items():
        require(Path(name).name == name and digest(data/name) == expected, 'dataset digest mismatch: '+name)
    split = manifest['split']
    if 'dataset_manifest_sha256' in manifest:
        require(digest(data/'dataset-manifest.json') == manifest['dataset_manifest_sha256'], 'dataset anchor mismatch')
        require(digest(data/f'{split}-answers.json') == manifest['answers_sha256'], 'answer anchor mismatch')
    else:
        require(split == 'dev', 'confirmation dataset anchor absent')
    require(digest(data/f'{split}-inputs.json') == manifest['input_sha256'], 'run input digest mismatch')
    inputs, gold = read(data/f'{split}-inputs.json'), read(data/f'{split}-answers.json')
    predictions, decisions = read(run/'predictions.json'), read(run/'decisions.json')
    source_ids = [row['id'] for row in inputs]
    n = len(source_ids)
    require(len(set(source_ids)) == n, 'duplicate source')
    require([p['id'] for p in predictions] == source_ids, 'prediction ordering mismatch')
    require([f['id'] for f in decisions['features']] == source_ids, 'feature ordering mismatch')
    tools = [json.loads(line) for line in (run/'tool-responses.jsonl').read_text().splitlines()]
    require([t['id'] for t in tools] == source_ids, 'tool ordering mismatch')
    max_pearson_error = 0.
    for row, tool in zip(inputs, tools):
        expected = measurements(row)
        target = 'zero_lag_sign' if row['task'] == 'zero_sign' else row['task']
        require(expected[target] == gold[row['id']]['answer'], 'independent target mismatch')
        for key in expected:
            error = abs(tool[key] - expected[key])
            max_pearson_error = max(max_pearson_error, error)
            require(error < 1e-10, 'independent tool measurement mismatch')
    traces, vector_count = {}, 0
    norm_error, drift_error, feature_error = 0., 0., 0.
    with gzip.open(run/'traces.jsonl.gz', 'rt') as stream:
        for line in stream:
            trace = json.loads(line)
            ob = trace['observation']
            require(trace['model_sha256'] == manifest['model']['sha256'], 'trace model mismatch')
            require(ob['llama_revision'] == manifest['model']['llama_revision'], 'trace runtime mismatch')
            require(ob['id'] not in traces, 'duplicate trace')
            traces[ob['id']] = ob
    require(len(traces) == 5*n, 'wrong number of traces')
    feature_rows = []
    for row, pred, saved in zip(inputs, predictions, decisions['features']):
        for arm, short in pred['arms'].items():
            raw = traces[row['id']+'-'+arm]
            for key in short:
                require(short[key] == raw[key], 'prediction/trace disagreement')
            require(raw['observe'] == (arm == 'observed'), 'observation arm mismatch')
        ob = traces[row['id']+'-observed']
        require(ob['token_ids'] == traces[row['id']+'-ordinary']['token_ids'], 'parity mismatch')
        steps, prior, ds = ob['observations'], None, []
        require(bool(steps), 'no observer states')
        require([s['token_id'] for s in steps if s['emitted']] == ob['token_ids'], 'emission mismatch')
        for i, state in enumerate(steps):
            vector = state['embedding']
            require(state['step'] == i and len(vector) == ob['embedding_dim'], 'vector shape mismatch')
            require(all(math.isfinite(v) for v in vector), 'nonfinite vector')
            norm = math.hypot(*vector)
            norm_error = max(norm_error, abs(norm - state['embedding_norm']))
            require(abs(norm - state['embedding_norm']) < 1e-7*max(1, norm), 'vector norm mismatch')
            expected_drift = None
            if prior is not None and norm and prior[1]:
                cosine = math.fsum(a*b for a, b in zip(vector, prior[0])) / (norm*prior[1])
                expected_drift = 1-min(1., max(-1., cosine))
            if expected_drift is None:
                require(state['cosine_drift'] is None, 'undefined drift mismatch')
            else:
                error = abs(expected_drift-state['cosine_drift'])
                drift_error = max(drift_error, error)
                require(error < 1e-7, 'vector drift mismatch')
                # Use saved float for frozen ranking; separately verified from vectors.
                ds.append(state['cosine_drift'])
            require(0 <= state['entropy_nats'] <= math.log(ob['vocab_size'])+1e-6, 'entropy range')
            vector_count += 1
            prior = (vector, norm)
        f = {'id': row['id'], 'task': row['task'], 'length': len(ob['token_ids']),
             'entropy': math.fsum(s['entropy_nats'] for s in steps)/len(steps)/math.log(ob['vocab_size']),
             'drift': math.fsum(ds)/len(ds)/2 if ds else 0., 'geometry_available': bool(ds)}
        for key in ('entropy', 'drift'):
            feature_error = max(feature_error, abs(f[key]-saved[key]))
            require(abs(f[key]-saved[key]) < 1e-12, 'feature recomputation mismatch')
        require(f['length'] == saved['length'] and f['geometry_available'] == saved['geometry_available'], 'feature metadata mismatch')
        # The exact persisted feature floats define tied rankings in the protocol.
        feature_rows.append(saved)
    policies = tuple(report['policies'])
    scored = []
    for pred in predictions:
        target = gold[pred['id']]['answer']
        scores = {}
        for arm, answer in pred['arms'].items():
            value = answer['completion'].strip()
            scores[arm] = int(re.fullmatch('[+-]?[0-9]+', value) is not None and int(value) == target)
        scored.append(scores)
    for arm in ('ordinary', 'observed', 'tool', 'null', 'shuffled'):
        require(sum(s[arm] for s in scored) == report['arms'][arm]['correct'], 'arm score mismatch')
    require(report['arms']['deterministic_tool']['correct'] == n, 'tool reference mismatch')
    for policy in policies:
        allocation = selected(feature_rows, policy)
        require({source_ids[i] for i in allocation} == set(decisions['selected'][policy]), 'allocation mismatch')
        correct = sum(s['tool'] if i in allocation else s['observed'] for i,s in enumerate(scored))
        require(correct == report['policies'][policy]['correct'], 'policy score mismatch')
    strata = defaultdict(list)
    for i,row in enumerate(inputs):
        strata[row['family'],row['task']].append(i)
    samples = defaultdict(list)
    rng = random.Random(report['bootstrap']['seed'])
    for _ in range(report['bootstrap']['draws']):
        indices = [group[rng.randrange(len(group))] for group in strata.values() for _ in group]
        fs = [feature_rows[i] for i in indices]
        gains = [scored[i]['tool']-scored[i]['observed'] for i in indices]
        chosen_gains = {p: sum(gains[j] for j in selected(fs,p)) for p in ('geometry','entropy','task_type')}
        for baseline in ('entropy','task_type'):
            samples['geometry_minus_'+baseline].append((chosen_gains['geometry']-chosen_gains[baseline])/n)
        for arm in ('ordinary','null','shuffled'):
            samples['tool_minus_'+arm].append(sum(scored[i]['tool']-scored[i][arm] for i in indices)/n)
    for key, values in samples.items():
        ordered = sorted(values)
        ci = [ordered[math.floor(p*(len(values)-1))] for p in (.025,.975)]
        require(all(abs(a-b) < 1e-12 for a,b in zip(ci,report['comparisons'][key]['ci95'])), 'bootstrap CI mismatch: '+key)
    return {'status': 'PASS', 'n': n, 'traces': len(traces), 'vectors': vector_count,
            'dataset_anchored_at_collection': 'dataset_manifest_sha256' in manifest,
            'independent_pearson': '60-digit decimal raw-moment formula',
            'max_pearson_absolute_error': max_pearson_error,
            'max_vector_norm_absolute_error': norm_error, 'max_vector_drift_absolute_error': drift_error,
            'max_feature_absolute_error': feature_error, 'bootstrap_draws_reproduced': report['bootstrap']['draws'],
            'checks': ['dataset/run evidence hashes', 'independent raw-input labels and tool values',
                       'trace/prediction identity and output parity', 'signed-vector norms and cosine drift',
                       'feature aggregation', 'all arm and policy scores', 'blinded policy selections',
                       'stratified reselected bootstrap intervals'],
            'limits': ['Entropy is range/aggregation checked; raw logits were not retained',
                       'This audits recorded evidence; it is not a second model run'],
            'auditor_sha256': digest(Path(__file__)), 'analysis_sha256': digest(run/'analysis.json')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('data', 'run', 'out'):
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.data, args.run)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
