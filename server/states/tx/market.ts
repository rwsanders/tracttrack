import type { MarketReport, Parcel } from '../../../shared/types.ts';
import { identifyArea } from '../../lib/arcgis.ts';
import { SQ_METERS_PER_ACRE } from '../../lib/geo.ts';
import { number, text, TX_PARCELS } from './parcels.ts';

const SERVICE = 'TxGIO StratMap Land Parcels';
const MILES_PER_DEGREE_LAT = 69.05;
const MAX_RADIUS_MILES = 10;
/** A box that overflows the service's record cap is split in four, at most this many times. */
const MAX_SPLITS = 2;
const MIN_COMPARABLES = 6;
const MIN_FOR_STATS = 3;
/**
 * Dollars per acre. Land under agricultural valuation is carried by some
 * districts at its productivity value (a few dollars to a few hundred per
 * acre) rather than what it would sell for. Nothing in Texas sells this
 * cheaply, so figures below the line are treated as productivity values.
 */
export const PRODUCTIVITY_CEILING = 300;

type Box = [number, number, number, number];
type Raw = Record<string, string>;

export interface Neighbor {
  key: string;
  acres: number;
  landValue: number;
}

/**
 * Reads one neighbor from the raw record. Acreage comes from the shape area,
 * which every county has; it is measured in Web Mercator, whose areas are
 * inflated by 1/cos^2 of the latitude.
 */
export function toNeighbor(a: Raw, latitude: number): Neighbor | null {
  const mercatorArea = number(a['st_area(shape)']);
  const landValue = number(a.LAND_VALUE);
  if (mercatorArea === null || mercatorArea <= 0 || landValue === null || landValue <= 0) return null;
  const acres = (mercatorArea * Math.cos((latitude * Math.PI) / 180) ** 2) / SQ_METERS_PER_ACRE;
  return { key: `${text(a.FIPS) ?? ''}:${text(a.PROP_ID) ?? text(a.objectid) ?? ''}`, acres, landValue };
}

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export interface Subject {
  key: string;
  acres: number | null;
  landValue: number | null;
  improvementValue: number | null;
}

export type Comparison = Pick<
  MarketReport,
  | 'band'
  | 'comparableCount'
  | 'productivityValued'
  | 'subjectAtProductivityValue'
  | 'landPerAcre'
  | 'subjectLandPerAcre'
  | 'subjectVsMedianPercent'
  | 'impliedValue'
>;

/**
 * Compares the subject with neighbors of similar size. Size matters because
 * per-acre value falls steeply as tracts get larger; a ranch and a town lot
 * are not comparable. The band widens once if too few parcels fit.
 */
export function compare(subject: Subject, neighbors: Neighbor[]): Comparison {
  const acres = subject.acres !== null && subject.acres > 0 ? subject.acres : null;
  const subjectPerAcre = acres && subject.landValue ? subject.landValue / acres : null;
  const subjectAtProductivityValue = subjectPerAcre !== null && subjectPerAcre < PRODUCTIVITY_CEILING;
  const empty: Comparison = {
    band: { minAcres: 0, maxAcres: 0 },
    comparableCount: 0,
    productivityValued: 0,
    subjectAtProductivityValue,
    landPerAcre: null,
    subjectLandPerAcre: subjectPerAcre,
    subjectVsMedianPercent: null,
    impliedValue: null,
  };
  if (acres === null) return empty;

  const unique = new Map<string, Neighbor>();
  for (const n of neighbors) if (n.key !== subject.key) unique.set(n.key, n);

  let band = { minAcres: acres / 2, maxAcres: acres * 2 };
  const within = () => {
    const sized = [...unique.values()].filter((n) => n.acres >= band.minAcres && n.acres <= band.maxAcres);
    const priced = sized.filter((n) => n.landValue / n.acres >= PRODUCTIVITY_CEILING);
    return { priced, productivityValued: sized.length - priced.length };
  };
  let similar = within();
  if (similar.priced.length < MIN_COMPARABLES) {
    band = { minAcres: acres / 3, maxAcres: acres * 3 };
    similar = within();
  }
  const counts = { band, comparableCount: similar.priced.length, productivityValued: similar.productivityValued };
  if (similar.priced.length < MIN_FOR_STATS) return { ...empty, ...counts };

  const perAcre = similar.priced.map((n) => n.landValue / n.acres).sort((x, y) => x - y);
  const landPerAcre = { low: quantile(perAcre, 0.25), median: quantile(perAcre, 0.5), high: quantile(perAcre, 0.75) };
  const improvements = subject.improvementValue ?? 0;
  return {
    ...counts,
    subjectAtProductivityValue,
    landPerAcre,
    subjectLandPerAcre: subjectPerAcre,
    // Comparing a productivity value with market values would only measure the tax break.
    subjectVsMedianPercent:
      subjectPerAcre === null || subjectAtProductivityValue ? null : (subjectPerAcre / landPerAcre.median - 1) * 100,
    impliedValue: {
      low: acres * landPerAcre.low + improvements,
      mid: acres * landPerAcre.median + improvements,
      high: acres * landPerAcre.high + improvements,
    },
  };
}

