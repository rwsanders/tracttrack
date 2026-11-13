import type { TaxReport } from '../../../shared/types.ts';
import { money, rate } from '../../lib/format.ts';
import { Block, Notes } from '../ui.tsx';

const KIND: Record<TaxReport['units'][number]['kind'], string> = {
  county: 'County',
  school: 'School district',
  city: 'City',
  special: 'Special district',
};

export function Taxes({ report }: { report: TaxReport }) {
  return (
    <>
      <Block title="Estimated annual tax" aside={`${report.taxYear} rates`}>
        <div className="headline">
          <span className="headline-value">{money(report.totalEstimate)}</span>
          <span className="headline-note">
            {report.basisValue === null
              ? 'No appraised value on the roll'
              : `${rate(report.totalRate)} per $100 on ${money(report.basisValue)} appraised value`}
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Taxing unit</th>
              <th scope="col" className="num">
                Rate / $100
              </th>
              <th scope="col" className="num">
                Estimate
              </th>
            </tr>
          </thead>
          <tbody>
            {report.units.map((u) => (
              <tr key={u.name}>
                <td>
                  {u.name}
                  <span className="sub">{KIND[u.kind]}</span>
                </td>
                <td className="num">{rate(u.rate)}</td>
                <td className="num">{money(u.estimate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{rate(report.totalRate)}</td>
              <td className="num">{money(report.totalEstimate)}</td>
            </tr>
          </tfoot>
        </table>
      </Block>

      {report.possibleUnits.length > 0 && (
        <Block title="Special districts" aside="Not in the estimate">
          <details className="disclosure">
            <summary>
              {report.possibleUnits.length} in this county that may also tax this parcel
            </summary>
            <table className="table table-compact">
              <tbody>
                {report.possibleUnits.map((u) => (
                  <tr key={u.name}>
                    <td>{u.name}</td>
                    <td className="num">{rate(u.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Block>
      )}

      <Notes caveats={report.caveats} sources={report.sources} />
    </>
  );
}
