import type { MeaningNode } from '../ingest/types';
import {
  dressingHint,
  dressingLabel,
  resolveDressingDisplay,
  type DressingStateMap,
} from '../math/dressing';

interface Props {
  node: MeaningNode | null;
  dressingMap?: DressingStateMap;
}

export function NodeInspector({ node, dressingMap = {} }: Props) {
  if (!node) {
    return (
      <div className="node-inspector empty">
        <div className="sky-title">Node inspector</div>
        <p className="hint">Click a meaning-map node for provenance + epistemic label.</p>
      </div>
    );
  }
  const dressing = resolveDressingDisplay(node, dressingMap);
  const dressClass =
    dressing === 'bare'
      ? 'dress-bare'
      : dressing === 'dressed_candidate'
        ? 'dress-candidate'
        : dressing === 'invariant_claim'
          ? 'dress-invariant'
          : 'dress-scaffold';
  return (
    <div className="node-inspector">
      <div className="sky-title">Node inspector</div>
      <div className="insp-label">{node.label}</div>
      <div className="insp-row">
        <span className="insp-k">kind</span>
        <span className="insp-v">{node.kind}</span>
      </div>
      <div className="insp-row">
        <span className="insp-k">dressing</span>
        <span className="insp-v">
          <span className={`dress-pill ${dressClass}`} title={dressingHint(dressing)}>
            {dressingLabel(dressing)}
          </span>
        </span>
      </div>
      <div className="insp-row">
        <span className="insp-k">epistemic</span>
        <span className="insp-v">
          <span
            className={`badge ${
              node.epistemic.includes('PHYSICS')
                ? 'badge-physics'
                : node.epistemic.includes('METAPHOR')
                  ? 'badge-metaphor'
                  : 'badge-derived'
            }`}
          >
            {node.epistemic}
          </span>
        </span>
      </div>
      <div className="insp-row">
        <span className="insp-k">pull A / B</span>
        <span className="insp-v mono">
          {node.pullA.toFixed(2)} / {node.pullB.toFixed(2)}
        </span>
      </div>
      <div className="insp-row">
        <span className="insp-k">source</span>
        <span className="insp-v mono">{node.datasetId}</span>
      </div>
      <p className="insp-prov">{node.provenance}</p>
      {node.payload != null && (
        <pre className="insp-payload">{JSON.stringify(node.payload, null, 2).slice(0, 400)}</pre>
      )}
    </div>
  );
}
