import type { Parcel } from '../../../shared/types.ts';
import { identifyAt } from '../../lib/arcgis.ts';
import { acres, esriRingsToGeoJson, interiorPoint } from '../../lib/geo.ts';

export const TX_PARCELS =
  'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer';

type Raw = Record<string, string | undefined>;

/** The source writes missing values as the literal text "Null". */
export function text(v: string | undefined | null): string | null {
  const t = (v ?? '').replace(/\s+/g, ' ').trim();
  return t === '' || t.toLowerCase() === 'null' ? null : t;
}

export function number(v: string | undefined | null): number | null {
  const t = text(v);
  if (t === null) return null;
  const n = Number(t.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Accepts an ISO-like date or a spreadsheet serial day count (as the service returns). */
export function sourceDate(v: string | undefined | null): string | null {
  const t = text(v);
  if (t === null) return null;
  if (/^\d{4,6}(\.\d+)?$/.test(t)) {
    const serial = Number(t);
    if (serial < 20000 || serial > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  // Date parsing is lenient enough to turn a stray "7" into a date, so require a real one.
  if (!/^\d{4}-\d{1,2}-\d{1,2}|^\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Appraisal rolls report "legal area" in acres for rural land but in square
 * feet for some town lots, and the unit column is usually blank. The mapped
 * boundary settles which one it is; a figure that fits neither is dropped.
 */
export function legalAcres(value: number | null, unit: string | null, mapped: number | null): number | null {
  if (value === null || value <= 0) return null;
  const u = unit?.toUpperCase() ?? '';
  if (/^(AC|ACRE)/.test(u)) return value;
  if (/^(SF|SQ)/.test(u)) return value / 43_560;
  if (mapped === null || mapped <= 0) return null;
  const plausible = (a: number) => a / mapped > 0.2 && a / mapped < 5;
  if (plausible(value)) return value;
  if (plausible(value / 43_560)) return value / 43_560;
  return null;
}

/** Rolls assemble addresses from parts, leaving " ," and ",," where a part was empty. */
export function tidyAddress(v: string | null): string | null {
  if (v === null) return null;
  const t = v
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '');
  return t === '' ? null : t;
}

function mailing(a: Raw): string | null {
  const full = tidyAddress(text(a.MAIL_ADDR));
  if (full) return full;
  const cityLine = [text(a.MAIL_CITY), [text(a.MAIL_STAT), text(a.MAIL_ZIP)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const parts = [text(a.MAIL_LINE1), text(a.MAIL_LINE2), cityLine].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function normalizeParcel(a: Raw, rings: number[][][] | undefined): Parcel | null {
  const geometry = rings ? esriRingsToGeoJson(rings) : null;
  if (!geometry) return null;
  const mappedAcres = acres(geometry);
  const fips = text(a.FIPS);
  const propId = text(a.PROP_ID);
  const owner = text(a.OWNER_NAME);
  const careOf = text(a.NAME_CARE);
  const landUse = [text(a.STAT_LAND_USE), text(a.LOC_LAND_USE)].filter(Boolean).join(' / ') || null;
  return {
    id: `TX:${fips ?? 'na'}:${propId ?? text(a.objectid) ?? 'na'}`,
    state: 'TX',
    county: text(a.COUNTY),
    fips,
    propId,
    geoId: text(a.GEO_ID),
    owner,
    careOf: careOf && careOf !== owner ? careOf : null,
    mailingAddress: mailing(a),
    situsAddress: tidyAddress(text(a.SITUS_ADDR)),
    legalDescription: text(a.LEGAL_DESC),
    legalAcres: legalAcres(number(a.LEGAL_AREA), text(a.LGL_AREA_UNIT), mappedAcres),
    mappedAcres,
    landValue: number(a.LAND_VALUE),
    improvementValue: number(a.IMP_VALUE),
    marketValue: number(a.MKT_VALUE),
    taxYear: text(a.TAX_YEAR),
    yearBuilt: text(a.YEAR_BUILT),
    landUse,
    source: text(a.SOURCE),
    sourceDate: sourceDate(a.DATE_ACQ),
    centroid: interiorPoint(geometry),
    geometry,
  };
}

export async function parcelsAt(lngLat: [number, number]): Promise<Parcel[]> {
  const results = await identifyAt(TX_PARCELS, lngLat, {
    service: 'TxGIO StratMap Land Parcels',
    layerId: 0,
    timeoutMs: 25_000,
  });
  const seen = new Set<string>();
  const parcels: Parcel[] = [];
  for (const r of results) {
    const parcel = normalizeParcel(r.attributes, r.geometry?.rings);
    if (!parcel || seen.has(parcel.id)) continue;
    seen.add(parcel.id);
    parcels.push(parcel);
  }
  // Where accounts overlap (a lot inside its parent tract), the smallest is the likeliest target.
  return parcels.sort((a, b) => (a.mappedAcres ?? 0) - (b.mappedAcres ?? 0));
}
