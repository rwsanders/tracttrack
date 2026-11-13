import { describe, expect, it } from 'vitest';
import { parseCoordinates } from '../server/geocode.ts';
import { BadRequest, parseLngLat, parseParcel } from '../server/validate.ts';
import { summarizeComps } from '../web/lib/comps.ts';
import { estimateCosts, monthlyPayment } from '../web/lib/costs.ts';
import { acreRange, acres, money, moneyCompact, percent, rate } from '../web/lib/format.ts';
import { formatHash, parseHash } from '../web/lib/url.ts';

describe('monthlyPayment', () => {
  it('matches the standard amortization formula', () => {
    // $100,000 at 6% over 30 years is the textbook $599.55.
    expect(monthlyPayment(100_000, 6, 30)).toBeCloseTo(599.55, 2);
  });

  it('handles a zero rate and empty loans', () => {
    expect(monthlyPayment(12_000, 0, 1)).toBe(1000);
    expect(monthlyPayment(0, 7, 20)).toBe(0);
    expect(monthlyPayment(1000, 7, 0)).toBe(0);
  });
});

describe('estimateCosts', () => {
  const base = { price: 500_000, downPercent: 20, interestPercent: 6, termYears: 30, closingPercent: 3, taxableValue: 400_000, taxRate: 1.5, otherAnnual: 1200 };

  it('adds up a purchase', () => {
    const c = estimateCosts(base);
    expect(c.downPayment).toBe(100_000);
    expect(c.loanAmount).toBe(400_000);
    expect(c.closingCosts).toBe(15_000);
    expect(c.cashToClose).toBe(115_000);
    expect(c.annualTax).toBe(6000);
    expect(c.monthlyPayment).toBeCloseTo(2398.2, 1);
    expect(c.monthlyCarry).toBeCloseTo(2398.2 + 600, 1);
    expect(c.firstYearCash).toBeCloseTo(115_000 + (2398.2 + 600) * 12, 0);
    expect(c.totalInterest).toBeCloseTo(2398.2 * 360 - 400_000, -2);
  });

  it('treats a cash purchase as having no loan', () => {
    const c = estimateCosts({ ...base, downPercent: 100 });
    expect(c.loanAmount).toBe(0);
    expect(c.monthlyPayment).toBe(0);
    expect(c.totalInterest).toBe(0);
  });

  it('survives nonsense input', () => {
    const c = estimateCosts({ ...base, price: Number.NaN, downPercent: 500, interestPercent: -3 });
    expect(Object.values(c).every(Number.isFinite)).toBe(true);
  });
});

describe('summarizeComps', () => {
  const comp = (price: number, size: number) => ({ id: `${price}-${size}`, label: '', price, acres: size });

  it('prices the tract at the median per-acre figure of the comps', () => {
    const s = summarizeComps([comp(1_500_000, 60), comp(2_400_000, 120), comp(900_000, 30)], 80);
    expect(s?.perAcre).toEqual({ low: 20_000, median: 25_000, high: 30_000 });
    expect(s?.value).toEqual({ low: 1_600_000, mid: 2_000_000, high: 2_400_000 });
  });

  it('averages the middle pair for an even count', () => {
    expect(summarizeComps([comp(100_000, 10), comp(300_000, 10)], 1)?.perAcre.median).toBe(20_000);
  });

  it('ignores unusable comps and needs at least one', () => {
    expect(summarizeComps([], 80)).toBeNull();
    expect(summarizeComps([comp(0, 10), comp(100, 0)], 80)).toBeNull();
    expect(summarizeComps([comp(100_000, 10), comp(Number.NaN, 5)], 80)?.perAcre.median).toBe(10_000);
  });

  it('still reports per-acre figures when the tract has no acreage', () => {
    const s = summarizeComps([comp(100_000, 10)], null);
    expect(s?.perAcre.median).toBe(10_000);
    expect(s?.value).toBeNull();
  });
});

