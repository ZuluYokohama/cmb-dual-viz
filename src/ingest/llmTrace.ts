/** Separate from astronomy intake. Measurements are not correctness labels. */
export interface TokenObservation {
  step: number; token_id: number; emitted: boolean;
  entropy_nats: number; logit_margin: number; embedding_norm: number;
  cosine_drift: number | null; embedding: number[];
}
export interface LlmObservation {
  schema: 'cmb.llm-observation/v1'; id: string; llama_revision: string;
  feature_revision: 'final-output-v1'; observe: boolean; prompt_tokens: number;
  rendered_prompt: string; vocab_size: number; embedding_dim: number; seed: number;
  temperature: number; max_tokens: number; threads: number; gpu_layers_requested: number;
  token_ids: number[]; completion: string; stop: 'eog' | 'limit'; observations: TokenObservation[];
  prefill_ms: number; decode_ms: number; observer_ms: number; native_total_ms: number; wall_ms: number;
}
export interface LlmTrace {
  schema: 'cmb.llm-trace/v1'; run_id: string; model_sha256: string; prompt_sha256: string;
  observation: LlmObservation;
}
export const MAX_LLM_TRACE_BYTES = 20 * 1024 * 1024;

function record(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  const obj = value as Record<string, unknown>;
  const allowed = keys.split(' ');
  if (Object.keys(obj).length !== allowed.length || allowed.some(k => !Object.prototype.hasOwnProperty.call(obj, k))) {
    throw new Error('Missing or unknown trace fields');
  }
  return obj;
}
function number(value: unknown, min: number, max: number, integer = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error('Invalid trace number');
  }
}
function string(value: unknown, max = 65536): asserts value is string {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid trace text');
}
function hash(value: unknown, length: number) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) throw new Error('Invalid provenance hash');
}

export function parseLlmTrace(value: unknown): LlmTrace {
  const t = record(value, 'schema run_id model_sha256 prompt_sha256 observation');
  if (t.schema !== 'cmb.llm-trace/v1') throw new Error('Unsupported LLM trace schema');
  string(t.run_id, 256);
  if (!t.run_id) throw new Error('Missing run identity');
  hash(t.model_sha256, 64); hash(t.prompt_sha256, 64);
  const o = record(t.observation, 'schema id llama_revision feature_revision observe prompt_tokens rendered_prompt vocab_size embedding_dim seed temperature max_tokens threads gpu_layers_requested token_ids completion stop observations prefill_ms decode_ms observer_ms native_total_ms wall_ms');
  if (o.schema !== 'cmb.llm-observation/v1' || o.feature_revision !== 'final-output-v1') throw new Error('Unsupported observation version');
  string(o.id, 256); string(o.rendered_prompt); string(o.completion);
  if (!o.id) throw new Error('Missing sample identity');
  hash(o.llama_revision, 40);
  if (typeof o.observe !== 'boolean' || !['eog', 'limit'].includes(String(o.stop))) throw new Error('Invalid observation mode');
  number(o.prompt_tokens, 1, 2048, true); number(o.vocab_size, 2, 1000000, true);
  number(o.embedding_dim, 1, 16384, true); number(o.max_tokens, 1, 256, true);
  number(o.seed, 0, 2147483647, true); number(o.temperature, 0, 2);
  number(o.threads, 1, 256, true); number(o.gpu_layers_requested, 0, 999, true);
  if (o.prompt_tokens + o.max_tokens > 2048) throw new Error('Context bound exceeded');
  for (const key of ['prefill_ms', 'decode_ms', 'observer_ms', 'native_total_ms', 'wall_ms']) number(o[key], 0, 86400000);
  if (!Array.isArray(o.token_ids) || o.token_ids.length > o.max_tokens) throw new Error('Invalid emitted tokens');
  for (const token of o.token_ids) number(token, 0, o.vocab_size - 1, true);
  if (!Array.isArray(o.observations) || o.observations.length > o.max_tokens) throw new Error('Invalid observation array');
  if (!o.observe && o.observations.length) throw new Error('Disabled observer has measurements');
  const expected = o.token_ids.length + (o.stop === 'eog' ? 1 : 0);
  if (o.stop === 'limit' && o.token_ids.length !== o.max_tokens) throw new Error('Incorrect limit stop');
  if (o.observe && o.observations.length !== expected) throw new Error('Incomplete observed sequence');
  o.observations.forEach((raw, i) => {
    const r = record(raw, 'step token_id emitted entropy_nats logit_margin embedding_norm cosine_drift embedding');
    if (r.step !== i || r.emitted !== (i < (o.token_ids as number[]).length)) throw new Error('Invalid token position');
    number(r.token_id, 0, (o.vocab_size as number) - 1, true);
    if (r.emitted && r.token_id !== (o.token_ids as number[])[i]) throw new Error('Token identity mismatch');
    number(r.entropy_nats, 0, Math.log(o.vocab_size as number) + 1e-5);
    number(r.logit_margin, 0, 1e12); number(r.embedding_norm, 0, 1e12);
    if (r.cosine_drift !== null) number(r.cosine_drift, 0, 2);
    if (i === 0 && r.cosine_drift !== null) throw new Error('First observation has no predecessor');
    if (!Array.isArray(r.embedding) || r.embedding.length !== o.embedding_dim) throw new Error('Embedding dimension mismatch');
    for (const v of r.embedding) number(v, -1e12, 1e12);
  });
  return value as LlmTrace;
}

export function parseLlmTraceJsonl(text: string): LlmTrace[] {
  if (new TextEncoder().encode(text).byteLength > MAX_LLM_TRACE_BYTES) throw new Error('Trace exceeds 20 MiB');
  const lines = text.trim().split(/\r?\n/);
  if (!text.trim() || lines.length > 128) throw new Error('Expected 1–128 trace records');
  const traces = lines.map(line => parseLlmTrace(JSON.parse(line)));
  const identities = new Set<string>();
  for (const trace of traces) {
    const key = JSON.stringify([trace.run_id, trace.observation.id]);
    if (identities.has(key)) throw new Error('Duplicate sample identity');
    identities.add(key);
  }
  return traces;
}
