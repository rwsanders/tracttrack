import type { Parcel, ReportSection } from '../../../shared/types.ts';
import { acres, DASH, longDate, money } from '../../lib/format.ts';
import { floodSignal, landSignals, mineralSignal, pipelineSignal, taxSignal, type Signal } from '../../lib/signals.ts';
import type { Reports } from '../../lib/useReports.ts';
import { Block, Field } from '../ui.tsx';

export type Tab = 'overview' | ReportSection | 'costs';

interface Row extends Signal {
  tab: Tab;
}

function glance(reports: Reports): { rows: Row[]; pending: number } {
  const rows: Row[] = [];
  let pending = 0;
  const { taxes, minerals, flood, land } = reports;
  if (taxes.status === 'loading') pending++;
  if (taxes.status === 'ready') rows.push({ ...taxSignal(taxes.data), tab: 'taxes' });
  if (minerals.status === 'loading') pending++;
  if (minerals.status === 'ready') {
    rows.push({ ...mineralSignal(minerals.data), tab: 'minerals' });
    const pipes = pipelineSignal(minerals.data);
    if (pipes) rows.push({ ...pipes, tab: 'minerals' });
  }
  if (flood.status === 'loading') pending++;
  if (flood.status === 'ready') rows.push({ ...floodSignal(flood.data), tab: 'flood' });
  if (land.status === 'loading') pending++;
  if (land.status === 'ready') rows.push(...landSignals(land.data).map((s) => ({ ...s, tab: 'land' as const })));
  return { rows, pending };
}

export function Overview({ parcel, reports, onTab }: { parcel: Parcel; reports: Reports; onTab(tab: Tab): void }) {
  const { rows, pending } = glance(reports);
  const acreage = parcel.legalAcres ?? parcel.mappedAcres;
  const acresDiffer =
    parcel.legalAcres !== null &&
    parcel.mappedAcres !== null &&
    Math.abs(parcel.legalAcres - parcel.mappedAcres) / parcel.legalAcres > 0.05;
  const collected = longDate(parcel.sourceDate);

  return (
    <>
      <Block title="At a glance">
        <ul className="glance">
          {rows.map((row) => (
            <li key={row.title}>
              <button type="button" onClick={() => onTab(row.tab)}>
                <span className={`dot dot-${row.tone}`} />
                <span>
                  <span className="glance-title">{row.title}</span>
                  {row.detail && <span className="glance-detail">{row.detail}</span>}
                </span>
              </button>
            </li>
          ))}
          {pending > 0 && (
            <li className="glance-pending" role="status">
              Checking {pending} more source{pending === 1 ? '' : 's'}…
            </li>
          )}
          {pending === 0 && rows.length === 0 && <li className="glance-pending">No report data could be loaded.</li>}
        </ul>
      </Block>

      <Block title="Owner">
        <dl className="fields">
          <Field label="Name on roll">{parcel.owner ?? 'Not listed'}</Field>
          {parcel.careOf && <Field label="In care of">{parcel.careOf}</Field>}
          <Field label="Mailing address">{parcel.mailingAddress ?? 'Not listed'}</Field>
        </dl>
      </Block>

      <Block title="Appraisal" aside={parcel.taxYear ? `Tax year ${parcel.taxYear}` : undefined}>
        <dl className="fields">
          <Field label="Land">{money(parcel.landValue)}</Field>
          <Field label="Improvements">{money(parcel.improvementValue)}</Field>
          <Field label="Market value">{money(parcel.marketValue)}</Field>
          <Field label="Per acre">
            {parcel.marketValue && acreage ? money(parcel.marketValue / acreage) : DASH}
          </Field>
        </dl>
      </Block>

      <Block title="Parcel">
        <dl className="fields">
          <Field label="Site address">{parcel.situsAddress ?? 'None on roll'}</Field>
          <Field label="Legal description">{parcel.legalDescription ?? 'Not listed'}</Field>
          <Field label="Acres on roll">{parcel.legalAcres === null ? 'Not listed' : acres(parcel.legalAcres)}</Field>
          <Field label="Acres as mapped">
            {acres(parcel.mappedAcres)}
            {acresDiffer && <span className="hint"> Differs from the roll; a survey settles it.</span>}
          </Field>
          {parcel.landUse && <Field label="Land use">{parcel.landUse}</Field>}
          {parcel.yearBuilt && <Field label="Year built">{parcel.yearBuilt}</Field>}
          <Field label="Property ID">{parcel.propId ?? DASH}</Field>
          {parcel.geoId && <Field label="Geographic ID">{parcel.geoId}</Field>}
        </dl>
        <p className="sources">
          Record from {parcel.source ? titleCase(parcel.source) : 'the county appraisal district'}
          {collected ? `, collected ${collected}` : ''}, via the{' '}
          <a href="https://geographic.texas.gov/" target="_blank" rel="noreferrer">
            Texas Geographic Information Office
          </a>
          . Boundaries are for tax purposes and are not a survey.
        </p>
      </Block>
    </>
  );
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
