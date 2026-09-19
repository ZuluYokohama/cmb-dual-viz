/**
 * Plain text → claim nodes via sentence/paragraph split.
 * Embedding happens later in meaning-map builder (TF-IDF / hash projection).
 */

import type { ClaimItem, IngestedDataset } from './types';
import type { ParseResult } from './parseJson';

function splitClaims(text: string): ClaimItem[] {
  const chunks = text
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z(["])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 8);

  if (chunks.length === 0 && text.trim().length > 0) {
    return [{ id: 'c0', text: text.trim().slice(0, 500) }];
  }
  return chunks.slice(0, 80).map((t, i) => ({ id: `c${i}`, text: t.slice(0, 500) }));
}

export function parseTextDocument(
  text: string,
  nameHint: string,
  id: string
): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, errors: ['Empty text'], residue: [] };
  }
  const claims = splitClaims(trimmed);
  const residue: string[] = [];
  if (claims.length >= 80) residue.push('Truncated to 80 claim nodes');

  const dataset: IngestedDataset = {
    id,
    name: nameHint || 'text-claims',
    type: 'text',
    epistemic: 'DERIVED/MEANING-MAP',
    enabled: true,
    format: 'text',
    claims,
    meta: { charCount: trimmed.length, claimCount: claims.length },
    ingestedAt: Date.now(),
  };
  return { ok: true, dataset, errors: [], residue };
}
