import { area, pointOnFeature, simplify } from '@turf/turf';
import type { Position } from 'geojson';
import type { ParcelGeometry } from '../../shared/types.ts';

export const SQ_METERS_PER_ACRE = 4046.8564224;

/** Signed area of a ring; positive when the ring winds clockwise. */
function clockwiseArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum / 2;
}

function pointInRing(point: Position, ring: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Converts Esri JSON rings to GeoJSON. Esri stores every ring in one flat
 * list: clockwise rings are exteriors, counter-clockwise rings are holes.
 */
export function esriRingsToGeoJson(rings: number[][][]): ParcelGeometry | null {
  const outers: Position[][][] = [];
  const holes: Position[][] = [];
  for (const raw of rings) {
    if (!raw || raw.length < 4) continue;
    const ring = raw.map(([x, y]) => [x, y]);
    if (clockwiseArea(ring) >= 0) outers.push([ring]);
    else holes.push(ring);
  }
  if (outers.length === 0) {
    // Some sources wind exteriors the other way; treat every ring as its own polygon.
    for (const ring of holes) outers.push([ring]);
    holes.length = 0;
  }
  for (const hole of holes) {
    const owner = outers.find((poly) => pointInRing(hole[0], poly[0])) ?? outers[0];
    owner.push(hole);
  }
  if (outers.length === 0) return null;
  if (outers.length === 1) return { type: 'Polygon', coordinates: outers[0] };
  return { type: 'MultiPolygon', coordinates: outers };
}

/** GeoJSON polygon(s) back to an Esri JSON polygon for spatial queries. */
export function geoJsonToEsri(geometry: ParcelGeometry): { rings: number[][][]; spatialReference: { wkid: number } } {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return { rings: polys.flat() as number[][][], spatialReference: { wkid: 4326 } };
}

/** WKT for the parcel, holes included, so clipped areas match the real tract. */
export function toWkt(geometry: ParcelGeometry): string {
  const ring = (r: Position[]) => `(${r.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join(', ')})`;
  const polygon = (rings: Position[][]) => `(${rings.map(ring).join(', ')})`;
  return geometry.type === 'Polygon'
    ? `POLYGON ${polygon(geometry.coordinates)}`
    : `MULTIPOLYGON (${geometry.coordinates.map(polygon).join(', ')})`;
}

export function acres(geometry: ParcelGeometry): number {
  return area({ type: 'Feature', geometry, properties: {} }) / SQ_METERS_PER_ACRE;
}

/** A point guaranteed to fall inside the parcel, unlike a plain centroid. */
export function interiorPoint(geometry: ParcelGeometry): [number, number] {
  const p = pointOnFeature({ type: 'Feature', geometry, properties: {} });
  return [p.geometry.coordinates[0], p.geometry.coordinates[1]];
}

export function vertexCount(geometry: ParcelGeometry): number {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0);
}

/**
 * Thins very detailed boundaries before they are sent to upstream services,
 * which reject or crawl on huge request geometries. About 1 m of tolerance.
 */
export function forQuery(geometry: ParcelGeometry, maxVertices = 600): ParcelGeometry {
  if (vertexCount(geometry) <= maxVertices) return geometry;
  let tolerance = 0.00001;
  let out = geometry;
  for (let i = 0; i < 6 && vertexCount(out) > maxVertices; i++) {
    out = simplify({ type: 'Feature', geometry, properties: {} }, { tolerance, highQuality: false }).geometry;
    tolerance *= 3;
  }
  return out;
}

export function bbox(geometry: ParcelGeometry): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
  return [w, s, e, n];
}
