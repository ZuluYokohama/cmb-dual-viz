/**
 * CSV ingestion: (t,value) time series and/or (theta,phi,value) / (lon,lat,value) sky.
 */

import type { IngestedDataset, SeriesPoint, SkySample } from './types';
import type { ParseResult } from './parseJson';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && (ch === ',' || ch === '\t' || ch === ';')) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

/** Parse supported CSV or TSV shapes into a derived research dataset. */
export function parseCsvDocument(
  text: string,
  nameHint: string,
  id: string
): ParseResult {
  const errors: string[] = [];
  const residue: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    return { ok: false, errors: ['CSV needs a header row and at least one data row'], residue: [] };
  }

  const headers = splitCsvLine(lines[0]!).map(normHeader);
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iT = idx(['t', 'time', 'x', 'timestamp']);
  const iVal = idx(['value', 'v', 'y', 'temp', 'amplitude', 'score']);
  const iTheta = idx(['theta', 'colatitude']);
  const iPhi = idx(['phi', 'azimuth']);
  const iLon = idx(['lon', 'longitude', 'long', 'ra']);
  const iLat = idx(['lat', 'latitude', 'dec']);

  const series: SeriesPoint[] = [];
  const skySamples: SkySample[] = [];

  const isSky = (iTheta >= 0 && iPhi >= 0) || (iLon >= 0 && iLat >= 0);
  const isSeries = iT >= 0 && iVal >= 0;

  if (!isSky && !isSeries) {
    // Heuristic: 2 cols → series; 3 cols → sky (theta,phi,value) or (lon,lat,value)
    if (headers.length === 2) {
      residue.push('No named headers matched; treating col0=t, col1=value');
    } else if (headers.length >= 3) {
      residue.push('No named headers matched; treating col0,col1,col2 as theta,phi,value');
    } else {
      return {
        ok: false,
        errors: [
          `Unrecognized CSV headers: [${headers.join(', ')}]. Need (t,value) or (theta,phi,value)/(lon,lat,value).`,
        ],
        residue: [],
      };
    }
  }

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r]!);
    /** Read a nonempty column as a number, or return NaN when absent. */
    const num = (i: number) => {
      if (i < 0 || i >= cols.length) return NaN;
      if (cols[i]!.trim() === '') return NaN;
      return Number(cols[i]);
    };

    if (isSeries || (!isSky && headers.length === 2)) {
      const t = isSeries ? num(iT) : num(0);
      const value = isSeries ? num(iVal) : num(1);
      if (!Number.isFinite(t) || !Number.isFinite(value)) {
        errors.push(`row ${r + 1}: non-numeric t/value`);
        continue;
      }
      series.push({ t, value });
    }

    if (isSky || (!isSeries && headers.length >= 3)) {
      let theta: number;
      let phi: number;
      let value: number;
      if (iTheta >= 0 && iPhi >= 0) {
        theta = num(iTheta);
        phi = num(iPhi);
        value = iVal >= 0 ? num(iVal) : num(headers.length - 1);
      } else if (iLon >= 0 && iLat >= 0) {
        let lon = num(iLon);
        let lat = num(iLat);
        value = iVal >= 0 ? num(iVal) : num(headers.length - 1);
        if (Math.abs(lon) > Math.PI + 0.1) lon = (lon * Math.PI) / 180;
        if (Math.abs(lat) > Math.PI / 2 + 0.1) lat = (lat * Math.PI) / 180;
        theta = Math.PI / 2 - lat;
        phi = lon < 0 ? lon + 2 * Math.PI : lon;
      } else {
        // heuristic theta,phi,value
        theta = num(0);
        phi = num(1);
        value = num(2);
      }
      if (![theta, phi, value].every(Number.isFinite)) {
        errors.push(`row ${r + 1}: non-numeric sky sample`);
        continue;
      }
      skySamples.push({ theta, phi, value });
    }
  }

  if (!series.length && !skySamples.length) {
    return {
      ok: false,
      errors: errors.length ? errors : ['No valid rows parsed'],
      residue,
    };
  }

  const dataset: IngestedDataset = {
    id,
    name: nameHint || 'csv-dataset',
    type: 'csv',
    epistemic: 'DERIVED/MEANING-MAP',
    enabled: true,
    format: 'csv',
    series: series.length ? series : undefined,
    skySamples: skySamples.length ? skySamples : undefined,
    meta: { headers, rowCount: lines.length - 1 },
    ingestedAt: Date.now(),
  };

  return { ok: true, dataset, errors, residue };
}
