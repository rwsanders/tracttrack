import { useEffect, useId, useRef, useState } from 'react';
import type { GeocodeResult } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { CloseIcon, Logo, SearchIcon } from './icons.tsx';

interface Props {
  placeholder: string;
  onSelect(result: GeocodeResult): void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function SearchBar({ placeholder, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    // Wait for a pause in typing; the geocoder is a shared public service.
    const timer = setTimeout(() => {
      api
        .geocode(q, controller.signal)
        .then((found) => {
          setResults(found);
          setActive(0);
          setStatus('done');
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus('error');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const choose = (result: GeocodeResult) => {
    setQuery(result.label);
    setOpen(false);
    input.current?.blur();
    onSelect(result);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    }
  };

  const showList = open && query.trim().length >= 3;

  return (
    <div className="search" ref={root}>
      <div className="search-box">
        <Logo className="search-logo" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label="Search for a place, address or coordinates"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              input.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        ) : (
          <SearchIcon className="search-glyph" />
        )}
      </div>
      {showList && (
        <ul className="search-results" id={listId} role="listbox">
          {status === 'loading' && results.length === 0 && <li className="search-note">Searching…</li>}
          {status === 'error' && <li className="search-note">Search is unavailable right now. Try again shortly.</li>}
          {status === 'done' && results.length === 0 && (
            <li className="search-note">No matches. Try a city, a street address, or coordinates like 30.27, -97.74.</li>
          )}
          {results.map((r, i) => (
            <li key={`${r.label}-${r.lngLat.join(',')}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'search-result is-active' : 'search-result'}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(r)}
              >
                <span className="search-result-label">{r.label}</span>
                {r.detail && <span className="search-result-detail">{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
