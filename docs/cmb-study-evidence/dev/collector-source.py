"""Frozen synthetic CMB tool-use study; collector never opens the scoring key."""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import math
from pathlib import Path
import platform
import random
import statistics
import subprocess
import time

from pilot import LOCK, ROOT, Observer, features, score, sha256, trace_record

TASKS = ('lag', 'sign', 'strong', 'zero_sign')
POLICIES = ('random', 'entropy', 'length', 'task_type', 'geometry', 'shuffled_geometry')
SOURCE_FILES = ['experiments/llm/cmb_study.py', 'experiments/llm/pilot.py',
                'experiments/llm/model.lock.json', 'src/math/correlates.ts',
                'src/ingest/seriesTool.ts', 'scripts/cmb-series-tool.mjs',
                'bridge/llama_observer/main.cpp', 'bridge/llama_observer/metrics.h']


def write(path, obj):
    path.write_text(json.dumps(obj, indent=2, allow_nan=False) + '\n')


def reference(a, b):
    """Independent centered-dot oracle, using Python fsum at every reduction."""
    rs = {}
    for lag in range(-4, 5):
        pairs = [(a[t], b[t + lag]) for t in range(len(a)) if 0 <= t + lag < len(b)]
        ma = math.fsum(x for x, _ in pairs) / len(pairs)
        mb = math.fsum(y for _, y in pairs) / len(pairs)
        cov = math.fsum((x-ma)*(y-mb) for x, y in pairs)
        den = math.sqrt(math.fsum((x-ma)**2 for x, _ in pairs) * math.fsum((y-mb)**2 for _, y in pairs))
        if den < 1e-12:
            raise ValueError('undefined Pearson')
        rs[lag] = cov / den
    order = sorted(rs, key=lambda k: (-abs(rs[k]), k))
    best = order[0]
    return {'lag': best, 'correlation': rs[best], 'zero_lag_correlation': rs[0],
            'sign': 1 if rs[best] > 0 else -1 if rs[best] < 0 else 0,
            'strong': int(abs(rs[best]) >= .8), 'zero_lag_sign': 1 if rs[0] > 0 else -1 if rs[0] < 0 else 0,
            'gap': abs(rs[best]) - abs(rs[order[1]])}


