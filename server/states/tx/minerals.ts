import type { MineralReport, Parcel, Pipeline, Survey, Well } from '../../../shared/types.ts';
import { queryLayer } from '../../lib/arcgis.ts';
import { forQuery } from '../../lib/geo.ts';

export const RRC = 'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer';
export const RRC_LAYERS = {
  wellNumbers: 0,
  wells: 1,
  laterals: 10,
  pipelines: 13,
  pipelinesSmallScale: 14,
  surveyAbstractLabels: 22,
  surveyLabels: 23,
  surveys: 24,
} as const;

const SERVICE = 'Railroad Commission of Texas';
const RADIUS_MILES = 1;

interface WellAttrs {
  API: string | null;
  GIS_WELL_NUMBER: string | null;
  GIS_SYMBOL_DESCRIPTION: string | null;
  GIS_LAT83: number | null;
  GIS_LONG83: number | null;
}

interface PipelineAttrs {
  OPERATOR: string | null;
  COMMODITY_DESCRIPTION: string | null;
  SYSTEM_NAME: string | null;
  DIAMETER: number | string | null;
  STATUS: string | null;
  INTERSTATE: string | null;
}

interface SurveyAttrs {
  ABSTRACT_LABEL: string | null;
  LEVEL1_SURVEY_NAME: string | null;
  LEVEL2_BLOCK_NUMBER: string | null;
  LEVEL3_SURVEY_NUMBER: string | null;
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/** RRC stores the 8-digit county + well part; the state prefix for Texas is 42. */
export function formatApi(api: string | null): string {
  const digits = (api ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return api?.trim() || 'Unknown';
  return `42-${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function toWell(a: WellAttrs, onParcel: boolean): Well {
  return {
    api: formatApi(a.API),
    wellNumber: clean(a.GIS_WELL_NUMBER),
    type: clean(a.GIS_SYMBOL_DESCRIPTION) ?? 'Unclassified',
    onParcel,
    lngLat: [Number(a.GIS_LONG83 ?? 0), Number(a.GIS_LAT83 ?? 0)],
  };
}

export function toPipelines(rows: PipelineAttrs[]): Pipeline[] {
  const seen = new Map<string, Pipeline>();
  for (const a of rows) {
    const diameter = Number(a.DIAMETER);
    const p: Pipeline = {
      operator: clean(a.OPERATOR),
      commodity: clean(a.COMMODITY_DESCRIPTION),
      system: clean(a.SYSTEM_NAME),
      diameterInches: Number.isFinite(diameter) && diameter > 0 ? diameter : null,
      status: clean(a.STATUS),
      interstate: a.INTERSTATE === 'Y' ? true : a.INTERSTATE === 'N' ? false : null,
    };
    seen.set([p.operator, p.commodity, p.system, p.diameterInches, p.status].join('|'), p);
  }
  return [...seen.values()];
}

/** Wells that never produced say little about the minerals; these do. */
const INACTIVE = /permitted|cancel|abandon|dry hole|plugged/i;

export function mineralSignal(wellsOnParcel: Well[], laterals: number, nearbyTotal: number): MineralReport['signal'] {
  if (laterals > 0 || wellsOnParcel.some((w) => !INACTIVE.test(w.type))) return 'on-parcel';
  if (wellsOnParcel.length > 0 || nearbyTotal > 0) return 'nearby';
  return 'none';
}

export async function mineralReport(parcel: Parcel): Promise<MineralReport> {
  const geometry = forQuery(parcel.geometry);
  const wellFields = ['API', 'GIS_WELL_NUMBER', 'GIS_SYMBOL_DESCRIPTION', 'GIS_LAT83', 'GIS_LONG83'];

  // Wells drive the section, so their failure fails it; the rest degrade to a caveat.
  const [onParcel, nearby, laterals, pipelines, surveys] = await Promise.allSettled([
    queryLayer<WellAttrs>(`${RRC}/${RRC_LAYERS.wells}`, { service: SERVICE, geometry, outFields: wellFields }),
    queryLayer<WellAttrs>(`${RRC}/${RRC_LAYERS.wells}`, {
      service: SERVICE,
      geometry,
      outFields: wellFields,
      distanceMiles: RADIUS_MILES,
      timeoutMs: 30_000,
    }),
    queryLayer(`${RRC}/${RRC_LAYERS.laterals}`, { service: SERVICE, geometry, outFields: ['OBJECTID'] }),
    queryLayer<PipelineAttrs>(`${RRC}/${RRC_LAYERS.pipelines}`, {
      service: SERVICE,
      geometry,
      outFields: ['OPERATOR', 'COMMODITY_DESCRIPTION', 'SYSTEM_NAME', 'DIAMETER', 'STATUS', 'INTERSTATE'],
    }),
    queryLayer<SurveyAttrs>(`${RRC}/${RRC_LAYERS.surveys}`, {
      service: SERVICE,
      geometry,
      outFields: ['ABSTRACT_LABEL', 'LEVEL1_SURVEY_NAME', 'LEVEL2_BLOCK_NUMBER', 'LEVEL3_SURVEY_NUMBER'],
      limit: 8,
    }),
  ]);
  if (onParcel.status === 'rejected') throw onParcel.reason;
  if (nearby.status === 'rejected') throw nearby.reason;

  const wellsOnParcel = onParcel.value.features.map((f) => toWell(f.attributes, true));
  const onParcelApis = new Set(wellsOnParcel.map((w) => w.api));
  const counts = new Map<string, number>();
  let nearbyTotal = 0;
  for (const f of nearby.value.features) {
    const well = toWell(f.attributes, false);
    if (onParcelApis.has(well.api)) continue;
    nearbyTotal++;
    counts.set(well.type, (counts.get(well.type) ?? 0) + 1);
  }

  const caveats = [
    'Mineral ownership is not in any statewide database. Texas minerals are often severed from the surface, and only a title search of the county deed records shows who owns them and whether they are leased.',
  ];
  if (laterals.status === 'rejected') caveats.push('Horizontal well paths could not be loaded right now.');
  if (pipelines.status === 'rejected') caveats.push('Pipelines could not be loaded right now.');
  if (surveys.status === 'rejected') caveats.push('Original land surveys could not be loaded right now.');
  const truncated = onParcel.value.truncated || nearby.value.truncated;
  if (truncated) caveats.push('This area has more wells than the Railroad Commission returns in one request, so counts are a minimum.');

  const lateralCount = laterals.status === 'fulfilled' ? laterals.value.features.length : 0;

  return {
    radiusMiles: RADIUS_MILES,
    wellsOnParcel,
    nearbyCounts: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    nearbyTotal,
    truncated,
    lateralsUnderParcel: lateralCount,
    pipelines: pipelines.status === 'fulfilled' ? toPipelines(pipelines.value.features.map((f) => f.attributes)) : [],
    surveys:
      surveys.status === 'fulfilled'
        ? surveys.value.features.map(
            (f): Survey => ({
              abstract: clean(f.attributes.ABSTRACT_LABEL),
              name: clean(f.attributes.LEVEL1_SURVEY_NAME),
              block: clean(f.attributes.LEVEL2_BLOCK_NUMBER),
              section: clean(f.attributes.LEVEL3_SURVEY_NUMBER),
            }),
          )
        : [],
    signal: mineralSignal(wellsOnParcel, lateralCount, nearbyTotal),
    caveats,
    sources: [{ name: 'Railroad Commission of Texas, Public GIS Viewer', url: 'https://gis.rrc.texas.gov/GISViewer/' }],
  };
}
