interface AmpScale {
  [ell: number]: number;
}

interface Props {
  ellMax: number;
  seed: number;
  ampScales: AmpScale;
  showCoherence: boolean;
  coherenceOpacity: number;
  cohSeed: number;
  busy: boolean;
  timePhase: number;
  playing: boolean;
  ellFocus: number;
  onEllMax: (v: number) => void;
  onSeed: (v: number) => void;
  onAmpScale: (ell: number, v: number) => void;
  onShowCoherence: (v: boolean) => void;
  onCoherenceOpacity: (v: number) => void;
  onCohSeed: (v: number) => void;
  onResynthesize: () => void;
  onTimePhase: (v: number) => void;
  onPlaying: (v: boolean) => void;
  onEllFocus: (v: number) => void;
  showAnalogy?: boolean;
  onShowAnalogy?: (v: boolean) => void;
  computeDevice?: 'cpu' | 'webgpu';
  gateNote?: string;
}

const AMP_ELLS = [2, 3, 4, 5, 6];

export function Controls({
  ellMax,
  seed,
  ampScales,
  showCoherence,
  coherenceOpacity,
  cohSeed,
  busy,
  timePhase,
  playing,
  ellFocus,
  onEllMax,
  onSeed,
  onAmpScale,
  onShowCoherence,
  onCoherenceOpacity,
  onCohSeed,
  onResynthesize,
  onTimePhase,
  onPlaying,
  onEllFocus,
  showAnalogy = false,
  onShowAnalogy,
  computeDevice = 'cpu',
  gateNote = '',
}: Props) {
  return (
    <div className="controls">
      <section className="control-section">
        <h3>
          <span className="badge badge-physics">Physics-backed</span>
          Thread A — Harmonics
        </h3>
        <p className="device-line">
          device:{' '}
          <span className="device-pill" data-device={computeDevice}>
            {computeDevice}
          </span>
          {gateNote ? <span className="hint-inline"> · {gateNote}</span> : null}
        </p>
        <label>
          ℓ max
          <input
            type="range"
            min={4}
            max={64}
            step={1}
            value={ellMax}
            onChange={(e) => onEllMax(Number(e.target.value))}
          />
          <span className="val">{ellMax}</span>
        </label>
        <label>
          ℓ focus (convergence)
          <input
            type="range"
            min={2}
            max={ellMax}
            step={1}
            value={Math.min(ellFocus, ellMax)}
            onChange={(e) => onEllFocus(Number(e.target.value))}
          />
          <span className="val">{Math.min(ellFocus, ellMax)}</span>
        </label>
        <label>
          Map seed
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeed(Number(e.target.value) || 0)}
          />
        </label>
        <div className="amp-group">
          <span className="amp-title">Mode amplitude scales (low-ℓ)</span>
          {AMP_ELLS.filter((ell) => ell <= ellMax).map((ell) => (
            <label key={ell} className="amp-row">
              ℓ={ell}
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={ampScales[ell] ?? 1}
                onChange={(e) => onAmpScale(ell, Number(e.target.value))}
              />
              <span className="val">{(ampScales[ell] ?? 1).toFixed(2)}</span>
            </label>
          ))}
        </div>
        <button type="button" className="btn primary" disabled={busy} onClick={onResynthesize}>
          {busy ? 'Synthesizing…' : 'Resynthesize sky'}
        </button>
        <p className="hint">
          EXAMPLE C_ℓ peaks compressed near ℓ≈8,22,38,52 for the interactive range — not Planck.
        </p>
      </section>

      <section className="control-section">
        <h3>
          <span className="badge badge-metaphor">Metaphor / research</span>
          Thread B — Coherence
        </h3>
        <p className="epistemic-note">
          Toy intuition instrument — <strong>NOT</strong> a claim that GCP = CMB physics.
          Exploratory overlay only. Space = play/pause scrub.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={showCoherence}
            onChange={(e) => onShowCoherence(e.target.checked)}
          />
          Show coherence overlay
        </label>
        <label>
          Overlay opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={coherenceOpacity}
            disabled={!showCoherence}
            onChange={(e) => onCoherenceOpacity(Number(e.target.value))}
          />
          <span className="val">{coherenceOpacity.toFixed(2)}</span>
        </label>
        <label>
          Coherence seed
          <input
            type="number"
            value={cohSeed}
            onChange={(e) => onCohSeed(Number(e.target.value) || 0)}
          />
        </label>
        <label>
          Time scrub
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={timePhase}
            onChange={(e) => onTimePhase(Number(e.target.value))}
          />
          <span className="val">{timePhase.toFixed(3)}</span>
        </label>
        <button type="button" className="btn ghost" onClick={() => onPlaying(!playing)}>
          {playing ? 'Pause ▐▐' : 'Play ▶'} <kbd>Space</kbd>
        </button>
      </section>

      <section className="control-section">
        <h3>
          <span className="badge badge-analogy">Thin / deferred</span>
          Display
        </h3>
        <label className="check">
          <input
            type="checkbox"
            checked={showAnalogy}
            onChange={(e) => onShowAnalogy?.(e.target.checked)}
          />
          Show Ulam analogy panel
        </label>
        <p className="hint">
          Default Engine UX = Core + Instrument only. Ulam is Thin — also enable with{' '}
          <code>?analogy=1</code>.
        </p>
      </section>
    </div>
  );
}
