const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

export const DASH = '–';

export function money(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : usd0.format(v);
}

/** $1.52M style, for tight stat tiles. Exact figures appear elsewhere. */
export function moneyCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return Math.abs(v) < 10_000 ? usd0.format(v) : usdCompact.format(v);
}

export function acres(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const digits = v < 10 ? 2 : v < 1000 ? 1 : 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "40 to 160 acres": a size band, rounded so the two ends read alike. */
export function acreRange(min: number, max: number): string {
  const whole = min >= 10;
  const show = (v: number) => (whole ? Math.round(v).toLocaleString('en-US') : acres(v));
  return `${show(min)} to ${show(max)} acres`;
}

export function percent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  if (v > 0 && v < 1 && digits === 0) return '<1%';
  return `${v.toFixed(digits)}%`;
}

/** Tax rates are quoted per $100 of value to at most six decimals. */
export function rate(v: number): string {
  return `$${v.toFixed(6).replace(/0{1,2}$/, '')}`;
}

export function feet(v: number | null | undefined): string {
  return v === null || v === undefined ? DASH : `${Math.round(v).toLocaleString('en-US')} ft`;
}

export function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
