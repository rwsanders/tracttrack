import type { ParcelGeometry } from '../../shared/types.ts';
import { geoJsonToEsri } from './geo.ts';
import { fetchJson, UpstreamError } from './http.ts';

interface EsriError {
  error?: { code?: number; message?: string };
}

export interface EsriFeature<A = Record<string, unknown>> {
  attributes: A;
  geometry?: { rings?: number[][][]; paths?: number[][][]; x?: number; y?: number };
}

interface QueryResponse<A> extends EsriError {
  features?: EsriFeature<A>[];
  exceededTransferLimit?: boolean;
}

export interface QueryOptions {
  service: string;
  outFields: string[];
  /** Spatial filter in WGS84: a polygon, or a [lng, lat] point. */
  geometry: ParcelGeometry | [number, number];
  returnGeometry?: boolean;
  /** Buffer the filter geometry by this many statute miles. */
  distanceMiles?: number;
  where?: string;
  limit?: number;
  timeoutMs?: number;
  /** Generalizes returned geometry; in degrees because output is WGS84. */
  maxAllowableOffset?: number;
}

/** Runs a spatial query against an ArcGIS REST layer and returns WGS84 features. */
export async function queryLayer<A = Record<string, unknown>>(
  layerUrl: string,
  opts: QueryOptions,
): Promise<{ features: EsriFeature<A>[]; truncated: boolean }> {
  const isPoint = Array.isArray(opts.geometry);
  const form: Record<string, string> = {
    f: 'json',
    where: opts.where ?? '1=1',
    geometry: isPoint
      ? `${(opts.geometry as [number, number])[0]},${(opts.geometry as [number, number])[1]}`
      : JSON.stringify(geoJsonToEsri(opts.geometry as ParcelGeometry)),
    geometryType: isPoint ? 'esriGeometryPoint' : 'esriGeometryPolygon',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: opts.outFields.join(','),
    returnGeometry: String(opts.returnGeometry ?? false),
  };
  if (opts.distanceMiles) {
    form.distance = String(opts.distanceMiles);
    form.units = 'esriSRUnit_StatuteMile';
  }
  if (opts.limit) form.resultRecordCount = String(opts.limit);
  if (opts.maxAllowableOffset) form.maxAllowableOffset = String(opts.maxAllowableOffset);
  if (opts.returnGeometry) form.geometryPrecision = '6';

  const data = await fetchJson<QueryResponse<A>>(`${layerUrl}/query`, {
    service: opts.service,
    form,
    timeoutMs: opts.timeoutMs,
  });
  if (data.error) throw new UpstreamError(opts.service, data.error.message ?? 'query failed');
  return { features: data.features ?? [], truncated: Boolean(data.exceededTransferLimit) };
}

interface IdentifyResponse extends EsriError {
  results?: {
    layerId: number;
    attributes: Record<string, string>;
    geometry?: { rings?: number[][][] };
  }[];
}

/**
 * Identify at a point. Used where a map service has its Query operation
 * switched off; identify still returns attributes and geometry.
 */
export async function identifyAt(
  mapServerUrl: string,
  lngLat: [number, number],
  opts: { service: string; layerId: number; timeoutMs?: number },
): Promise<NonNullable<IdentifyResponse['results']>> {
  const [lng, lat] = lngLat;
  // A ~100 m window at 400 px makes 1 px of tolerance about 25 cm on the ground.
  const d = 0.0005;
  const params = new URLSearchParams({
    f: 'json',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: `all:${opts.layerId}`,
    tolerance: '1',
    mapExtent: `${lng - d},${lat - d},${lng + d},${lat + d}`,
    imageDisplay: '400,400,96',
    returnGeometry: 'true',
    geometryPrecision: '6',
  });
  const data = await fetchJson<IdentifyResponse>(`${mapServerUrl}/identify?${params}`, {
    service: opts.service,
    timeoutMs: opts.timeoutMs,
  });
  if (data.error) throw new UpstreamError(opts.service, data.error.message ?? 'identify failed');
  return data.results ?? [];
}

/** Builds a raster tile template for a MapServer's dynamic export endpoint. */
export function exportTiles(mapServerUrl: string, layerIds: number[]): string {
  return (
    `${mapServerUrl}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512` +
    `&dpi=96&format=png32&transparent=true&layers=show:${layerIds.join(',')}&f=image`
  );
}
