import { describe, expect, it } from 'vitest';
import { compare, PRODUCTIVITY_CEILING, quantile, searchRadiusMiles, toNeighbor, type Neighbor } from '../server/states/tx/market.ts';

const neighbor = (key: string, acres: number, perAcre: number): Neighbor => ({ key, acres, landValue: acres * perAcre });
const subject = { key: '48171:1', acres: 80, landValue: 80 * 16_000, improvementValue: 200_000 };

describe('toNeighbor', () => {
  it('corrects Web Mercator area for latitude', () => {
    // 58,656.7 sq m in Web Mercator at 30.3N is a 10.77 acre parcel on the ground.
    const n = toNeighbor({ 'st_area(shape)': '58656.72739', LAND_VALUE: '427250', FIPS: '48171', PROP_ID: '182021' }, 30.3);
    expect(n?.acres).toBeCloseTo(10.8, 1);
    expect(n?.key).toBe('48171:182021');
  });

  it('skips parcels with no usable area or value', () => {
    expect(toNeighbor({ 'st_area(shape)': '5000', LAND_VALUE: '0' }, 30)).toBeNull();
    expect(toNeighbor({ 'st_area(shape)': 'Null', LAND_VALUE: '100' }, 30)).toBeNull();
    expect(toNeighbor({ LAND_VALUE: '100' }, 30)).toBeNull();
  });
});

describe('quantile', () => {
  it('interpolates between ranks', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([7], 0.75)).toBe(7);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe('compare', () => {
  const similar = [10_000, 14_000, 16_000, 18_000, 20_000, 24_000, 30_000].map((v, i) => neighbor(`48171:n${i}`, 60 + i * 10, v));

  it('summarizes similar-sized neighbors and prices the subject at their values', () => {
    const c = compare(subject, similar);
    expect(c.comparableCount).toBe(7);
    expect(c.band).toEqual({ minAcres: 40, maxAcres: 160 });
    expect(c.landPerAcre).toEqual({ low: 15_000, median: 18_000, high: 22_000 });
    expect(c.subjectLandPerAcre).toBe(16_000);
    expect(c.subjectVsMedianPercent).toBeCloseTo(-11.1, 1);
    // 80 acres at each per-acre figure, plus the subject's own improvements.
    expect(c.impliedValue).toEqual({ low: 1_400_000, mid: 1_640_000, high: 1_960_000 });
  });

  it('ignores parcels of a different scale, the subject itself and duplicates', () => {
    const c = compare(subject, [
      ...similar,
      neighbor('48171:lot', 0.25, 900_000),
      neighbor('48171:ranch', 5000, 2_000),
      neighbor('48171:1', 80, 99_000),
      similar[0],
    ]);
    expect(c.comparableCount).toBe(7);
    expect(c.landPerAcre?.median).toBe(18_000);
  });

  it('widens the size band when too few parcels fit', () => {
    const c = compare(subject, [neighbor('a', 30, 12_000), neighbor('b', 200, 9_000), neighbor('c', 100, 15_000)]);
    expect(c.band.maxAcres).toBe(240);
    expect(c.comparableCount).toBe(3);
    expect(c.landPerAcre?.median).toBe(12_000);
  });

  it('declines to summarize a handful of parcels', () => {
    const c = compare(subject, [neighbor('a', 80, 12_000), neighbor('b', 90, 9_000)]);
    expect(c.comparableCount).toBe(2);
    expect(c.landPerAcre).toBeNull();
    expect(c.impliedValue).toBeNull();
    expect(c.subjectLandPerAcre).toBe(16_000);
  });

  it('leaves out neighbors carried at agricultural productivity value', () => {
    const ag = [3, 6, 40, 120].map((v, i) => neighbor(`ag${i}`, 80, v));
    const c = compare(subject, [...similar, ...ag]);
    expect(c.productivityValued).toBe(4);
    expect(c.comparableCount).toBe(7);
    expect(c.landPerAcre?.median).toBe(18_000);
  });

  it('does not measure a productivity-valued subject against market values', () => {
    const c = compare({ ...subject, landValue: 80 * (PRODUCTIVITY_CEILING - 1) }, similar);
    expect(c.subjectAtProductivityValue).toBe(true);
    expect(c.subjectVsMedianPercent).toBeNull();
    expect(c.impliedValue?.mid).toBe(1_640_000); // neighbors still say what it is worth
  });

  it('handles a subject with no acreage or value', () => {
    expect(compare({ ...subject, acres: null }, similar).landPerAcre).toBeNull();
    const c = compare({ ...subject, landValue: null }, similar);
    expect(c.subjectLandPerAcre).toBeNull();
    expect(c.subjectVsMedianPercent).toBeNull();
    expect(c.landPerAcre?.median).toBe(18_000);
  });
});

describe('searchRadiusMiles', () => {
  it('casts a wider net for larger tracts', () => {
    expect(searchRadiusMiles(0.2)).toBeLessThan(searchRadiusMiles(5));
    expect(searchRadiusMiles(5)).toBeLessThan(searchRadiusMiles(80));
    expect(searchRadiusMiles(80)).toBeLessThan(searchRadiusMiles(2000));
  });
});
