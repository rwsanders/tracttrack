import type { GeocodeResult } from '../shared/types.ts';
import { fetchJson } from './lib/http.ts';
import { allProviders } from './states/registry.ts';

const PHOTON = 'https://photon.komoot.io/api/';

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    type?: string;
    extent?: [number, number, number, number];
    countrycode?: string;
  };
}

/** "30.2672, -97.7431" or "30.2672 -97.7431"; also accepts lng,lat when unambiguous. */
export function parseCoordinates(q: string): [number, number] | null {
  const m = q.trim().match(/^(-?\d{1,3}(?:\.\d+)?)[\s,]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180 && Math.abs(b) > 90) return [b, a];
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180 && Math.abs(a) > 90) return [a, b];
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
  return null;
}

function toResult(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const label = p.name && p.name !== p.street ? p.name : street || p.city || p.county || 'Unnamed place';
  const detail = [street && street !== label ? street : null, p.city !== label ? p.city : null, p.county ? `${p.county} County` : null, p.state]
    .filter(Boolean)
    .join(', ');
  // Photon orders extents west, north, east, south.
  const e = p.extent;
  // A building-sized extent is a point for our purposes; the client then opens the parcel there.
  const area = e && Math.max(Math.abs(e[2] - e[0]), Math.abs(e[1] - e[3])) > 0.004;
  return {
    label,
    detail,
    lngLat: f.geometry.coordinates,
    bounds: e && area ? [e[0], e[3], e[2], e[1]] : null,
  };
}

/** Place and address search, limited to the states the app currently covers. */
export async function geocode(q: string): Promise<GeocodeResult[]> {
  const coords = parseCoordinates(q);
  if (coords) {
    return [{ label: `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`, detail: 'Coordinates', lngLat: coords, bounds: null }];
  }
  const boxes = allProviders().map((p) => p.config.bounds);
  const bounds = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
  const params = new URLSearchParams({ q, limit: '6', lang: 'en', bbox: bounds.join(',') });
  const data = await fetchJson<{ features?: PhotonFeature[] }>(`${PHOTON}?${params}`, {
    service: 'Photon geocoder',
    timeoutMs: 10_000,
  });
  const seen = new Set<string>();
  return (data.features ?? [])
    .filter((f) => f.properties.countrycode === 'US')
    .map(toResult)
    .filter((r) => {
      const key = `${r.label}|${r.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
