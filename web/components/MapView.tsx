import {
  GeolocateControl,
  MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { OverlayLayer, ParcelGeometry, StateConfig } from '../../shared/types.ts';

// The library locates its worker relative to its own file, which a bundler moves.
setWorkerUrl(workerUrl);

export type BasemapId = 'streets' | 'satellite' | 'topo';

export interface MapViewHandle {
  flyTo(lngLat: [number, number], zoom?: number): void;
  fitBounds(bounds: [number, number, number, number]): void;
  fitGeometry(geometry: ParcelGeometry): void;
}

export interface MapPosition {
  center: [number, number];
  zoom: number;
}

interface Props {
  ref: Ref<MapViewHandle>;
  state: StateConfig;
  initial: MapPosition | null;
  basemap: BasemapId;
  activeOverlays: Set<string>;
  selection: ParcelGeometry | null;
  /** Where a lookup is in flight; shown as a pulsing pin. */
  pendingPoint: [number, number] | null;
  /** Space the property panel covers, so fitted parcels land in view. */
  panelOpen: boolean;
  onPick(lngLat: [number, number], zoom: number): void;
  onMove(position: MapPosition): void;
}

const usgs = (service: string, label: string): StyleSpecification => ({
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: [`https://basemap.nationalmap.gov/arcgis/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 16,
      attribution: `${label}: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noreferrer">USGS The National Map</a>`,
    },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

const BASEMAPS: Record<BasemapId, string | StyleSpecification> = {
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: usgs('USGSImageryOnly', 'Imagery'),
  topo: usgs('USGSTopo', 'Topo'),
};

const SELECTION = 'tt-selection';
const overlayId = (id: string) => `tt-overlay-${id}`;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

function geometryBounds(geometry: ParcelGeometry): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
  return [w, s, e, n];
}

/**
 * Adds whatever of our sources and layers the current style lacks, then
 * applies visibility. Safe to call any time; a basemap switch wipes the
 * style, so this runs again on every style load.
 */
function syncLayers(map: MapLibreMap, overlays: OverlayLayer[], active: Set<string>, selection: ParcelGeometry | null) {
  for (const overlay of overlays) {
    const id = overlayId(overlay.id);
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'raster', tiles: [overlay.tiles], tileSize: 512, attribution: overlay.attribution });
    }
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type: 'raster',
        source: id,
        minzoom: overlay.minZoom,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': overlay.opacity, 'raster-fade-duration': 150 },
      });
    }
    map.setLayoutProperty(id, 'visibility', active.has(overlay.id) ? 'visible' : 'none');
  }

  if (!map.getSource(SELECTION)) {
    map.addSource(SELECTION, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: `${SELECTION}-fill`, type: 'fill', source: SELECTION, paint: { 'fill-color': '#ff7a1a', 'fill-opacity': 0.14 } });
    map.addLayer({
      id: `${SELECTION}-casing`,
      type: 'line',
      source: SELECTION,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 5.5, 'line-opacity': 0.9 },
    });
    map.addLayer({
      id: `${SELECTION}-line`,
      type: 'line',
      source: SELECTION,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#f25c05', 'line-width': 2.75 },
    });
  }
  (map.getSource(SELECTION) as GeoJSONSource).setData(
    selection ? { type: 'Feature', geometry: selection, properties: {} } : EMPTY,
  );
}

export function MapView({ ref, state, initial, basemap, activeOverlays, selection, pendingPoint, panelOpen, onPick, onMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // Tracked by hand: the library's isStyleLoaded() also reports false while tiles are still arriving.
  const styleReady = useRef(false);
  // Map callbacks are registered once, so they read the latest props from here.
  const latest = useRef({ state, activeOverlays, selection, onPick, onMove, panelOpen, basemap });
  latest.current = { state, activeOverlays, selection, onPick, onMove, panelOpen, basemap };

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: BASEMAPS[latest.current.basemap],
      center: initial?.center ?? state.center,
      zoom: initial?.zoom ?? state.zoom,
      maxZoom: 19,
      minZoom: 3.5,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'imperial', maxWidth: 120 }), 'bottom-right');

    map.on('style.load', () => {
      styleReady.current = true;
      const now = latest.current;
      syncLayers(map, now.state.overlays, now.activeOverlays, now.selection);
    });
    map.on('click', (e) => latest.current.onPick([e.lngLat.lng, e.lngLat.lat], map.getZoom()));
    map.on('moveend', () => {
      const c = map.getCenter();
      latest.current.onMove({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });
    // A failed overlay tile from an agency server is routine; keep it out of the user's way.
    map.on('error', (e) => console.debug('[map]', e.error?.message ?? e));

    return () => {
      map.remove();
      mapRef.current = null;
      styleReady.current = false;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shownBasemap = useRef(basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownBasemap.current === basemap) return;
    shownBasemap.current = basemap;
    styleReady.current = false;
    // The basemaps share nothing, so skip the diff and swap the whole style.
    map.setStyle(BASEMAPS[basemap], { diff: false });
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && styleReady.current) syncLayers(map, state.overlays, activeOverlays, selection);
  }, [state, activeOverlays, selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (pendingPoint) {
      const el = document.createElement('div');
      el.className = 'pending-pin';
      markerRef.current = new Marker({ element: el }).setLngLat(pendingPoint).addTo(map);
    }
  }, [pendingPoint]);

  useImperativeHandle(ref, () => {
    const padding = () => {
      const wide = window.innerWidth > 760;
      const open = latest.current.panelOpen;
      return {
        // On a phone the controls wrap onto a second row.
        top: wide ? 90 : 124,
        right: 60,
        bottom: !wide && open ? Math.round(window.innerHeight * 0.58) + 20 : 60,
        left: wide && open ? 470 : 60,
      };
    };
    return {
      flyTo: (lngLat, zoom = 15) => mapRef.current?.flyTo({ center: lngLat, zoom, padding: padding(), duration: 1400 }),
      fitBounds: (b) => mapRef.current?.fitBounds(b, { padding: padding(), maxZoom: 16, duration: 1400 }),
      fitGeometry: (geometry) => {
        const map = mapRef.current;
        if (!map) return;
        const [w, s, e, n] = geometryBounds(geometry);
        // Judge visibility against the part of the map the panel leaves uncovered.
        const pad = padding();
        const { clientWidth, clientHeight } = map.getContainer();
        const a = map.project([w, n]);
        const b = map.project([e, s]);
        const visible = a.x >= pad.left && b.x <= clientWidth - pad.right && a.y >= pad.top && b.y <= clientHeight - pad.bottom;
        const tiny = b.x - a.x < 60 && b.y - a.y < 60;
        // Leave the view alone when the whole parcel is already comfortably in sight.
        if (visible && !tiny) return;
        map.fitBounds([w, s, e, n], { padding: pad, maxZoom: 17, duration: 900 });
      },
    };
  }, []);

  return <div ref={container} className="map" role="application" aria-label="Map. Click a parcel to research it." />;
}
