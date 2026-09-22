"""Small exact-answer smoke and replay allocation study. No generated code execution."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import random
import re
import selectors
import statistics
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
LOCK = Path(__file__).with_name('model.lock.json')


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def trace_record(response, prompt, run_id, model_hash):
    return {'schema': 'cmb.llm-trace/v1', 'run_id': run_id, 'model_sha256': model_hash,
            'prompt_sha256': hashlib.sha256(prompt.encode()).hexdigest(), 'observation': response}


def cases():
    # Original, deliberately tiny engineering fixtures; no benchmark/generalization claim.
    pairs = [(17, 28), (43, 19), (57, 36), (83, 49), (124, 267), (381, 479)]
    result = []
    for i, (a, b) in enumerate(pairs):
        result.append({'id': f'add-{i}', 'family': 'addition', 'question': f'What is {a} + {b}?', 'answer': a + b})
        result.append({'id': f'mul-{i}', 'family': 'multiplication', 'question': f'What is {a} * {b}?', 'answer': a * b})
    return result


def score(text, expected):
    # Fail closed on explanatory text/multiple numbers; this is format + exact value.
    return bool(re.fullmatch(r'\s*[+-]?\d+\s*', text)) and int(text.strip()) == expected


def features(observation):
    rows = observation['observations']
    if not rows:
        raise ValueError('observed token statistics required')
    entropy = statistics.mean(r['entropy_nats'] for r in rows) / math.log(observation['vocab_size'])
    drifts = [r['cosine_drift'] for r in rows if r['cosine_drift'] is not None]
    drift = statistics.mean(drifts) / 2 if drifts else 0.0
    if not all(math.isfinite(x) and -1e-6 <= x <= 1.000001 for x in (entropy, drift)):
        raise ValueError('invalid normalized features')
    return {'entropy': entropy, 'drift': drift, 'geometry_available': bool(drifts)}


def choose(feature_rows, k, policy, seed=31):
    # Only measured features enter this function: no answers or outcomes.
    if k < 0 or k > len(feature_rows):
        raise ValueError('invalid action budget')
    ids = sorted(feature_rows)
    rng = random.Random(seed)
    if policy == 'random':
        return set(rng.sample(ids, k))
    drifts = [feature_rows[i]['drift'] for i in ids]
    if policy == 'shuffled_geometry':
        rng.shuffle(drifts)
    if policy not in ('confidence', 'geometry', 'shuffled_geometry'):
        raise ValueError('unknown policy')
    values = {}
    for i, drift in zip(ids, drifts):
        h = feature_rows[i]['entropy']
        values[i] = h if policy == 'confidence' else 0.5 * h + 0.5 * drift
    return set(sorted(ids, key=lambda i: (-values[i], i))[:k])


class Observer:
    def __init__(self, binary, model, log, threads, gpu_layers):
        self.proc = subprocess.Popen([str(binary), str(model), str(threads), str(gpu_layers)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log)
        self.buffer = b''
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.proc.stdout, selectors.EVENT_READ)

    def request(self, payload, timeout=180):
        start = time.perf_counter()
        self.proc.stdin.write((json.dumps(payload) + '\n').encode())
        self.proc.stdin.flush()
        deadline = start + timeout
        while b'\n' not in self.buffer:
            remaining = deadline - time.perf_counter()
            if remaining <= 0 or not self.selector.select(remaining):
                raise TimeoutError('observer request timed out; inspect observer.log')
            chunk = os.read(self.proc.stdout.fileno(), 65536)
            if not chunk:
                raise RuntimeError('observer exited; inspect observer.log')
            self.buffer += chunk
            if len(self.buffer) > 32 * 1024 * 1024:
                raise ValueError('observer response exceeds 32 MiB')
        line, self.buffer = self.buffer.split(b'\n', 1)
        result = json.loads(line)
        if result.get('id') != payload['id'] or result.get('schema') != 'cmb.llm-observation/v1':
            raise ValueError('observer response identity mismatch')
        result['wall_ms'] = (time.perf_counter() - start) * 1000
        return result

    def close(self):
        self.selector.close()
        if self.proc.poll() is None:
            self.proc.stdin.close()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.proc.stdout.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--gpu-layers', type=int, default=0)
    parser.add_argument('--limit', type=int, default=12)
    args = parser.parse_args()
    if not 2 <= args.limit <= 12:
        parser.error('--limit must be between 2 and 12')
    lock = json.loads(LOCK.read_text())
    if args.model.stat().st_size != lock['size_bytes'] or sha256(args.model) != lock['sha256']:
        raise ValueError('model differs from pinned HF artifact')
    args.out.mkdir(parents=True, exist_ok=False)
    task_list = cases()[:args.limit]
    task_bytes = json.dumps(task_list, sort_keys=True).encode()
    manifest = {'schema': 'cmb.llm-run/v1', 'status': 'RUNNING', 'purpose': 'engineering-smoke',
                'model': lock, 'binary_sha256': sha256(args.binary), 'harness_sha256': sha256(__file__),
                'task_sha256': hashlib.sha256(task_bytes).hexdigest(), 'platform': platform.platform(),
                'python': platform.python_version(), 'threads': args.threads, 'gpu_layers_requested': args.gpu_layers,
                'policy_revision': 'fixed-half-entropy-half-drift-v1', 'seed': 31, 'max_tokens': 24,
                'budget': {'kind': 'equal-extra-attempt-count', 'k': len(task_list) // 2},
                'limitations': ['No training or fitted controller', 'No held-out capability claim',
                                'Replay costs are estimates; not matched wall-time or FLOPs',
                                'Final-output states only; not intermediate-layer telemetry']}
    source_paths = ['bridge/llama_observer/CMakeLists.txt', 'bridge/llama_observer/main.cpp',
                    'bridge/llama_observer/metrics.h', 'experiments/llm/pilot.py',
                    'experiments/llm/model.lock.json']
    manifest['source_sha256'] = {p: sha256(ROOT / p) for p in source_paths}
    (args.out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (args.out / 'tasks.json').write_bytes(task_bytes)
    answers, parity = {}, []
    with (args.out / 'observer.log').open('w') as log, (args.out / 'traces.jsonl').open('w') as trace:
        observer = Observer(args.binary.resolve(), args.model.resolve(), log, args.threads, args.gpu_layers)
        try:
            # Loading and first-use warmup are outside per-request replay cost; retain their record.
            warm = observer.request({'id': 'warmup', 'prompt': 'Reply with the number 1.', 'max_tokens': 4, 'observe': False})
            (args.out / 'warmup.json').write_text(json.dumps(warm) + '\n')
            for index, task in enumerate(task_list):
                prompt = task['question'] + ' Reply with only the integer answer, no explanation.'
                pair = {}
                # Alternate order to reduce a fixed warm-cache bias; still not a timing study.
                for observe in ([True, False] if index % 2 == 0 else [False, True]):
                    name = 'observed' if observe else 'ordinary'
                    request = {'id': task['id'] + '-' + name, 'prompt': prompt, 'max_tokens': 24,
                               'temperature': 0, 'seed': 31, 'observe': observe}
                    response = observer.request(request)
                    if response['llama_revision'] != lock['llama_revision']:
                        raise ValueError('unexpected llama.cpp build')
                    trace.write(json.dumps(trace_record(response, prompt, args.out.name, lock['sha256']), allow_nan=False) + '\n')
                    trace.flush()
                    pair[name] = response
                parity.append(pair['ordinary']['token_ids'] == pair['observed']['token_ids'])
                retry = observer.request({'id': task['id'] + '-retry', 'prompt': prompt + ' Check the calculation before answering.',
                                          'max_tokens': 24, 'temperature': 0, 'seed': 31, 'observe': False})
                trace.write(json.dumps(trace_record(retry, prompt + ' Check the calculation before answering.', args.out.name, lock['sha256']), allow_nan=False) + '\n')
                pair['retry'] = retry
                answers[task['id']] = pair
                print(f"{task['id']}: collected observed/ordinary/retry", flush=True)
        finally:
            observer.close()
    feature_rows = {i: features(v['observed']) for i, v in answers.items()}
    # Commit selections before consulting the independent answer key.
    selections = {p: sorted(choose(feature_rows, len(task_list) // 2, p))
                  for p in ('random', 'confidence', 'geometry', 'shuffled_geometry')}
    (args.out / 'decisions.json').write_text(json.dumps({'features': feature_rows, 'selected': selections}, indent=2) + '\n')
    results = {}
    for policy, selected in {'ordinary': [], **selections}.items():
        correct, cost, token_cost = 0, 0.0, 0
        for task in task_list:
            pair = answers[task['id']]
            base = pair['ordinary'] if policy == 'ordinary' else pair['observed']
            chosen = pair['retry'] if task['id'] in selected else base
            correct += score(chosen['completion'], task['answer'])
            cost += base['wall_ms'] + (pair['retry']['wall_ms'] if task['id'] in selected else 0)
            token_cost += base['prompt_tokens'] + len(base['token_ids'])
            if task['id'] in selected:
                token_cost += pair['retry']['prompt_tokens'] + len(pair['retry']['token_ids'])
        results[policy] = {'correct': correct, 'n': len(task_list), 'accuracy': correct / len(task_list),
                           'extra_attempts': len(selected), 'replay_wall_ms': cost, 'processed_plus_emitted_tokens': token_cost}
    report = {'schema': 'cmb.llm-pilot/v1', 'engineering_only': True, 'quality_gain_established': False,
              'parity': {'equal_token_sequences': sum(parity), 'total': len(parity)}, 'policies': results,
              'geometry_available': sum(f['geometry_available'] for f in feature_rows.values()),
              'notes': ['Retry replaces the first answer without consulting labels.',
                        'All retries were collected offline; replay is not a live deployment benchmark.',
                        'Total offline collection exceeds any individual replay policy budget.']}
    transitions = {'repaired': 0, 'regressed': 0, 'unchanged_correctness': 0}
    for task in task_list:
        before = score(answers[task['id']]['ordinary']['completion'], task['answer'])
        after = score(answers[task['id']]['retry']['completion'], task['answer'])
        transitions['repaired' if after and not before else 'regressed' if before and not after else 'unchanged_correctness'] += 1
    report['retry_action_diagnostic'] = transitions
    (args.out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    manifest['status'] = 'PASS' if all(parity) else 'PARITY_FAILED'
    manifest['evidence_sha256'] = {p.name: sha256(p) for p in args.out.iterdir() if p.is_file() and p.name != 'manifest.json'}
    (args.out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if not all(parity):
        raise RuntimeError('observer changed token sequences; see report')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
