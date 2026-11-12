// Types shared by the API server and the web client.
import type { MultiPolygon, Polygon } from 'geojson';

export type StateCode = 'TX';

export type ParcelGeometry = Polygon | MultiPolygon;

/** A parcel normalized from whatever the state's source of record provides. */
export interface Parcel {
  /** Stable within a state + tax year: `${state}:${fips}:${propId}`. */
  id: string;
  state: StateCode;
  county: string | null;
  fips: string | null;
  propId: string | null;
  geoId: string | null;
  owner: string | null;
  careOf: string | null;
  mailingAddress: string | null;
  situsAddress: string | null;
  legalDescription: string | null;
  /** Acreage per the appraisal roll, when the roll reports it in acres. */
  legalAcres: number | null;
  /** Acreage measured from the mapped boundary. */
  mappedAcres: number | null;
  landValue: number | null;
  improvementValue: number | null;
  marketValue: number | null;
  taxYear: string | null;
  yearBuilt: string | null;
  landUse: string | null;
  /** Appraisal district (or other body) that supplied the record. */
  source: string | null;
  /** Date the source record was collected, ISO yyyy-mm-dd. */
  sourceDate: string | null;
  centroid: [number, number];
  geometry: ParcelGeometry;
}

export interface ParcelLookup {
  parcels: Parcel[];
}

export interface SourceRef {
  name: string;
  url: string;
}

export interface TaxUnit {
  kind: 'county' | 'city' | 'school' | 'special';
  name: string;
  /** Dollars per $100 of taxable value. */
  rate: number;
  /** Rate x the parcel's market value. Null when no value is on the roll. */
  estimate: number | null;
}

export interface TaxReport {
  taxYear: number;
  basisValue: number | null;
  units: TaxUnit[];
  /** Sum of the matched units' rates. */
  totalRate: number;
  totalEstimate: number | null;
  /** Special districts reporting in this county; any of them might apply. */
  possibleUnits: { name: string; rate: number }[];
  caveats: string[];
  sources: SourceRef[];
}

export interface Well {
  api: string;
  wellNumber: string | null;
  type: string;
  onParcel: boolean;
  lngLat: [number, number];
}

export interface Pipeline {
  operator: string | null;
  commodity: string | null;
  system: string | null;
  diameterInches: number | null;
  status: string | null;
  interstate: boolean | null;
}

export interface Survey {
  abstract: string | null;
  name: string | null;
  block: string | null;
  section: string | null;
}

export interface MineralReport {
  radiusMiles: number;
  wellsOnParcel: Well[];
  nearbyCounts: { type: string; count: number }[];
  nearbyTotal: number;
  /** True when the source capped the result; counts are then a floor. */
  truncated: boolean;
  lateralsUnderParcel: number;
  pipelines: Pipeline[];
  surveys: Survey[];
  signal: 'on-parcel' | 'nearby' | 'none';
  caveats: string[];
  sources: SourceRef[];
}

export interface FloodZone {
  zone: string;
  subtype: string | null;
  /** In the Special Flood Hazard Area (the 1%-annual-chance floodplain). */
  sfha: boolean;
  acres: number | null;
  percent: number | null;
}

export interface FloodReport {
  mapped: boolean;
  zones: FloodZone[];
  sfhaPercent: number | null;
  caveats: string[];
  sources: SourceRef[];
}

export interface SoilUnit {
  symbol: string;
  name: string;
  acres: number;
  percent: number;
  farmland: string | null;
  capabilityClass: string | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  slopePercent: number | null;
  flooding: string | null;
}

export interface WetlandType {
  type: string;
  features: number;
}

export interface LandReport {
  elevation: { minFt: number; maxFt: number; centerFt: number | null; samples: number } | null;
  soils: SoilUnit[];
  primeFarmlandPercent: number | null;
  wetlands: WetlandType[];
  caveats: string[];
  sources: SourceRef[];
}

export type ReportSection = 'taxes' | 'minerals' | 'flood' | 'land';

export interface ReportMap {
  taxes: TaxReport;
  minerals: MineralReport;
  flood: FloodReport;
  land: LandReport;
}

/** A raster overlay the client can toggle, served straight from the agency. */
export interface OverlayLayer {
  id: string;
  label: string;
  description: string;
  /** XYZ-style template; `{bbox-epsg-3857}` is filled in by the map. */
  tiles: string;
  minZoom: number;
  defaultOn: boolean;
  opacity: number;
  swatch: string;
  attribution: string;
}

export interface StateConfig {
  code: StateCode;
  name: string;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  center: [number, number];
  zoom: number;
  overlays: OverlayLayer[];
  /** Report sections this state can produce. */
  sections: ReportSection[];
  sources: SourceRef[];
}

export interface GeocodeResult {
  label: string;
  detail: string;
  lngLat: [number, number];
  /** [west, south, east, north] when the match is an area rather than a point. */
  bounds: [number, number, number, number] | null;
}
