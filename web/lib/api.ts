import type { GeocodeResult, Parcel, ParcelLookup, ReportMap, ReportSection, StateConfig } from '../../shared/types.ts';

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || body === null) {
    throw new ApiError(body?.error ?? 'The server returned an unexpected response.');
  }
  return body;
}

export const api = {
  states: () => request<{ states: StateConfig[] }>('/api/states').then((r) => r.states),

  parcelsAt: ([lng, lat]: [number, number], signal?: AbortSignal) =>
    request<ParcelLookup>(`/api/parcels/at?lat=${lat}&lng=${lng}`, { signal }).then((r) => r.parcels),

  report: <S extends ReportSection>(section: S, parcel: Parcel, signal?: AbortSignal) =>
    request<ReportMap[S]>(`/api/report/${section}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parcel),
      signal,
    }),

  geocode: (q: string, signal?: AbortSignal) =>
    request<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(q)}`, { signal }).then((r) => r.results),
};
