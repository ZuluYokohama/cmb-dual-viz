"""Independent checks against signed vectors retained by the native collector."""
import argparse
import json
import math
from pathlib import Path
from pilot import sha256


def verify(run):
    manifest = json.loads((run / 'manifest.json').read_text())
    if manifest['status'] != 'PASS':
        raise ValueError('run is incomplete or failed')
    for name, expected in manifest['evidence_sha256'].items():
        if Path(name).name != name or sha256(run / name) != expected:
            raise ValueError('evidence hash mismatch: ' + name)
    observed_rows, tokens, max_norm_error, max_drift_error = 0, 0, 0., 0.
    for line in (run / 'traces.jsonl').read_text().splitlines():
        trace = json.loads(line)
        if trace['model_sha256'] != manifest['model']['sha256']:
            raise ValueError('model identity mismatch')
        observation = trace['observation']
        if observation['llama_revision'] != manifest['model']['llama_revision']:
            raise ValueError('runtime identity mismatch')
        if not observation['observe']:
            if observation['observations']:
                raise ValueError('ordinary run contains observer data')
            continue
        observed_rows += 1
        previous = None
        for i, token in enumerate(observation['observations']):
            vector = token['embedding']
            if len(vector) != observation['embedding_dim'] or not all(math.isfinite(v) for v in vector):
                raise ValueError('invalid raw vector')
            if token['step'] != i or not 0 <= token['entropy_nats'] <= math.log(observation['vocab_size']) + 1e-5:
                raise ValueError('invalid step or entropy')
            norm = math.sqrt(math.fsum(v * v for v in vector))
            error = abs(norm - token['embedding_norm'])
            max_norm_error = max(max_norm_error, error)
            if error > 1e-7 * max(1, norm):
                raise ValueError('norm reference mismatch')
            drift = token['cosine_drift']
            if previous is None:
                if drift is not None:
                    raise ValueError('first vector has no predecessor')
            else:
                prev_norm = math.sqrt(math.fsum(v * v for v in previous))
                if norm and prev_norm:
                    expected = 1 - max(-1, min(1, math.fsum(a*b for a, b in zip(vector, previous)) / (norm * prev_norm)))
                    error = abs(expected - drift)
                    max_drift_error = max(max_drift_error, error)
                    if error > 1e-7:
                        raise ValueError('cosine reference mismatch')
                elif drift is not None:
                    raise ValueError('zero-norm cosine is undefined')
            previous = vector
            tokens += 1
    if observed_rows == 0:
        raise ValueError('no observed rows')
    return {'status': 'PASS', 'observed_rows': observed_rows, 'observed_tokens_including_eog': tokens,
            'max_norm_absolute_error': max_norm_error, 'max_drift_absolute_error': max_drift_error,
            'entropy_reference': 'analytic C++ metrics test; full logits not retained'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    result = verify(args.run)
    (args.run / 'numerical-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
