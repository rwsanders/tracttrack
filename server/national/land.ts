import { booleanPointInPolygon } from '@turf/turf';
import type { LandReport, Parcel, SoilUnit, WetlandType } from '../../shared/types.ts';
import { queryLayer } from '../lib/arcgis.ts';
import { bbox, forQuery, interiorPoint, toWkt } from '../lib/geo.ts';
import { fetchJson } from '../lib/http.ts';

const ELEVATION = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples';
const SDA = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
const NWI = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0';

const FEET_PER_METER = 3.28084;

/** Samples a coarse grid of points inside the parcel for an elevation range. */
async function elevation(parcel: Parcel): Promise<LandReport['elevation']> {
  const feature = { type: 'Feature' as const, geometry: parcel.geometry, properties: {} };
  const [w, s, e, n] = bbox(parcel.geometry);
  const points: [number, number][] = [interiorPoint(parcel.geometry)];
  const grid = 5;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const p: [number, number] = [w + ((i + 0.5) / grid) * (e - w), s + ((j + 0.5) / grid) * (n - s)];
      if (booleanPointInPolygon(p, feature)) points.push(p);
    }
  }
  const data = await fetchJson<{ samples?: { locationId: number; value: string }[] }>(ELEVATION, {
    service: 'USGS 3D Elevation Program',
    form: {
      f: 'json',
      geometry: JSON.stringify({ points, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryMultipoint',
      returnFirstValueOnly: 'true',
    },
    timeoutMs: 15_000,
    retries: 0,
  });
  // Values are meters; cells without data come back as non-numeric text.
  const feet = new Map<number, number>();
  for (const sample of data.samples ?? []) {
    const meters = Number(sample.value);
    if (Number.isFinite(meters) && meters > -500) feet.set(sample.locationId, meters * FEET_PER_METER);
  }
  if (feet.size === 0) return null;
  const values = [...feet.values()];
  return { minFt: Math.min(...values), maxFt: Math.max(...values), centerFt: feet.get(0) ?? null, samples: values.length };
}

type SdaRow = (string | null)[];

/** Soil map units clipped to the parcel, largest first, from USDA Soil Data Access. */
async function soils(parcel: Parcel): Promise<SoilUnit[]> {
  const wkt = toWkt(forQuery(parcel.geometry, 400));
  const query =
    `~DeclareGeometry(@aoi)~ select @aoi = geometry::STGeomFromText('${wkt}', 4326).MakeValid() ` +
    `~DeclareIdGeomTable(@g)~ ~GetClippedMapunits(@aoi,polygon,geo,@g)~ ` +
    `~DeclareIdGeogTable(@clip)~ ~GetGeogFromGeomWgs84(@g,@clip)~ ` +
    `select c.id as mukey, sum(c.geog.STArea())*0.000247105 as acres into #a from @clip c group by c.id; ` +
    `select a.acres, mu.musym, mu.muname, mu.farmlndcl, ma.niccdcd, ma.drclassdcd, ma.hydgrpdcd, ma.slopegradwta, ma.flodfreqdcd ` +
    `from #a a inner join mapunit mu on mu.mukey = a.mukey inner join muaggatt ma on ma.mukey = a.mukey order by a.acres desc`;
  const data = await fetchJson<{ Table?: SdaRow[] }>(SDA, {
    service: 'USDA Soil Data Access',
    json: { format: 'JSON+COLUMNNAME', query },
    timeoutMs: 30_000,
  });
  const rows = (data.Table ?? []).slice(1);
  const total = rows.reduce((sum, r) => sum + Number(r[0] ?? 0), 0);
  return rows
    .map((r) => {
      const unitAcres = Number(r[0] ?? 0);
      return {
        acres: unitAcres,
        percent: total > 0 ? (unitAcres / total) * 100 : 0,
        symbol: r[1] ?? '',
        name: r[2] ?? 'Unnamed map unit',
        farmland: r[3],
        capabilityClass: r[4],
        drainage: r[5],
        hydrologicGroup: r[6],
        slopePercent: r[7] === null || r[7] === '' ? null : Number(r[7]),
        flooding: r[8],
      } satisfies SoilUnit;
    })
    .filter((u) => u.percent >= 0.5);
}

async function wetlands(parcel: Parcel): Promise<WetlandType[]> {
  const { features } = await queryLayer<{ WETLAND_TYPE: string | null }>(NWI, {
    service: 'USFWS National Wetlands Inventory',
    geometry: forQuery(parcel.geometry),
    outFields: ['WETLAND_TYPE'],
    timeoutMs: 20_000,
  });
  const counts = new Map<string, number>();
  for (const f of features) {
    const type = f.attributes.WETLAND_TYPE?.trim() || 'Unclassified';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].map(([type, n]) => ({ type, features: n })).sort((a, b) => b.features - a.features);
}

/** Terrain, soils and wetlands. Each source fails independently. */
export async function landReport(parcel: Parcel): Promise<LandReport> {
  const [elev, soil, wet] = await Promise.allSettled([elevation(parcel), soils(parcel), wetlands(parcel)]);
  const caveats: string[] = [];
  const failed = (label: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') caveats.push(`${label} could not be loaded right now.`);
  };
  failed('Elevation', elev);
  failed('Soils', soil);
  failed('Wetlands', wet);
  if (elev.status === 'rejected' && soil.status === 'rejected' && wet.status === 'rejected') {
    throw elev.reason;
  }

  const soilUnits = soil.status === 'fulfilled' ? soil.value : [];
  const primeFarmlandPercent = soilUnits.length
    ? soilUnits
        .filter((u) => u.farmland?.toLowerCase().startsWith('all areas are prime'))
        .reduce((sum, u) => sum + u.percent, 0)
    : null;
  if (soilUnits.length) {
    caveats.push('Soil surveys are mapped at roughly 1:24,000. Confirm with a site evaluation before building or installing septic.');
  }

  return {
    elevation: elev.status === 'fulfilled' ? elev.value : null,
    soils: soilUnits,
    primeFarmlandPercent,
    wetlands: wet.status === 'fulfilled' ? wet.value : [],
    caveats,
    sources: [
      { name: 'USGS 3D Elevation Program', url: 'https://www.usgs.gov/3d-elevation-program' },
      { name: 'USDA NRCS Web Soil Survey', url: 'https://websoilsurvey.nrcs.usda.gov/' },
      { name: 'USFWS National Wetlands Inventory', url: 'https://www.fws.gov/program/national-wetlands-inventory' },
    ],
  };
}
