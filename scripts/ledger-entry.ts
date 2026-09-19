import {
  fabricShSynth,
  fabricCorrelate,
  ledgerAppend,
  ledgerClear,
  ledgerSnapshot,
} from '../src/compute';
import { genExampleCl, genSyntheticGcpLike } from '../src/math/generators';
import type { CorrelateSeed, ThreadSeriesInput } from '../src/math/correlates';

export function dump() {
  ledgerClear();
  ledgerAppend({
    kind: 'ingest',
    op: 'INGEST_PARSE',
    tp: 'TP_DOC_BATCH',
    epistemic: 'DERIVED/MEANING-MAP',
    device: 'cpu',
    detail: {
      name: 'boot-demo',
      note: 'Seeded EXAMPLE C_ℓ + synthetic series — not Planck/GCP measured',
    },
  });
  fabricShSynth({ ellMax: 8, seed: 42, ledger: true });
  const datasets = [genExampleCl(24), genSyntheticGcpLike()];
  const thread: ThreadSeriesInput = {
    Cl: datasets[0]!.cl ?? [],
    ellFocus: 8,
    ellMax: 24,
    coherenceScore: 0.15,
    coherenceZ: 0.8,
    timePhase: 0,
  };
  const seed: CorrelateSeed = {
    id: 'seed-thread-a',
    label: 'Thread A',
    kind: 'thread-a-ell',
    series: Array.from({ length: 20 }, (_, i) => Math.sin(i / 3)),
    epistemic: 'PHYSICS-BACKED (EXAMPLE)',
  };
  const corr = fabricCorrelate({
    seed,
    datasets,
    nodes: [],
    thread,
    ledger: true,
  });
  ledgerAppend({
    kind: 'correlate',
    op: 'CORRELATE_BATCH',
    tp: 'TP_PAIR_BLOCK',
    epistemic: corr.epistemic,
    device: 'cpu',
    ms: corr.ms,
    detail: {
      scanned: corr.scanned,
      topZ: corr.hits[0]?.zToy ?? null,
      note: 'z_toy toy null — high score ≠ OPEN',
    },
  });
  return ledgerSnapshot().reverse();
}