describe('formatting', () => {
  it('formats money, compact money and missing values', () => {
    expect(money(1521230)).toBe('$1,521,230');
    expect(moneyCompact(1521230)).toBe('$1.52M');
    expect(moneyCompact(8200)).toBe('$8,200');
    expect(money(null)).toBe('–');
  });

  it('scales acreage precision to size', () => {
    expect(acres(0.253)).toBe('0.25');
    expect(acres(80.42)).toBe('80.4');
    expect(acres(12345.6)).toBe('12,346');
  });

  it('rounds a size band consistently', () => {
    expect(acreRange(40.13, 160.54)).toBe('40 to 161 acres');
    expect(acreRange(320.56, 1282.25)).toBe('321 to 1,282 acres');
    expect(acreRange(0.11, 0.46)).toBe('0.11 to 0.46 acres');
  });

  it('never rounds a small share down to zero', () => {
    expect(percent(0.4)).toBe('<1%');
    expect(percent(8.88)).toBe('9%');
    expect(percent(0)).toBe('0%');
  });

  it('trims tax rates without losing precision', () => {
    expect(rate(0.2685)).toBe('$0.2685');
    expect(rate(1.585185)).toBe('$1.585185');
  });
});

describe('url state', () => {
  it('round-trips the view and the selected tract', () => {
    const hash = formatHash({ center: [-98.87, 30.3], zoom: 14.5 }, [-98.8676, 30.3001]);
    expect(hash).toBe('#map=14.50/30.30000/-98.87000&p=30.300100,-98.867600');
    expect(parseHash(hash)).toEqual({ position: { center: [-98.87, 30.3], zoom: 14.5 }, parcel: [-98.8676, 30.3001] });
  });

  it('ignores malformed input', () => {
    expect(parseHash('#map=abc&p=91,0')).toEqual({ position: null, parcel: null });
    expect(parseHash('')).toEqual({ position: null, parcel: null });
  });
});

describe('request validation', () => {
  it('parses coordinates in either order when unambiguous', () => {
    expect(parseCoordinates('30.2672, -97.7431')).toEqual([-97.7431, 30.2672]);
    expect(parseCoordinates('-97.7431 30.2672')).toEqual([-97.7431, 30.2672]);
    expect(parseCoordinates('Austin, TX')).toBeNull();
    expect(parseCoordinates('200, 300')).toBeNull();
  });

  it('rejects bad points', () => {
    expect(parseLngLat('30.3', '-98.8')).toEqual([-98.8, 30.3]);
    expect(() => parseLngLat('abc', '1')).toThrow(BadRequest);
    expect(() => parseLngLat(undefined, '1')).toThrow(BadRequest);
    expect(() => parseLngLat('95', '1')).toThrow(BadRequest);
  });

  const geometry = { type: 'Polygon', coordinates: [[[-98, 30], [-98, 30.01], [-97.99, 30.01], [-97.99, 30], [-98, 30]]] };

  it('rebuilds a parcel from untrusted input', () => {
    const p = parseParcel({ state: 'TX', id: 'TX:48171:1', fips: '48171', marketValue: 5, owner: 42, geometry, centroid: [0, 0] });
    expect(p.owner).toBeNull(); // wrong type is dropped, not passed through
    expect(p.marketValue).toBe(5);
    expect(p.centroid[0]).toBeLessThan(-97.9); // recomputed, not taken from the request
  });

  it('refuses geometry that is not plain numbers', () => {
    const evil = { type: 'Polygon', coordinates: [[["0)); drop table x;--", 30], [-98, 30.01], [-97.99, 30.01], [-98, 30]]] };
    expect(() => parseParcel({ state: 'TX', geometry: evil })).toThrow(BadRequest);
    expect(() => parseParcel({ state: 'TX', geometry: { type: 'Point', coordinates: [0, 0] } })).toThrow(BadRequest);
    expect(() => parseParcel({ state: 'ZZ', geometry })).toThrow(BadRequest);
    expect(() => parseParcel(null)).toThrow(BadRequest);
  });
});
