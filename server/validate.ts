import type { Position } from 'geojson';
import type { Parcel, ParcelGeometry } from '../shared/types.ts';
import { interiorPoint } from './lib/geo.ts';

export class BadRequest extends Error {}

const MAX_VERTICES = 50_000;

function ring(value: unknown, budget: { left: number }): Position[] {
  if (!Array.isArray(value) || value.length < 4) throw new BadRequest('Invalid parcel boundary.');
  return value.map((p) => {
    if (--budget.left < 0) throw new BadRequest('Parcel boundary is too detailed.');
    if (!Array.isArray(p) || p.length < 2) throw new BadRequest('Invalid parcel boundary.');
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) {
      throw new BadRequest('Invalid parcel boundary.');
    }
    return [x, y];
  });
}

function geometry(value: unknown): ParcelGeometry {
  const g = value as { type?: unknown; coordinates?: unknown };
  const budget = { left: MAX_VERTICES };
  if (g?.type === 'Polygon' && Array.isArray(g.coordinates)) {
    return { type: 'Polygon', coordinates: g.coordinates.map((r) => ring(r, budget)) };
  }
  if (g?.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: g.coordinates.map((poly) => {
        if (!Array.isArray(poly)) throw new BadRequest('Invalid parcel boundary.');
        return poly.map((r) => ring(r, budget));
      }),
    };
  }
  throw new BadRequest('Parcel boundary must be a polygon.');
}

const str = (v: unknown, max = 400) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Report requests carry the parcel back from the browser, so nothing in it is
 * trusted: the boundary is rebuilt from plain numbers (it is later written
 * into upstream query text) and every other field is coerced to its type.
 */
export function parseParcel(body: unknown): Parcel {
  const b = (body ?? {}) as Record<string, unknown>;
  const geom = geometry(b.geometry);
  if (b.state !== 'TX') throw new BadRequest('Unsupported state.');
  return {
    id: str(b.id, 80) ?? 'unknown',
    state: 'TX',
    county: str(b.county, 80),
    fips: typeof b.fips === 'string' && /^\d{5}$/.test(b.fips) ? b.fips : null,
    propId: str(b.propId, 80),
    geoId: str(b.geoId, 80),
    owner: str(b.owner),
    careOf: str(b.careOf),
    mailingAddress: str(b.mailingAddress),
    situsAddress: str(b.situsAddress),
    legalDescription: str(b.legalDescription, 2000),
    legalAcres: num(b.legalAcres),
    mappedAcres: num(b.mappedAcres),
    landValue: num(b.landValue),
    improvementValue: num(b.improvementValue),
    marketValue: num(b.marketValue),
    taxYear: str(b.taxYear, 10),
    yearBuilt: str(b.yearBuilt, 10),
    landUse: str(b.landUse),
    source: str(b.source),
    sourceDate: str(b.sourceDate, 10),
    // Recomputed so jurisdiction lookups cannot be pointed somewhere else.
    centroid: interiorPoint(geom),
    geometry: geom,
  };
}

export function parseLngLat(lat: string | undefined, lng: string | undefined): [number, number] {
  const y = Number(lat);
  const x = Number(lng);
  if (lat === undefined || lng === undefined || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90 || Math.abs(x) > 180) {
    throw new BadRequest('Provide numeric lat and lng.');
  }
  return [x, y];
}
