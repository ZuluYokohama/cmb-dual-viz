interface Props {
  score: number;
  nullMean: number;
  nullStd: number;
  zScore: number;
  visible: boolean;
}

export function CoherenceMetrics({ score, nullMean, nullStd, zScore, visible }: Props) {
  if (!visible) {
    return (
      <div className="coherence-metrics dimmed">
        <h3>Coherence vs null</h3>
        <p className="hint">Enable overlay to compute metrics.</p>
      </div>
    );
  }

  return (
    <div className="coherence-metrics">
      <h3>
        <span className="badge badge-metaphor">Metaphor</span>
        Coherence vs shuffle null
      </h3>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Score (autocorr)</span>
          <span className="metric-value">{score.toFixed(4)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Null mean</span>
          <span className="metric-value">{nullMean.toFixed(4)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Null σ</span>
          <span className="metric-value">{nullStd.toFixed(4)}</span>
        </div>
        <div className="metric highlight">
          <span className="metric-label">z vs null</span>
          <span className="metric-value">{zScore.toFixed(2)}σ</span>
        </div>
      </div>
      <p className="hint">
        Mid-scale spatial autocorrelation of the synthetic coherence field vs pixel-shuffled
        baseline. Exploratory metric — not a measured CMB/GCP observable.
      </p>
    </div>
  );
}
