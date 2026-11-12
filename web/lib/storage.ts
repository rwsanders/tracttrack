import type { Parcel } from '../../shared/types.ts';

/** Just enough of a parcel to list it and find it again on the map. */
export interface SavedTract {
  id: string;
  owner: string | null;
  county: string | null;
  acres: number | null;
  marketValue: number | null;
  lngLat: [number, number];
  savedAt: string;
}

const KEY = 'tracttrack.saved.v1';

export function loadSaved(): SavedTract[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as SavedTract[]).filter((t) => t && typeof t.id === 'string') : [];
  } catch {
    return [];
  }
}

export function persistSaved(list: SavedTract[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private browsing or a full quota: the list simply lasts for this visit.
  }
}

export function toSaved(parcel: Parcel): SavedTract {
  return {
    id: parcel.id,
    owner: parcel.owner,
    county: parcel.county,
    acres: parcel.legalAcres ?? parcel.mappedAcres,
    marketValue: parcel.marketValue,
    lngLat: parcel.centroid,
    savedAt: new Date().toISOString(),
  };
}
