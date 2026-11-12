import { useCallback, useEffect, useRef, useState } from 'react';
import type { Parcel, ReportMap, ReportSection } from '../../shared/types.ts';
import { api } from './api.ts';

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string }
  | { status: 'unavailable' };

export type Reports = { [S in ReportSection]: Loadable<ReportMap[S]> };

const ALL: ReportSection[] = ['taxes', 'minerals', 'flood', 'land'];

function initial(available: ReportSection[]): Reports {
  const state = {} as Record<ReportSection, Loadable<unknown>>;
  for (const s of ALL) state[s] = available.includes(s) ? { status: 'loading' } : { status: 'unavailable' };
  return state as Reports;
}

/**
 * Loads every report section for the selected parcel in parallel. Each
 * section settles on its own, so a slow agency never holds up the others.
 */
export function useReports(parcel: Parcel | null, available: ReportSection[]) {
  const [reports, setReports] = useState<Reports>(() => initial(available));
  const controller = useRef<AbortController | null>(null);
  const availableKey = available.join(',');

  const load = useCallback(
    (target: Parcel, sections: ReportSection[]) => {
      const { signal } = (controller.current ??= new AbortController());
      for (const section of sections) {
        setReports((r) => ({ ...r, [section]: { status: 'loading' } }));
        api
          .report(section, target, signal)
          .then((data) => {
            if (!signal.aborted) setReports((r) => ({ ...r, [section]: { status: 'ready', data } }));
          })
          .catch((err: unknown) => {
            if (signal.aborted) return;
            const message = err instanceof Error ? err.message : 'Could not load this section.';
            setReports((r) => ({ ...r, [section]: { status: 'error', message } }));
          });
      }
    },
    [],
  );

  useEffect(() => {
    const sections = availableKey ? (availableKey.split(',') as ReportSection[]) : [];
    setReports(initial(sections));
    if (!parcel) return;
    controller.current = new AbortController();
    load(parcel, sections);
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
    // The parcel id identifies the selection; the object itself is recreated on every lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id, availableKey, load]);

  const retry = useCallback(
    (section: ReportSection) => {
      if (parcel) load(parcel, [section]);
    },
    [parcel, load],
  );

  return { reports, retry };
}
