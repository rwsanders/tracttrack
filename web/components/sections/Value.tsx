import { useEffect, useId, useState, type FormEvent } from 'react';
import type { MarketReport, Parcel } from '../../../shared/types.ts';
import { loadComps, saveComps, summarizeComps, type Comp } from '../../lib/comps.ts';
import { acreRange, acres, DASH, money, plural } from '../../lib/format.ts';
import { marketSignal } from '../../lib/signals.ts';
import type { Loadable } from '../../lib/useReports.ts';
import { CloseIcon } from '../icons.tsx';
import { Block, Callout, Field, Loaded, Notes } from '../ui.tsx';

interface Props {
  parcel: Parcel;
  market: Loadable<MarketReport>;
  onRetry(): void;
  /** Sends a figure to the cost estimator as the purchase price. */
  onUsePrice(price: number): void;
}

/** Where the subject sits against its neighbors' middle half, on a shared per-acre scale. */
function RangeBar({ low, median, high, subject }: { low: number; median: number; high: number; subject: number | null }) {
  const min = Math.min(low, subject ?? low) * 0.9;
  const max = Math.max(high, subject ?? high) * 1.1;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="range" aria-hidden>
      <div className="range-track">
        <span className="range-band" style={{ left: at(low), right: `calc(100% - ${at(high)})` }} />
        <span className="range-median" style={{ left: at(median) }} />
        {subject !== null && <span className="range-subject" style={{ left: at(subject) }} />}
      </div>
      <div className="range-legend">
        <span>
          <i className="key key-band" /> Middle half of similar tracts
        </span>
        <span>
          <i className="key key-median" /> Median
        </span>
        {subject !== null && (
          <span>
            <i className="key key-subject" /> This tract
          </span>
        )}
      </div>
    </div>
  );
}

function Neighbors({ parcel, report, onUsePrice }: { parcel: Parcel; report: MarketReport; onUsePrice(price: number): void }) {
  const signal = marketSignal(report);
  const band = acreRange(report.band.minAcres, report.band.maxAcres);
  const { landPerAcre, impliedValue } = report;

  return (
    <>
      <Block title="Similar tracts nearby" aside={`Within ${report.radiusMiles} mi`}>
        {landPerAcre && signal ? (
          <>
            <Callout tone={signal.tone} title={signal.title}>
              {report.subjectAtProductivityValue
                ? `Its ${money(report.subjectLandPerAcre)} an acre reflects what the land produces, not what it would sell for.`
                : `Compared with ${plural(report.comparableCount, 'parcel')} of ${band}.`}
            </Callout>
            <RangeBar
              low={landPerAcre.low}
              median={landPerAcre.median}
              high={landPerAcre.high}
              subject={report.subjectAtProductivityValue ? null : report.subjectLandPerAcre}
            />
            <dl className="ledger">
              <div>
                <dt>This tract, land per acre</dt>
                <dd>{money(report.subjectLandPerAcre)}</dd>
              </div>
              <div>
                <dt>Neighbors, median per acre</dt>
                <dd>{money(landPerAcre.median)}</dd>
              </div>
              <div>
                <dt>Neighbors, middle half</dt>
                <dd>
                  {money(landPerAcre.low)} to {money(landPerAcre.high)}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="muted">
            {report.comparableCount === 0 ? 'No' : `Only ${report.comparableCount}`} similar-sized{' '}
            {report.comparableCount === 1 ? 'parcel' : 'parcels'} with a usable value within {report.radiusMiles} miles, which is too few to
            compare.
          </p>
        )}
      </Block>

      {impliedValue && (
        <Block title="If valued like its neighbors">
          <div className="headline">
            <span className="headline-value">
              {money(impliedValue.low)} to {money(impliedValue.high)}
            </span>
            <span className="headline-note">
              {acres(parcel.mappedAcres ?? parcel.legalAcres)} acres at neighbors' per-acre values
              {parcel.improvementValue ? `, plus ${money(parcel.improvementValue)} of appraised improvements` : ''}. Typical:{' '}
              {money(impliedValue.mid)}.
            </span>
          </div>
          <button type="button" className="button button-quiet" onClick={() => onUsePrice(Math.round(impliedValue.mid))}>
            Use {money(impliedValue.mid)} in cost estimator
          </button>
        </Block>
      )}
    </>
  );
}

