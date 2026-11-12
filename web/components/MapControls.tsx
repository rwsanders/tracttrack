import { useEffect, useRef, useState } from 'react';
import type { OverlayLayer } from '../../shared/types.ts';
import type { SavedTract } from '../lib/storage.ts';
import { acres, moneyCompact } from '../lib/format.ts';
import { BookmarkIcon, CloseIcon, LayersIcon } from './icons.tsx';
import type { BasemapId } from './MapView.tsx';

const BASEMAP_LABELS: Record<BasemapId, string> = { streets: 'Map', satellite: 'Satellite', topo: 'Topo' };

interface Props {
  basemap: BasemapId;
  onBasemap(id: BasemapId): void;
  overlays: OverlayLayer[];
  active: Set<string>;
  zoom: number;
  onToggle(id: string): void;
  saved: SavedTract[];
  onOpenSaved(tract: SavedTract): void;
  onRemoveSaved(id: string): void;
}

/** Closes a popover on outside press or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

export function MapControls({ basemap, onBasemap, overlays, active, zoom, onToggle, saved, onOpenSaved, onRemoveSaved }: Props) {
  const [menu, setMenu] = useState<'layers' | 'saved' | null>(null);
  const ref = useDismiss(menu !== null, () => setMenu(null));
  const activeCount = overlays.filter((o) => active.has(o.id)).length;

  return (
    <div className="controls" ref={ref}>
      <div className="segmented" role="radiogroup" aria-label="Basemap">
        {(Object.keys(BASEMAP_LABELS) as BasemapId[]).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={basemap === id} onClick={() => onBasemap(id)}>
            {BASEMAP_LABELS[id]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="chip-button"
        aria-expanded={menu === 'layers'}
        onClick={() => setMenu(menu === 'layers' ? null : 'layers')}
      >
        <LayersIcon />
        <span>Layers</span>
        <span className="count">{activeCount}</span>
      </button>

      <button
        type="button"
        className="chip-button"
        aria-expanded={menu === 'saved'}
        onClick={() => setMenu(menu === 'saved' ? null : 'saved')}
      >
        <BookmarkIcon filled={saved.length > 0} />
        <span>Saved</span>
        {saved.length > 0 && <span className="count">{saved.length}</span>}
      </button>

      {menu === 'layers' && (
        <div className="popover" role="group" aria-label="Map layers">
          {overlays.map((o) => {
            const hidden = active.has(o.id) && zoom < o.minZoom;
            return (
              <label key={o.id} className="layer-row">
                <input type="checkbox" checked={active.has(o.id)} onChange={() => onToggle(o.id)} />
                <span className="swatch" style={{ background: o.swatch }} />
                <span className="layer-text">
                  <span className="layer-label">{o.label}</span>
                  <span className="layer-desc">{hidden ? 'Zoom in to see this layer' : o.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {menu === 'saved' && (
        <div className="popover" role="group" aria-label="Saved tracts">
          {saved.length === 0 ? (
            <p className="popover-empty">Tracts you save appear here, stored on this device.</p>
          ) : (
            saved.map((t) => (
              <div key={t.id} className="saved-row">
                <button
                  type="button"
                  className="saved-open"
                  onClick={() => {
                    setMenu(null);
                    onOpenSaved(t);
                  }}
                >
                  <span className="saved-owner">{t.owner ?? 'Owner not listed'}</span>
                  <span className="saved-meta">
                    {[t.county && `${t.county} Co.`, t.acres !== null && `${acres(t.acres)} ac`, t.marketValue ? moneyCompact(t.marketValue) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
                <button type="button" className="icon-button" aria-label={`Remove ${t.owner ?? 'tract'}`} onClick={() => onRemoveSaved(t.id)}>
                  <CloseIcon width={15} height={15} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
