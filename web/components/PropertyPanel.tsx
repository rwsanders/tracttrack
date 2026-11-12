import { useEffect, useRef, useState } from 'react';
import type { Parcel, ReportSection } from '../../shared/types.ts';
import { acres, DASH, moneyCompact } from '../lib/format.ts';
import type { Reports } from '../lib/useReports.ts';
import { BookmarkIcon, CheckIcon, CloseIcon, LinkIcon } from './icons.tsx';
import { Costs } from './sections/Costs.tsx';
import { Flood } from './sections/Flood.tsx';
import { Land } from './sections/Land.tsx';
import { Minerals } from './sections/Minerals.tsx';
import { Overview, type Tab } from './sections/Overview.tsx';
import { Taxes } from './sections/Taxes.tsx';
import { Loaded } from './ui.tsx';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'minerals', label: 'Minerals' },
  { id: 'flood', label: 'Flood' },
  { id: 'land', label: 'Land' },
  { id: 'costs', label: 'Costs' },
];

interface Props {
  parcels: Parcel[];
  index: number;
  onIndex(i: number): void;
  reports: Reports;
  onRetry(section: ReportSection): void;
  saved: boolean;
  onToggleSaved(): void;
  onClose(): void;
}

export function PropertyPanel({ parcels, index, onIndex, reports, onRetry, saved, onToggleSaved, onClose }: Props) {
  const parcel = parcels[index];
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  // A new parcel starts back at the overview; a new tab starts at its top.
  useEffect(() => setTab('overview'), [parcel.id]);
  useEffect(() => {
    // Braces matter: scrollTo returns a promise in newer browsers, which React would treat as a cleanup.
    body.current?.scrollTo({ top: 0 });
  }, [tab, parcel.id]);

  const acreage = parcel.legalAcres ?? parcel.mappedAcres;
  const tax = reports.taxes.status === 'ready' ? reports.taxes.data.totalEstimate : null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused; the address bar still holds the link.
    }
  };

  return (
    <aside className="panel" aria-label="Property report">
      <header className="panel-head">
        <div className="panel-title">
          <p className="eyebrow">{[parcel.county && `${titleCase(parcel.county)} County`, parcel.state].filter(Boolean).join(', ')}</p>
          <h2>{parcel.owner ?? 'Owner not listed'}</h2>
          <p className="panel-address">{parcel.situsAddress ?? parcel.legalDescription ?? 'No site address on the roll'}</p>
        </div>
        <div className="panel-actions">
          <button type="button" className="icon-button" aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save this tract'} title={saved ? 'Saved' : 'Save'} onClick={onToggleSaved}>
            <BookmarkIcon filled={saved} />
          </button>
          <button type="button" className="icon-button" aria-label="Copy link to this tract" title={copied ? 'Link copied' : 'Copy link'} onClick={copyLink}>
            {copied ? <CheckIcon /> : <LinkIcon />}
          </button>
          <button type="button" className="icon-button" aria-label="Close report" title="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </header>

      {parcels.length > 1 && (
        <div className="accounts">
          <label htmlFor="account">{parcels.length} tax accounts overlap here</label>
          <select id="account" value={index} onChange={(e) => onIndex(Number(e.target.value))}>
            {parcels.map((p, i) => (
              <option key={p.id} value={i}>
                {p.owner ?? 'Owner not listed'} ({acres(p.legalAcres ?? p.mappedAcres)} ac)
              </option>
            ))}
          </select>
        </div>
      )}

      <dl className="stats">
        <div>
          <dt>Acres</dt>
          <dd>{acres(acreage)}</dd>
        </div>
        <div>
          <dt>Market value</dt>
          <dd>{parcel.marketValue ? moneyCompact(parcel.marketValue) : DASH}</dd>
        </div>
        <div>
          <dt>Per acre</dt>
          <dd>{parcel.marketValue && acreage ? moneyCompact(parcel.marketValue / acreage) : DASH}</dd>
        </div>
        <div>
          <dt>Est. tax / yr</dt>
          <dd>{reports.taxes.status === 'loading' ? <span className="stat-loading" /> : moneyCompact(tax)}</dd>
        </div>
      </dl>

      <nav className="tabs" role="tablist" aria-label="Report sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="panel-body" ref={body} role="tabpanel">
        {tab === 'overview' && <Overview parcel={parcel} reports={reports} onTab={setTab} />}
        {tab === 'taxes' && (
          <Loaded state={reports.taxes} onRetry={() => onRetry('taxes')}>
            {(r) => <Taxes report={r} />}
          </Loaded>
        )}
        {tab === 'minerals' && (
          <Loaded state={reports.minerals} onRetry={() => onRetry('minerals')}>
            {(r) => <Minerals report={r} />}
          </Loaded>
        )}
        {tab === 'flood' && (
          <Loaded state={reports.flood} onRetry={() => onRetry('flood')}>
            {(r) => <Flood report={r} />}
          </Loaded>
        )}
        {tab === 'land' && (
          <Loaded state={reports.land} onRetry={() => onRetry('land')}>
            {(r) => <Land report={r} />}
          </Loaded>
        )}
        {/* Stays mounted so assumptions survive tab switches; keyed so they reset with the tract. */}
        <div hidden={tab !== 'costs'}>
          <Costs key={parcel.id} parcel={parcel} taxes={reports.taxes} />
        </div>
      </div>
    </aside>
  );
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
