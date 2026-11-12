import { area, featureCollection, intersect } from '@turf/turf';
import type { FloodReport, FloodZone, Parcel } from '../../shared/types.ts';
import { queryLayer } from '../lib/arcgis.ts';
import { acres, esriRingsToGeoJson, forQuery, SQ_METERS_PER_ACRE } from '../lib/geo.ts';

const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer';
export const NFHL_FLOOD_ZONES_LAYER = 28;

interface ZoneAttrs {
  FLD_ZONE: string | null;
  ZONE_SUBTY: string | null;
  SFHA_TF: string | null;
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t && t.toLowerCase() !== 'null' ? t : null;
};

/** FEMA flood zones crossing the parcel, with the share of the parcel in each. */
export async function floodReport(parcel: Parcel): Promise<FloodReport> {
  const geometry = forQuery(parcel.geometry);
  const { features } = await queryLayer<ZoneAttrs>(`${NFHL}/${NFHL_FLOOD_ZONES_LAYER}`, {
    service: 'FEMA National Flood Hazard Layer',
    geometry,
    outFields: ['FLD_ZONE', 'ZONE_SUBTY', 'SFHA_TF'],
    returnGeometry: true,
    // ~2 m; flood polygons can carry tens of thousands of vertices.
    maxAllowableOffset: 0.00002,
    timeoutMs: 30_000,
  });

  const parcelFeature = { type: 'Feature' as const, geometry, properties: {} };
  const parcelAcres = acres(geometry);
  const byZone = new Map<string, FloodZone>();
  let measured = true;

  for (const f of features) {
    const zone = clean(f.attributes.FLD_ZONE) ?? 'Unknown';
    const subtype = clean(f.attributes.ZONE_SUBTY);
    const key = `${zone}|${subtype ?? ''}`;
    const entry =
      byZone.get(key) ??
      ({ zone, subtype, sfha: f.attributes.SFHA_TF === 'T', acres: 0, percent: 0 } satisfies FloodZone);
    byZone.set(key, entry);

    const zoneGeometry = f.geometry?.rings ? esriRingsToGeoJson(f.geometry.rings) : null;
    if (!zoneGeometry) {
      measured = false;
      continue;
    }
    try {
      const overlap = intersect(
        featureCollection([parcelFeature, { type: 'Feature' as const, geometry: zoneGeometry, properties: {} }]),
      );
      if (overlap) entry.acres = (entry.acres ?? 0) + area(overlap) / SQ_METERS_PER_ACRE;
    } catch {
      measured = false;
    }
  }

  let zones = [...byZone.values()];
  if (measured && parcelAcres > 0) {
    for (const z of zones) z.percent = Math.min(100, ((z.acres ?? 0) / parcelAcres) * 100);
    // Zones that only touch the boundary contribute nothing worth listing.
    zones = zones.filter((z) => (z.percent ?? 0) >= 0.05);
  } else {
    for (const z of zones) {
      z.acres = null;
      z.percent = null;
    }
  }
  zones.sort((a, b) => Number(b.sfha) - Number(a.sfha) || (b.percent ?? 0) - (a.percent ?? 0));

  const mapped = features.length > 0;
  const sfhaPercent =
    mapped && measured ? Math.min(100, zones.filter((z) => z.sfha).reduce((s, z) => s + (z.percent ?? 0), 0)) : null;

  const caveats = [
    'Flood maps show regulatory zones, not a prediction. Land outside a mapped floodplain can still flood.',
  ];
  if (!mapped) {
    caveats.unshift(
      'FEMA has no digital flood map covering this parcel. Check the county floodplain administrator for paper maps or local studies.',
    );
  }

  return {
    mapped,
    zones,
    sfhaPercent,
    caveats,
    sources: [{ name: 'FEMA National Flood Hazard Layer', url: 'https://msc.fema.gov/portal/home' }],
  };
}
