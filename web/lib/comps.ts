/** A comparable the user entered: a listing or sale they know about. */
export interface Comp {
  id: string;
  label: string;
  price: number;
  acres: number;
}

export interface CompSummary {
  /** Dollars per acre across the comps: lowest, median, highest. */
  perAcre: { low: number; median: number; high: number };
  /** The subject's acreage at those per-acre figures. Null without a subject acreage. */
  value: { low: number; mid: number; high: number } | null;
}

const KEY = 'tracttrack.comps.v1';

type Store = Record<string, Comp[]>;

function readStore(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

const valid = (c: Comp) => c && typeof c.id === 'string' && Number.isFinite(c.price) && Number.isFinite(c.acres) && c.price > 0 && c.acres > 0;

/** Comps are kept per area (county), so they carry across the tracts being compared there. */
export function loadComps(area: string): Comp[] {
  const list = readStore()[area];
  return Array.isArray(list) ? list.filter(valid) : [];
}

export function saveComps(area: string, comps: Comp[]): void {
  try {
    const store = readStore();
    if (comps.length) store[area] = comps;
    else delete store[area];
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: the comps last for this visit only.
  }
}

export function summarizeComps(comps: Comp[], subjectAcres: number | null): CompSummary | null {
  const perAcre = comps
    .filter(valid)
    .map((c) => c.price / c.acres)
    .sort((a, b) => a - b);
  if (perAcre.length === 0) return null;
  const mid = Math.floor(perAcre.length / 2);
  const median = perAcre.length % 2 ? perAcre[mid] : (perAcre[mid - 1] + perAcre[mid]) / 2;
  const range = { low: perAcre[0], median, high: perAcre[perAcre.length - 1] };
  return {
    perAcre: range,
    value:
      subjectAcres !== null && subjectAcres > 0
        ? { low: range.low * subjectAcres, mid: range.median * subjectAcres, high: range.high * subjectAcres }
        : null,
  };
}