/** Town lots have close neighbors; ranches need a wider net. */
export function searchRadiusMiles(acres: number): number {
  if (acres < 2) return 0.3;
  if (acres < 20) return 1;
  if (acres < 200) return 2.5;
  return 5;
}

function boxAround([lng, lat]: [number, number], miles: number): Box {
  const dLat = miles / MILES_PER_DEGREE_LAT;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/** Reads every parcel in a box, quartering it wherever the service's cap cuts the answer short. */
async function readBox(box: Box, splitsLeft: number): Promise<{ rows: Raw[]; truncated: boolean }> {
  const result = await identifyArea(TX_PARCELS, box, { service: SERVICE, layerId: 0, timeoutMs: 30_000 });
  if (!result.truncated || splitsLeft === 0) return result;
  const [w, s, e, n] = box;
  const midX = (w + e) / 2;
  const midY = (s + n) / 2;
  const quarters: Box[] = [
    [w, s, midX, midY],
    [midX, s, e, midY],
    [w, midY, midX, n],
    [midX, midY, e, n],
  ];
  const parts = await Promise.all(quarters.map((q) => readBox(q, splitsLeft - 1)));
  return { rows: parts.flatMap((p) => p.rows), truncated: parts.some((p) => p.truncated) };
}

export async function marketReport(parcel: Parcel): Promise<MarketReport> {
  const acres = parcel.mappedAcres ?? parcel.legalAcres;
  const subject: Subject = {
    key: `${parcel.fips ?? ''}:${parcel.propId ?? ''}`,
    acres,
    landValue: parcel.landValue,
    improvementValue: parcel.improvementValue,
  };

  let radius = searchRadiusMiles(acres ?? 0);
  let scanned = 0;
  let truncated = false;
  let comparison = compare(subject, []);
  // Widen the search once if the first pass finds too few similar parcels.
  for (let pass = 0; pass < 2 && acres; pass++) {
    const area = await readBox(boxAround(parcel.centroid, radius), MAX_SPLITS);
    const neighbors = area.rows
      .map((row) => toNeighbor(row, parcel.centroid[1]))
      .filter((n): n is Neighbor => n !== null);
    scanned = area.rows.length;
    truncated = area.truncated;
    comparison = compare(subject, neighbors);
    if (comparison.comparableCount >= MIN_COMPARABLES || truncated || radius * 2 > MAX_RADIUS_MILES) break;
    radius *= 2;
  }

  const caveats = [
    'These are appraisal district values, not sale prices. Texas does not make sale prices public, and rural land often sells for more than it is appraised.',
    'Size is the only thing matched. Road frontage, water, improvements, views and minerals move real prices and are not accounted for.',
  ];
  if (comparison.productivityValued > 0) {
    const n = comparison.productivityValued;
    caveats.push(
      `${n} similar-sized parcel${n === 1 ? ' is' : 's are'} carried at under $${PRODUCTIVITY_CEILING} an acre, which is an agricultural productivity value and not a market value. ${n === 1 ? 'It was' : 'They were'} left out.`,
    );
  }
  if (truncated) {
    caveats.push('This area has more parcels than could be read in one pass, so the comparison rests on a partial sample.');
  }

  return {
    radiusMiles: radius,
    ...comparison,
    parcelsScanned: scanned,
    truncated,
    caveats,
    sources: [{ name: 'TxGIO StratMap Land Parcels (county appraisal districts)', url: 'https://geographic.texas.gov/' }],
  };
}
