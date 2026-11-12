import type { ReactNode } from 'react';
import type { SourceRef } from '../../shared/types.ts';
import type { Loadable } from '../lib/useReports.ts';
import { AlertIcon } from './icons.tsx';

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${[92, 78, 85, 60, 70][i % 5]}%` }} />
      ))}
    </div>
  );
}

/** Renders a report section once it has data, and its loading or failure state until then. */
export function Loaded<T>({
  state,
  onRetry,
  children,
}: {
  state: Loadable<T>;
  onRetry(): void;
  children(data: T): ReactNode;
}) {
  if (state.status === 'loading') return <Skeleton lines={5} />;
  if (state.status === 'unavailable') return <p className="muted">Not available for this state yet.</p>;
  if (state.status === 'error') {
    return (
      <div className="error-box" role="alert">
        <AlertIcon />
        <div>
          <p>{state.message}</p>
          <button type="button" className="link-button" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

export function Block({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="block">
      <header className="block-head">
        <h3>{title}</h3>
        {aside && <span className="block-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Notes({ caveats, sources }: { caveats: string[]; sources: SourceRef[] }) {
  return (
    <footer className="notes">
      {caveats.length > 0 && (
        <ul className="caveats">
          {caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <p className="sources">
        Source{sources.length === 1 ? '' : 's'}:{' '}
        {sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ', '}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.name}
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}

/** A labelled horizontal share bar; `tone` picks the fill color. */
export function ShareBar({ percent, tone = 'neutral' }: { percent: number; tone?: 'neutral' | 'warn' | 'good' }) {
  return (
    <span className={`bar bar-${tone}`} aria-hidden>
      <span style={{ width: `${Math.max(1.5, Math.min(100, percent))}%` }} />
    </span>
  );
}

export function Callout({ tone, title, children }: { tone: 'good' | 'warn' | 'neutral'; title: string; children?: ReactNode }) {
  return (
    <div className={`callout callout-${tone}`}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
