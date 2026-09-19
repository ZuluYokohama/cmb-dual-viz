import type { IngestedDataset } from './types';
import { buildMeaningGraph } from '../math/meaningMap';
import { buildSeeds, scanCorrelates } from '../math/correlates';

/** Actual downstream CPU route, with fixed toy context. Checks execution, not inference. */
export function stagingSmoke(dataset: IngestedDataset) {
  const thread = { Cl: [0, 0, 1, 0.5, 0.25, 0.1, 0.05, 0.01, 0.005], ellMax: 8,
    ellFocus: 4, coherenceZ: 0, coherenceScore: 0, timePhase: 0.5 };
  const graph = buildMeaningGraph([dataset], thread);
  const dataNodes = graph.nodes.filter(n => n.datasetId === dataset.id);
  if (dataNodes.length === 0) throw new Error('No data nodes reached the meaning map');
  for (const n of graph.nodes) {
    if (![n.x, n.y, n.pullA, n.pullB, ...n.features].every(Number.isFinite)) throw new Error(`Nonfinite meaning-map output at ${n.id}`);
  }
  if (graph.edges.some(e => !Number.isFinite(e.weight))) throw new Error('Nonfinite graph edge');
  const seeds = buildSeeds({ datasets: [dataset], nodes: graph.nodes, selectedNode: dataNodes[0], thread });
  let hitCount = 0;
  for (const seed of seeds) {
    const scan = scanCorrelates(seed, [dataset], graph.nodes, thread, { maxLag: 3, topN: 12 });
    for (const h of scan.hits) {
      if (![h.score, h.zToy, h.nullMean, h.nullStd, h.lag].every(Number.isFinite)) throw new Error('Nonfinite correlate output');
      if (h.epistemic === 'PHYSICS-BACKED') throw new Error('Correlate label promotion');
      hitCount++;
    }
  }
  return { device: 'cpu', context: 'fixed synthetic fixture', dataNodes: dataNodes.length, seeds: seeds.length, hitCount,
    status: 'pass', scientificValidation: 'not-run', gpuValidation: 'not-run' };
}
