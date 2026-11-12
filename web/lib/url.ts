export interface UrlState {
  position: { center: [number, number]; zoom: number } | null;
  /** A point inside the selected parcel, as [lng, lat]. */
  parcel: [number, number] | null;
}

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Parses `#map=zoom/lat/lng&p=lat,lng`. Anything malformed is ignored. */
export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: UrlState = { position: null, parcel: null };

  const [zoom, lat, lng] = (params.get('map') ?? '').split('/').map(Number);
  if (Number.isFinite(zoom) && zoom >= 0 && zoom <= 22 && inRange(lat, lng)) {
    state.position = { center: [lng, lat], zoom };
  }
  const [plat, plng] = (params.get('p') ?? '').split(',').map(Number);
  if (params.has('p') && inRange(plat, plng)) state.parcel = [plng, plat];
  return state;
}

export function formatHash(position: UrlState['position'], parcel: UrlState['parcel']): string {
  const parts: string[] = [];
  if (position) parts.push(`map=${position.zoom.toFixed(2)}/${position.center[1].toFixed(5)}/${position.center[0].toFixed(5)}`);
  if (parcel) parts.push(`p=${parcel[1].toFixed(6)},${parcel[0].toFixed(6)}`);
  return parts.length ? `#${parts.join('&')}` : '';
}

export const readUrl = (): UrlState => parseHash(window.location.hash);

/** Keeps the address bar shareable without adding a history entry per pan. */
export function writeUrl(position: UrlState['position'], parcel: UrlState['parcel']): void {
  const hash = formatHash(position, parcel);
  if (hash !== window.location.hash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }
}
