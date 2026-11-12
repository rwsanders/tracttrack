import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeocodeResult, Parcel, StateConfig } from '../shared/types.ts';
import { MapControls } from './components/MapControls.tsx';
import { MapView, type BasemapId, type MapPosition, type MapViewHandle } from './components/MapView.tsx';
import { PropertyPanel } from './components/PropertyPanel.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { api } from './lib/api.ts';
import { loadSaved, persistSaved, toSaved, type SavedTract } from './lib/storage.ts';
import { readUrl, writeUrl } from './lib/url.ts';
import { useReports } from './lib/useReports.ts';

/** Below this zoom a click is too imprecise to mean one parcel. */
const PICK_ZOOM = 12;

type Selection =
  | { status: 'idle' }
  | { status: 'loading'; point: [number, number] }
  | { status: 'ready'; point: [number, number]; parcels: Parcel[]; index: number }
  | { status: 'empty'; point: [number, number] }
  | { status: 'error'; point: [number, number]; message: string };

const BASEMAP_KEY = 'tracttrack.basemap';
const storedBasemap = (): BasemapId => {
  try {
    const v = localStorage.getItem(BASEMAP_KEY);
    return v === 'satellite' || v === 'topo' || v === 'streets' ? v : 'satellite';
  } catch {
    return 'satellite';
  }
};

export function App() {
  const [config, setConfig] = useState<StateConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setConfigError(null);
    api
      .states()
      .then((states) => {
        if (cancelled) return;
        if (states.length === 0) setConfigError('No states are configured.');
        else setConfig(states[0]);
      })
      .catch((err: unknown) => {
        if (!cancelled) setConfigError(err instanceof Error ? err.message : 'Could not load the map.');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!config) {
    return (
      <div className="boot">
        {configError ? (
          <div role="alert">
            <p>{configError}</p>
            <button type="button" className="button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <p role="status">Loading map…</p>
        )}
      </div>
    );
  }
  return <Workspace config={config} />;
}

function Workspace({ config }: { config: StateConfig }) {
  const start = useMemo(readUrl, []);
  const map = useRef<MapViewHandle>(null);
  const lookup = useRef<AbortController | null>(null);

  const [basemap, setBasemap] = useState<BasemapId>(storedBasemap);
  const [active, setActive] = useState(() => new Set(config.overlays.filter((o) => o.defaultOn).map((o) => o.id)));
  const [position, setPosition] = useState<MapPosition>(start.position ?? { center: config.center, zoom: config.zoom });
  const [selection, setSelection] = useState<Selection>({ status: 'idle' });
  const [saved, setSaved] = useState<SavedTract[]>(loadSaved);
  const [nudge, setNudge] = useState<string | null>(null);

  const parcel = selection.status === 'ready' ? selection.parcels[selection.index] : null;
  const { reports, retry } = useReports(parcel, config.sections);

  const pick = useCallback((point: [number, number]) => {
    lookup.current?.abort();
    const controller = (lookup.current = new AbortController());
    setNudge(null);
    setSelection({ status: 'loading', point });
    api
      .parcelsAt(point, controller.signal)
      .then((parcels) => {
        if (controller.signal.aborted) return;
        if (parcels.length === 0) {
          setSelection({ status: 'empty', point });
          return;
        }
        setSelection({ status: 'ready', point, parcels, index: 0 });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSelection({ status: 'error', point, message: err instanceof Error ? err.message : 'Lookup failed.' });
      });
  }, []);

  const onMapPick = useCallback(
    (point: [number, number], zoom: number) => {
      if (zoom < PICK_ZOOM) {
        setNudge('Zoom in closer to choose a parcel.');
        return;
      }
      pick(point);
    },
    [pick],
  );

  const close = useCallback(() => {
    lookup.current?.abort();
    setSelection({ status: 'idle' });
  }, []);

  // Runs after the panel has rendered, so the fit can keep the tract clear of it.
  useEffect(() => {
    if (parcel) map.current?.fitGeometry(parcel.geometry);
    // The id identifies the selection; the object is recreated on every lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id]);

  // A shared link reopens the tract it points to.
  useEffect(() => {
    if (start.parcel) pick(start.parcel);
  }, [start, pick]);

  const selectedPoint = selection.status === 'ready' ? selection.point : null;
  useEffect(() => writeUrl(position, selectedPoint), [position, selectedPoint]);

  useEffect(() => {
    try {
      localStorage.setItem(BASEMAP_KEY, basemap);
    } catch {
      // Preference just won't persist.
    }
  }, [basemap]);

  useEffect(() => {
    if (!nudge) return;
    const timer = setTimeout(() => setNudge(null), 3500);
    return () => clearTimeout(timer);
  }, [nudge]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, select, textarea');
      if (e.key === 'Escape' && !typing) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const onSearch = (result: GeocodeResult) => {
    if (result.bounds) {
      map.current?.fitBounds(result.bounds);
      return;
    }
    map.current?.flyTo(result.lngLat, 16);
    pick(result.lngLat);
  };

  const toggleSaved = () => {
    if (!parcel) return;
    setSaved((list) => {
      const next = list.some((t) => t.id === parcel.id) ? list.filter((t) => t.id !== parcel.id) : [toSaved(parcel), ...list];
      persistSaved(next);
      return next;
    });
  };

  const removeSaved = (id: string) =>
    setSaved((list) => {
      const next = list.filter((t) => t.id !== id);
      persistSaved(next);
      return next;
    });

  const toggleOverlay = (id: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const status =
    nudge ??
    (selection.status === 'loading'
      ? 'Looking up parcel…'
      : selection.status === 'empty'
        ? 'No parcel is mapped at that spot.'
        : selection.status === 'error'
          ? selection.message
          : selection.status === 'idle'
            ? position.zoom >= PICK_ZOOM
              ? 'Click any parcel to research it.'
              : 'Zoom in, then click a tract to research it.'
            : null);

  return (
    <div className={parcel ? 'app has-panel' : 'app'}>
      <MapView
        ref={map}
        state={config}
        initial={start.position}
        basemap={basemap}
        activeOverlays={active}
        selection={parcel?.geometry ?? null}
        pendingPoint={selection.status === 'loading' ? selection.point : null}
        panelOpen={parcel !== null}
        onPick={onMapPick}
        onMove={setPosition}
      />

      <div className="top">
        <SearchBar placeholder={`Search ${config.name}: city, address or coordinates`} onSelect={onSearch} />
        <MapControls
          basemap={basemap}
          onBasemap={setBasemap}
          overlays={config.overlays}
          active={active}
          zoom={position.zoom}
          onToggle={toggleOverlay}
          saved={saved}
          onOpenSaved={(t) => {
            map.current?.flyTo(t.lngLat, 15);
            pick(t.lngLat);
          }}
          onRemoveSaved={removeSaved}
        />
      </div>

      {selection.status === 'ready' && parcel && (
        <PropertyPanel
          parcels={selection.parcels}
          index={selection.index}
          onIndex={(index) => setSelection({ ...selection, index })}
          reports={reports}
          onRetry={retry}
          saved={saved.some((t) => t.id === parcel.id)}
          onToggleSaved={toggleSaved}
          onClose={close}
        />
      )}

      {status && (
        <div className={selection.status === 'error' && !nudge ? 'status status-error' : 'status'} role="status" aria-live="polite">
          {selection.status === 'loading' && !nudge && <span className="spinner" aria-hidden />}
          <span>{status}</span>
          {selection.status === 'error' && !nudge && (
            <button type="button" className="link-button" onClick={() => pick(selection.point)}>
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
