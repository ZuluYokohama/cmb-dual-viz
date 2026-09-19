/**
 * Built-in EXAMPLE generators for ingestion demos.
 * All outputs marked PHYSICS-BACKED (EXAMPLE) or METAPHOR/RESEARCH — never real measured data.
 */

import { exampleCl, mulberry32, gaussian } from './sphericalHarmonics';
import type { IngestedDataset } from '../ingest/types';
import { nextIngestId } from '../ingest';

/** EXAMPLE acoustic C_ℓ curve as ingestible dataset */
export function genExampleCl(ellMax = 64): IngestedDataset {
  const cl: number[] = [];
  for (let ell = 0; ell <= ellMax; ell++) cl.push(exampleCl(ell));
  return {
    id: nextIngestId('gen'),
    name: 'EXAMPLE acoustic C_ℓ',
    type: 'generator',
    epistemic: 'PHYSICS-BACKED (EXAMPLE)',
    enabled: true,
    format: 'generator-cl',
    cl,
    meta: {
      note: 'Toy acoustic-peak style C_ℓ — NOT Planck. Peaks compressed into interactive ℓ range.',
    },
    ingestedAt: Date.now(),
  };
}

/** Synthetic GCP-like random series (METAPHOR — not real GCP) */
export function genSyntheticGcpLike(n = 256, seed = 99): IngestedDataset {
  const rng = mulberry32(seed);
  const series: { t: number; value: number }[] = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    // AR(1) + occasional bursts — toy "network coherence" metaphor
    x = 0.92 * x + 0.08 * gaussian(rng);
    if (rng() < 0.03) x += (rng() - 0.5) * 4;
    series.push({ t: i, value: x });
  }
  return {
    id: nextIngestId('gen'),
    name: 'Synthetic GCP-like series',
    type: 'generator',
    epistemic: 'METAPHOR/RESEARCH',
    enabled: true,
    format: 'generator-gcp-like',
    series,
    claims: [
      {
        id: 'disclaimer',
        text: 'Synthetic random series for coherence metaphor only. Not Global Consciousness Project data. Not a claim of non-local effects.',
      },
    ],
    meta: { seed, n, disclaimer: 'EXAMPLE/METAPHOR only' },
    ingestedAt: Date.now(),
  };
}

/** Synthetic anisotropy sky samples */
export function genAnisotropySamples(n = 120, seed = 21): IngestedDataset {
  const rng = mulberry32(seed);
  const skySamples = [];
  for (let i = 0; i < n; i++) {
    const u = rng();
    const theta = Math.acos(1 - 2 * u); // uniform on sphere
    const phi = rng() * 2 * Math.PI;
    // Mild large-scale modulation (toy)
    const value =
      0.6 * Math.sin(2 * theta) * Math.cos(phi) +
      0.3 * Math.sin(theta) * Math.sin(2 * phi) +
      0.15 * gaussian(rng);
    skySamples.push({ theta, phi, value });
  }
  return {
    id: nextIngestId('gen'),
    name: 'Synthetic anisotropy samples',
    type: 'generator',
    epistemic: 'PHYSICS-BACKED (EXAMPLE)',
    enabled: true,
    format: 'generator-sky',
    skySamples,
    meta: { seed, n, note: 'Toy sky samples — not Planck maps' },
    ingestedAt: Date.now(),
  };
}

export function genDemoClaims(): IngestedDataset {
  return {
    id: nextIngestId('gen'),
    name: 'Demo meaning claims',
    type: 'generator',
    epistemic: 'DERIVED/MEANING-MAP',
    enabled: true,
    format: 'generator-text',
    claims: [
      {
        id: '1',
        text: 'Acoustic peaks in the CMB power spectrum encode the sound horizon at recombination.',
      },
      {
        id: '2',
        text: 'Low multipoles probe the largest angular scales on the last-scattering surface.',
      },
      {
        id: '3',
        text: 'Field coherence overlays are research metaphors for exploring correlated structure — not evidence of non-local mind effects.',
      },
      {
        id: '4',
        text: 'Meaning-map convergence projects heterogeneous ingest streams onto shared geometry for intuition.',
      },
      {
        id: '5',
        text: 'Silk damping suppresses power at the highest multipoles in the EXAMPLE toy C_ℓ curve.',
      },
    ],
    ingestedAt: Date.now(),
  };
}
