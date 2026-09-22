import { describe, expect, it } from 'vitest';
import { parseLlmTrace, parseLlmTraceJsonl } from './llmTrace';

function fixture() {
  return {
    schema: 'cmb.llm-trace/v1', run_id: 'test', model_sha256: 'a'.repeat(64), prompt_sha256: 'b'.repeat(64),
    observation: {
      schema: 'cmb.llm-observation/v1', id: 'sample', llama_revision: 'c'.repeat(40), feature_revision: 'final-output-v1',
      observe: true, prompt_tokens: 3, rendered_prompt: 'test prompt', vocab_size: 4, embedding_dim: 2,
      seed: 1, temperature: 0, max_tokens: 1, threads: 4, gpu_layers_requested: 0,
      token_ids: [1], completion: '1', stop: 'limit', prefill_ms: 1, decode_ms: 0, observer_ms: .1, native_total_ms: 2, wall_ms: 3,
      observations: [{step: 0, token_id: 1, emitted: true, entropy_nats: Math.log(4), logit_margin: 0,
        embedding_norm: 1, cosine_drift: null, embedding: [1, 0]}],
    },
  };
}
describe('LLM trace contract', () => {
  it('admits measured state without turning it into a sky/series value', () => {
    const value = fixture();
    expect(parseLlmTrace(value)).toEqual(value);
    expect(parseLlmTrace(value)).not.toHaveProperty('value');
  });
  it('rejects unknown claims and unknown fields', () => {
    expect(() => parseLlmTrace({...fixture(), truth: true})).toThrow();
    const f = fixture();
    expect(() => parseLlmTrace({...f, observation: {...f.observation, correct: true}})).toThrow();
  });
  it('rejects invalid provenance, nonfinite data, dimensions and entropy', () => {
    const mutations = [
      (f: ReturnType<typeof fixture>) => { f.model_sha256 = 'unverified'; },
      (f: ReturnType<typeof fixture>) => { f.observation.observations[0].embedding[0] = Infinity; },
      (f: ReturnType<typeof fixture>) => { f.observation.observations[0].entropy_nats = 10; },
      (f: ReturnType<typeof fixture>) => { f.observation.embedding_dim = 3; },
      (f: ReturnType<typeof fixture>) => { f.observation.observations[0].token_id = 2; },
    ];
    for (const mutate of mutations) { const f = fixture(); mutate(f); expect(() => parseLlmTrace(f)).toThrow(); }
  });
  it('rejects missing measurements and inconsistent observer mode', () => {
    const f = fixture();
    f.observation.observe = false;
    expect(() => parseLlmTrace(f)).toThrow();
    f.observation.observations = [];
    expect(parseLlmTrace(f).observation.observe).toBe(false);
    f.observation.observe = true;
    expect(() => parseLlmTrace(f)).toThrow();
  });
  it('rejects the whole import on malformed or duplicated rows', () => {
    const text = JSON.stringify(fixture());
    expect(parseLlmTraceJsonl(text)).toHaveLength(1);
    expect(() => parseLlmTraceJsonl(text + '\n' + text)).toThrow('Duplicate');
    expect(() => parseLlmTraceJsonl(text + '\n{}')).toThrow();
    expect(() => parseLlmTraceJsonl('')).toThrow();
  });
});