function CompForm({ onAdd }: { onAdd(comp: Omit<Comp, 'id'>): void }) {
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');
  const ids = { label: useId(), price: useId(), size: useId() };
  const priceValue = Number(price);
  const sizeValue = Number(size);
  const ready = priceValue > 0 && sizeValue > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onAdd({ label: label.trim(), price: priceValue, acres: sizeValue });
    setLabel('');
    setPrice('');
    setSize('');
  };

  return (
    <form className="comp-form" onSubmit={submit}>
      <div className="input comp-form-wide">
        <label htmlFor={ids.label}>Description</label>
        <div className="input-box">
          <input id={ids.label} type="text" value={label} maxLength={80} placeholder="e.g. 60 ac on Ranch Road 965" onChange={(e) => setLabel(e.target.value)} />
        </div>
      </div>
      <div className="input">
        <label htmlFor={ids.price}>Price</label>
        <div className="input-box">
          <span>$</span>
          <input id={ids.price} type="number" inputMode="decimal" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <div className="input">
        <label htmlFor={ids.size}>Acres</label>
        <div className="input-box">
          <input id={ids.size} type="number" inputMode="decimal" min={0} step="any" value={size} onChange={(e) => setSize(e.target.value)} />
          <span>ac</span>
        </div>
      </div>
      <button type="submit" className="button comp-form-wide" disabled={!ready}>
        Add comparable
      </button>
    </form>
  );
}

function YourComps({ parcel, onUsePrice }: { parcel: Parcel; onUsePrice(price: number): void }) {
  const area = parcel.fips ?? parcel.id;
  const [comps, setComps] = useState<Comp[]>(() => loadComps(area));
  useEffect(() => setComps(loadComps(area)), [area]);

  const update = (next: Comp[]) => {
    setComps(next);
    saveComps(area, next);
  };
  const subjectAcres = parcel.legalAcres ?? parcel.mappedAcres;
  const summary = summarizeComps(comps, subjectAcres);
  const county = parcel.county ? `${parcel.county.charAt(0)}${parcel.county.slice(1).toLowerCase()} County` : 'this area';

  return (
    <Block title="Your comparables" aside={comps.length ? `${comps.length} in ${county}` : undefined}>
      <p className="lead muted">
        Seen a listing or sale nearby? Add its price and acreage to price this tract at what the market is asking. Saved on this device for {county}.
      </p>

      {comps.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Comparable</th>
              <th scope="col" className="num">
                Per acre
              </th>
              <th scope="col">
                <span className="visually-hidden">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.label || 'Unnamed'}
                  <span className="sub">
                    {money(c.price)} · {acres(c.acres)} ac
                  </span>
                </td>
                <td className="num">{money(c.price / c.acres)}</td>
                <td className="comp-remove">
                  <button type="button" className="icon-button" aria-label={`Remove ${c.label || 'comparable'}`} onClick={() => update(comps.filter((x) => x.id !== c.id))}>
                    <CloseIcon width={15} height={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {summary && (
        <div className="comp-result">
          <div className="headline">
            <span className="headline-value">{summary.value ? money(summary.value.mid) : DASH}</span>
            <span className="headline-note">
              {summary.value
                ? `${acres(subjectAcres)} acres at ${money(summary.perAcre.median)} an acre${
                    comps.length > 1 ? `, the median of your comps (range ${money(summary.value.low)} to ${money(summary.value.high)})` : ''
                  }. Land only; add for buildings.`
                : `Your comps run ${money(summary.perAcre.low)} to ${money(summary.perAcre.high)} an acre.`}
            </span>
          </div>
          {summary.value && (
            <button type="button" className="button button-quiet" onClick={() => onUsePrice(Math.round(summary.value!.mid))}>
              Use {money(summary.value.mid)} in cost estimator
            </button>
          )}
        </div>
      )}

      <CompForm onAdd={(comp) => update([...comps, { ...comp, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }])} />

      <p className="sources">
        For regional sale-price trends, see the{' '}
        <a href="https://trerc.tamu.edu/data/rural-land/" target="_blank" rel="noreferrer">
          Texas Real Estate Research Center rural land data
        </a>
        .
      </p>
    </Block>
  );
}

export function Value({ parcel, market, onRetry, onUsePrice }: Props) {
  const acreage = parcel.legalAcres ?? parcel.mappedAcres;
  return (
    <>
      <Block title="Appraised value" aside={parcel.taxYear ? `Tax year ${parcel.taxYear}` : undefined}>
        <div className="headline">
          <span className="headline-value">{parcel.marketValue ? money(parcel.marketValue) : 'Not on the roll'}</span>
          <span className="headline-note">
            The appraisal district's estimate for taxes, not a sale price. Texas does not make sale prices public.
          </span>
        </div>
        <dl className="fields">
          <Field label="Land">{money(parcel.landValue)}</Field>
          <Field label="Improvements">{money(parcel.improvementValue)}</Field>
          <Field label="Total per acre">{parcel.marketValue && acreage ? money(parcel.marketValue / acreage) : DASH}</Field>
        </dl>
      </Block>

      <Loaded state={market} onRetry={onRetry}>
        {(report) => (
          <>
            <Neighbors parcel={parcel} report={report} onUsePrice={onUsePrice} />
            <YourComps parcel={parcel} onUsePrice={onUsePrice} />
            <Notes caveats={report.caveats} sources={report.sources} />
          </>
        )}
      </Loaded>
      {market.status !== 'ready' && market.status !== 'loading' && <YourComps parcel={parcel} onUsePrice={onUsePrice} />}
    </>
  );
}
