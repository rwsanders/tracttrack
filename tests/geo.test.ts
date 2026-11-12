import { describe, expect, it } from 'vitest';
import { acres, esriRingsToGeoJson, forQuery, geoJsonToEsri, interiorPoint, toWkt, vertexCount } from '../server/lib/geo.ts';

// Roughly a 0.01 degree square near Austin; clockwise, as Esri winds exteriors.
const outer = [
  [-98.0, 30.0],
  [-98.0, 30.01],
  [-97.99, 30.01],
  [-97.99, 30.0],
  [-98.0, 30.0],
];
// Counter-clockwise, so Esri reads it as a hole.
const hole = [
  [-97.997, 30.003],
  [-97.993, 30.003],
  [-97.993, 30.007],
  [-97.997, 30.007],
  [-97.997, 30.003],
];

describe('esriRingsToGeoJson', () => {
  it('turns a single clockwise ring into a polygon', () => {
    expect(esriRingsToGeoJson([outer])).toEqual({ type: 'Polygon', coordinates: [outer] });
  });

  it('attaches a counter-clockwise ring to its exterior as a hole', () => {
    const g = esriRingsToGeoJson([outer, hole]);
    expect(g?.type).toBe('Polygon');
    expect(g?.coordinates).toHaveLength(2);
  });

  it('keeps separate exteriors as a multipolygon', () => {
    const shifted = outer.map(([x, y]) => [x + 0.05, y]);
    const g = esriRingsToGeoJson([outer, shifted]);
    expect(g?.type).toBe('MultiPolygon');
    expect(g?.coordinates).toHaveLength(2);
  });

  it('still returns a shape when every ring is wound backwards', () => {
    const g = esriRingsToGeoJson([[...outer].reverse()]);
    expect(g?.type).toBe('Polygon');
  });

  it('rejects degenerate input', () => {
    expect(esriRingsToGeoJson([])).toBeNull();
    expect(esriRingsToGeoJson([[[0, 0], [1, 1]]])).toBeNull();
  });
});

describe('measurements', () => {
  const square = esriRingsToGeoJson([outer])!;
  const donut = esriRingsToGeoJson([outer, hole])!;

  it('measures acreage on the ground, not in degrees', () => {
    // 0.01 deg of latitude is ~1.109 km and of longitude at 30N ~0.965 km: ~264 acres.
    expect(acres(square)).toBeGreaterThan(255);
    expect(acres(square)).toBeLessThan(272);
  });

  it('subtracts holes from acreage', () => {
    expect(acres(donut)).toBeCloseTo(acres(square) * (1 - 0.16), 0);
  });

  it('finds an interior point that avoids the hole', () => {
    const [x, y] = interiorPoint(donut);
    const inHole = x > -97.997 && x < -97.993 && y > 30.003 && y < 30.007;
    expect(inHole).toBe(false);
    expect(x).toBeGreaterThan(-98.0);
    expect(x).toBeLessThan(-97.99);
  });
});

describe('query geometry', () => {
  const donut = esriRingsToGeoJson([outer, hole])!;

  it('writes holes into WKT', () => {
    const wkt = toWkt(donut);
    expect(wkt.startsWith('POLYGON ((')).toBe(true);
    expect(wkt.match(/\(-9/g)).toHaveLength(2);
  });

  it('writes multipolygons', () => {
    const multi = esriRingsToGeoJson([outer, outer.map(([x, y]) => [x + 0.05, y])])!;
    expect(toWkt(multi).startsWith('MULTIPOLYGON (((')).toBe(true);
  });

  it('round-trips through Esri JSON', () => {
    expect(geoJsonToEsri(donut).rings).toHaveLength(2);
  });

  it('thins only boundaries that exceed the vertex budget', () => {
    expect(forQuery(donut)).toBe(donut);
    const dense = Array.from({ length: 2000 }, (_, i) => {
      const a = (-i / 2000) * 2 * Math.PI;
      return [-98 + 0.01 * Math.cos(a), 30 + 0.01 * Math.sin(a)];
    });
    dense.push(dense[0]);
    const circle = esriRingsToGeoJson([dense])!;
    const thinned = forQuery(circle, 300);
    expect(vertexCount(thinned)).toBeLessThanOrEqual(300);
    expect(acres(thinned) / acres(circle)).toBeGreaterThan(0.98);
  });
});