def signal(rng, family, n=40):
    if family == 'iid':
        return [rng.uniform(-10, 10) for _ in range(n)]
    if family == 'walk':
        value, out = 0., []
        for _ in range(n):
            value += rng.uniform(-3, 3)
            out.append(value)
        return out
    if family == 'periodic':
        f, phase = rng.uniform(2, 7), rng.uniform(0, 6.28)
        return [8*math.sin(2*math.pi*f*i/n + phase) + rng.uniform(-2, 2) for i in range(n)]
    if family == 'impulses':
        out = [rng.uniform(-1, 1) for _ in range(n)]
        for i in rng.sample(range(n), 7):
            out[i] += rng.choice((-1, 1))*rng.uniform(6, 16)
        return out
    if family == 'piecewise':
        levels = [rng.uniform(-10, 10) for _ in range(8)]
        return [levels[i//5] + rng.uniform(-1, 1) for i in range(n)]
    raise ValueError('unknown family')


def fixtures(split):
    rng = random.Random(1701 if split == 'dev' else 2903)
    families = ('iid',) if split == 'dev' else ('walk', 'periodic', 'impulses', 'piecewise')
    rows, gold = [], {}
    for family in families:
        for task in TASKS:
            for j in range(6):
                for attempt in range(10000):
                    x = signal(rng, family)
                    lag, sign = rng.randrange(-4, 5), (-1 if j % 2 else 1)
                    a = [round(v, 3) for v in x[4:36]]
                    if task == 'strong' and j % 2:
                        b = [round(v, 3) for v in signal(rng, family)[4:36]]
                    else:
                        b = [round(sign*v + rng.uniform(-.2, .2), 3) for v in x[4-lag:36-lag]]
                    ref = reference(a, b)
                    if ref['gap'] < .02 or abs(ref['zero_lag_correlation']) < .1:
                        continue
                    if .7 < abs(ref['correlation']) < .9:
                        continue
                    if task == 'strong' and ref['strong'] != int(j % 2 == 0):
                        continue
                    break
                else:
                    raise RuntimeError('fixture rejection exhausted')
                ident = f'{split}-{family}-{task}-{j}'
                # No answer or feature enters the request dataset.
                row = {'id': ident, 'family': family, 'task': task, 'a': a, 'b': b,
                       'max_lag': 4, 'origin': 'synthetic', 'generation_attempts': attempt+1}
                rows.append(row)
                gold[ident] = {**ref, 'answer': ref['zero_lag_sign' if task == 'zero_sign' else task]}
    return rows, gold


def prepare(out):
    out.mkdir(parents=True, exist_ok=False)
    for split in ('dev', 'test'):
        rows, gold = fixtures(split)
        write(out / f'{split}-inputs.json', rows)
        write(out / f'{split}-answers.json', gold)
    write(out / 'dataset-manifest.json', {'schema': 'cmb.allocation-dataset/v1',
          'origin': 'synthetic', 'license': 'repository research-only terms',
          'dev_n': 24, 'test_n': 96, 'one_question_per_independent_pair': True,
          'seeds': {'dev': 1701, 'test': 2903},
          'sha256': {p.name: sha256(p) for p in out.glob('*.json')}})


def base_prompt(row):
    question = {
        'lag': 'What is the best lag? Return that integer from -4 to 4.',
        'sign': 'What is the sign of the correlation at the best lag? Return 1 for positive or -1 for negative.',
        'strong': 'Is the absolute correlation at the best lag at least 0.8? Return 1 for yes or 0 for no.',
        'zero_sign': 'What is the sign of the Pearson correlation at lag zero? Return 1 for positive or -1 for negative.'
    }[row['task']]
    return ('Analyze these two synthetic time series. Indices start at zero. For lag k, pair A[t] with B[t+k] '
            'where both indices exist. The best lag maximizes absolute Pearson correlation over integers -4 to 4; '
            'break ties with the smallest lag.\nA=' + json.dumps(row['a'], separators=(',', ':')) +
            '\nB=' + json.dumps(row['b'], separators=(',', ':')) + '\n' + question +
            '\nReply with only one integer, without explanation.')


def tool_context(measurement):
    keys = ('lag', 'correlation', 'zero_lag_correlation', 'strong', 'sign', 'zero_lag_sign')
    values = {k: (round(measurement[k], 6) if isinstance(measurement[k], float) else measurement[k])
              for k in keys} if measurement else {k: None for k in keys}
    return ('\nCMB computed measurements (null means unavailable): ' + json.dumps(values, separators=(',', ':')) +
            '\nUse the available measurements to answer the question. Reply with only one integer.')


def percentile(values):
    return [(sum(v < x for v in values) + .5 * (sum(v == x for v in values)-1)) / max(1, len(values)-1)
            for x in values]


def select(rows, policy, seed=31):
    """Rows contain only ID, public task type and pre-intervention features."""
    k, n = len(rows)//2, len(rows)
    rng = random.Random(seed)
    if policy == 'random':
        return set(rng.sample(range(n), k))
    entropy = percentile([r['entropy'] for r in rows])
    drift = percentile([r['drift'] for r in rows])
    if policy == 'shuffled_geometry':
        rng.shuffle(drift)
    priority = {'lag': 3, 'strong': 2, 'zero_sign': 1, 'sign': 0}
    values = {'entropy': entropy, 'length': [r['length'] for r in rows],
              'task_type': [priority[r['task']] for r in rows],
              'geometry': [(a+b)/2 for a, b in zip(entropy, drift)],
              'shuffled_geometry': [(a+b)/2 for a, b in zip(entropy, drift)]}
    if policy not in values:
        raise ValueError('unknown policy')
    return set(sorted(range(n), key=lambda i: (-values[policy][i], rows[i]['id'], i))[:k])


def collect(args):
    started = time.perf_counter()
    lock = json.loads(LOCK.read_text())
    if args.model.stat().st_size != lock['size_bytes'] or sha256(args.model) != lock['sha256']:
        raise ValueError('model lock mismatch')
    rows = json.loads((args.data / f'{args.split}-inputs.json').read_text())
    args.out.mkdir(parents=True, exist_ok=False)
    # The scoring-key file is never opened by collection or allocation.
    manifest = {'schema': 'cmb.allocation-run/v1', 'status': 'RUNNING', 'split': args.split,
                'model': lock, 'binary_sha256': sha256(args.binary), 'threads': 4, 'gpu_layers': 0,
                'max_tokens': 24, 'seed': 31, 'temperature': 0, 'platform': platform.platform(),
                'protocol_sha256': sha256(args.protocol), 'input_sha256': sha256(args.data / f'{args.split}-inputs.json'),
                'source_sha256': {p: sha256(ROOT/p) for p in SOURCE_FILES}}
    write(args.out / 'manifest.json', manifest)
    lines = [json.dumps({k: row[k] for k in ('id', 'a', 'b', 'max_lag', 'origin')} |
                        {'schema': 'cmb.series-query/v1'}, separators=(',', ':')) for row in rows]
    request_bytes = ('\n'.join(lines) + '\n').encode()
    (args.out/'tool-requests.jsonl').write_bytes(request_bytes)
    tool_start = time.perf_counter()
    tool = subprocess.run(['node', 'scripts/cmb-series-tool.mjs'], input=request_bytes,
                          cwd=ROOT, capture_output=True, check=True, timeout=120)
    tool_batch_ms = (time.perf_counter()-tool_start)*1000
    (args.out/'tool-responses.jsonl').write_bytes(tool.stdout)
    measures = [json.loads(s) for s in tool.stdout.splitlines()]
    if len(measures) != len(rows):
        raise ValueError('wrong measurement count')
    max_error = 0.
    for row, raw, m in zip(rows, lines, measures):
        if row['id'] != m['id'] or hashlib.sha256(raw.encode()).hexdigest() != m['input_sha256']:
            raise ValueError('measurement identity/hash mismatch')
        ref = reference(row['a'], row['b'])
        for key in ('lag', 'strong', 'sign', 'zero_lag_sign'):
            if m[key] != ref[key]:
                raise ValueError('CMB/oracle categorical disagreement')
        for key in ('correlation', 'zero_lag_correlation'):
            error = abs(m[key]-ref[key]); max_error = max(max_error, error)
            if error > 1e-10:
                raise ValueError('CMB/oracle numerical disagreement')
    # Input-only, within-task cyclic derangement. Different source, may share answer.
    donor = {}
    for task in TASKS:
        ids = [i for i, row in enumerate(rows) if row['task'] == task]
        random.Random(47).shuffle(ids)
        donor.update({i: ids[(j+1) % len(ids)] for j, i in enumerate(ids)})
    write(args.out/'control-donors.json', {rows[i]['id']: rows[j]['id'] for i, j in donor.items()})
    predictions, featrows, parity = [], [], []
    with (args.out/'observer.log').open('w') as log, gzip.open(args.out/'traces.jsonl.gz', 'wt') as traces:
        observer = Observer(args.binary.resolve(), args.model.resolve(), log, 4, 0)
        try:
            warm = observer.request({'id': 'warmup', 'prompt': 'Reply with only 1.', 'max_tokens': 4, 'observe': False})
            write(args.out/'warmup.json', warm)
            for i, row in enumerate(rows):
                base = base_prompt(row)
                prompts = {'ordinary': base, 'observed': base, 'tool': base+tool_context(measures[i]),
                           'null': base+tool_context(None), 'shuffled': base+tool_context(measures[donor[i]])}
                order = list(prompts)
                # Balanced deterministic rotation of request order to reduce position bias.
                order = order[i % 5:] + order[:i % 5]
                pair = {}
                for arm in order:
                    prompt = prompts[arm]
                    response = observer.request({'id': row['id']+'-'+arm, 'prompt': prompt,
                                                 'max_tokens': 24, 'temperature': 0, 'seed': 31,
                                                 'observe': arm == 'observed'})
                    if response['llama_revision'] != lock['llama_revision']:
                        raise ValueError('runtime pin mismatch')
                    traces.write(json.dumps(trace_record(response, prompt, args.out.name, lock['sha256']), allow_nan=False)+'\n')
                    traces.flush()
                    pair[arm] = response
                parity.append(pair['ordinary']['token_ids'] == pair['observed']['token_ids'])
                featrows.append({'id': row['id'], 'task': row['task'], **features(pair['observed']),
                                 'length': len(pair['observed']['token_ids'])})
                keep = ('completion', 'token_ids', 'prompt_tokens', 'wall_ms', 'stop', 'timings')
                predictions.append({'id': row['id'], 'family': row['family'], 'task': row['task'],
                                    'arms': {a: {k: v[k] for k in keep if k in v} for a, v in pair.items()}})
                print(f"{args.split} {i+1}/{len(rows)} {row['id']}: five arms collected", flush=True)
        finally:
            observer.close()
    # Persist outcomes/features and blinded selections before reading any answer key.
    write(args.out/'predictions.json', predictions)
    select_start = time.perf_counter()
    selections = {p: sorted(rows[i]['id'] for i in select(featrows, p)) for p in POLICIES}
    controller_ms = (time.perf_counter()-select_start)*1000
    write(args.out/'decisions.json', {'features': featrows, 'selected': selections,
                                     'controller_ms_all_policies': controller_ms})
    write(args.out/'numerical-checks.json', {'n': len(rows), 'status': 'PASS', 'max_abs_pearson_error': max_error})
    # Lossless compressed logs; weights/build output are never committed.
    with (args.out/'observer.log').open('rb') as source, gzip.open(args.out/'observer.log.gz', 'wb') as target:
        for chunk in iter(lambda: source.read(1024*1024), b''):
            target.write(chunk)
    (args.out/'observer.log').unlink()
    manifest.update({'status': 'PASS' if all(parity) else 'PARITY_FAILED', 'parity_equal': sum(parity),
                     'n': len(rows), 'tool_batch_ms': tool_batch_ms, 'collection_wall_ms': (time.perf_counter()-started)*1000,
                     'evidence_sha256': {p.name: sha256(p) for p in args.out.iterdir() if p.name != 'manifest.json'}})
    write(args.out/'manifest.json', manifest)
    if not all(parity):
        raise RuntimeError('observer parity failed')


def intervals(values):
    s = sorted(values)
    return [s[int(.025*(len(s)-1))], s[int(.975*(len(s)-1))]]


def analyze(data, run, draws=2000):
    manifest = json.loads((run/'manifest.json').read_text())
    if manifest['status'] != 'PASS':
        raise ValueError('run not complete')
    for name, digest in manifest['evidence_sha256'].items():
        if sha256(run/name) != digest:
            raise ValueError('evidence modified')
    pred = json.loads((run/'predictions.json').read_text())
    decisions = json.loads((run/'decisions.json').read_text())
    gold = json.loads((data/f"{manifest['split']}-answers.json").read_text())
    measures = [json.loads(s) for s in (run/'tool-responses.jsonl').read_text().splitlines()]
    donors = json.loads((run/'control-donors.json').read_text())
    n = len(pred)
    scored = [{a: int(score(v['completion'], gold[p['id']]['answer'])) for a, v in p['arms'].items()} for p in pred]
    arms = {}
    for arm in ('ordinary', 'observed', 'tool', 'null', 'shuffled'):
        arms[arm] = {'correct': sum(s[arm] for s in scored), 'n': n,
                     'llm_wall_ms': sum(p['arms'][arm]['wall_ms'] for p in pred),
                     'prompt_plus_emitted_tokens': sum(p['arms'][arm]['prompt_tokens']+len(p['arms'][arm]['token_ids']) for p in pred)}
    arms['deterministic_tool'] = {'correct': sum(m['zero_lag_sign' if p['task']=='zero_sign' else p['task']] == gold[p['id']]['answer'] for p,m in zip(pred,measures)),
                                 'n': n, 'tool_compute_ms': sum(m['compute_ms'] for m in measures),
                                 'tool_batch_ms_including_startup': manifest['tool_batch_ms']}
    policy_scores, policies = {}, {}
    for policy in POLICIES:
        selected = set(decisions['selected'][policy])
        expected = {pred[i]['id'] for i in select(decisions['features'], policy)}
        if selected != expected or len(selected) != n//2:
            raise ValueError('policy selection mismatch')
        policy_scores[policy] = [s['tool'] if p['id'] in selected else s['observed'] for p,s in zip(pred,scored)]
        policies[policy] = {'correct': sum(policy_scores[policy]), 'n': n, 'tool_calls': len(selected),
           'replay_llm_wall_ms': arms['observed']['llm_wall_ms'] + sum(p['arms']['tool']['wall_ms'] for p in pred if p['id'] in selected),
           'prompt_plus_emitted_tokens': arms['observed']['prompt_plus_emitted_tokens'] + sum(p['arms']['tool']['prompt_tokens']+len(p['arms']['tool']['token_ids']) for p in pred if p['id'] in selected),
           'selected_tool_compute_ms': sum(m['compute_ms'] for p,m in zip(pred,measures) if p['id'] in selected)}
    # Resample independent sources within family x task; reselect each fixed-budget policy.
    strata = defaultdict(list)
    for i,p in enumerate(pred):
        strata[(p['family'],p['task'])].append(i)
    rng = random.Random(90210)
    samples = defaultdict(list)
    for _ in range(draws):
        indices = [rng.choice(group) for group in strata.values() for _ in group]
        f = [decisions['features'][i] for i in indices]
        ss = [scored[i] for i in indices]
        acc = {p: sum(s['tool'] if j in select_set else s['observed'] for j,s in enumerate(ss))/n
               for p in POLICIES for select_set in [select(f,p)]}
        samples['geometry_minus_entropy'].append(acc['geometry']-acc['entropy'])
        samples['geometry_minus_task_type'].append(acc['geometry']-acc['task_type'])
        for arm in ('ordinary', 'null', 'shuffled'):
            samples['tool_minus_'+arm].append(sum(s['tool']-s[arm] for s in ss)/n)
    comparisons = {}
    for key, vals in samples.items():
        a,b = key.split('_minus_')
        delta = ((policies[a]['correct']-policies[b]['correct']) if a=='geometry' else (arms[a]['correct']-arms[b]['correct']))/n
        comparisons[key] = {'delta': delta, 'ci95': intervals(vals)}
    def passes(key, margin):
        c=comparisons[key]
        return c['delta'] >= margin and c['ci95'][0] > 0
    report = {'schema':'cmb.allocation-result/v1','split':manifest['split'],'n':n,'arms':arms,'policies':policies,
              'comparisons':comparisons,'bootstrap':{'draws':draws,'seed':90210,'strata':'family x task','reselect_policies':True},
              'gates':{'information_signal':passes('tool_minus_ordinary',.10),
                       'correct_context_controls':passes('tool_minus_null',.10) and passes('tool_minus_shuffled',.10),
                       'geometry_allocation':passes('geometry_minus_entropy',.05) and passes('geometry_minus_task_type',.05)},
              'repair':{'repaired':sum(not s['ordinary'] and s['tool'] for s in scored),
                        'regressed':sum(s['ordinary'] and not s['tool'] for s in scored)},
              'geometry_available':sum(f['geometry_available'] for f in decisions['features']),
              'shuffled_answer_agreement':{task:sum(gold[p['id']]['answer']==gold[donors[p['id']]]['answer'] for p in pred if p['task']==task) for task in TASKS},
              'per_task':{task:{a:sum(s[a] for p,s in zip(pred,scored) if p['task']==task) for a in arms if a!='deterministic_tool'} for task in TASKS},
              'limitations':['Synthetic questions whose exact answer is available in tool output',
                             'One 0.5B quantized model, no weights updated, no modality learned',
                             'Equal tool-call quotas and max response caps; not equal wall-time/FLOPs/tokens',
                             'Offline replay; no end-to-end latency or compute-efficiency claim',
                             'Bootstrap uncertainty is within the fixed synthetic family mixture, not new-model uncertainty']}
    write(run/'analysis.json', report)
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('prepare');p.add_argument('--out',type=Path,required=True)
    p=sub.add_parser('run')
    for name in ('data','out','binary','model','protocol'):
        p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--split',choices=('dev','test'),required=True)
    p=sub.add_parser('analyze');p.add_argument('--data',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    args=parser.parse_args()
    if args.command=='prepare':prepare(args.out)
    elif args.command=='run':collect(args)
    else:analyze(args.data,args.run)
