import type { MineralReport } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { mineralSignal } from '../../lib/signals.ts';
import { Block, Callout, Notes, ShareBar } from '../ui.tsx';

export function Minerals({ report }: { report: MineralReport }) {
  const signal = mineralSignal(report);
  const max = Math.max(1, ...report.nearbyCounts.map((c) => c.count));

  return (
    <>
      <Callout tone={signal.tone} title={signal.title}>
        {signal.detail}
      </Callout>

      <Block title="On this tract">
        {report.wellsOnParcel.length === 0 && report.lateralsUnderParcel === 0 ? (
          <p className="muted">No well sites or horizontal well paths recorded.</p>
        ) : (
          <>
            {report.lateralsUnderParcel > 0 && (
              <p className="lead">{plural(report.lateralsUnderParcel, 'horizontal or directional well path')} run beneath the surface.</p>
            )}
            {report.wellsOnParcel.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">API number</th>
                    <th scope="col">Well</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.wellsOnParcel.map((w) => (
                    <tr key={`${w.api}-${w.wellNumber}`}>
                      <td className="mono">{w.api}</td>
                      <td>{w.wellNumber ?? ''}</td>
                      <td>{w.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Block>

      <Block title={`Within ${report.radiusMiles} mile`} aside={`${report.truncated ? 'At least ' : ''}${plural(report.nearbyTotal, 'well')}`}>
        {report.nearbyCounts.length === 0 ? (
          <p className="muted">No wells recorded.</p>
        ) : (
          <ul className="bars">
            {report.nearbyCounts.map((c) => (
              <li key={c.type}>
                <span className="bars-label">{c.type}</span>
                <ShareBar percent={(c.count / max) * 100} />
                <span className="bars-value">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Pipelines crossing">
        {report.pipelines.length === 0 ? (
          <p className="muted">None recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Operator</th>
                <th scope="col">Carries</th>
                <th scope="col" className="num">
                  Size
                </th>
              </tr>
            </thead>
            <tbody>
              {report.pipelines.map((p, i) => (
                <tr key={i}>
                  <td>
                    {p.operator ?? 'Unknown operator'}
                    {p.system && <span className="sub">{p.system}</span>}
                  </td>
                  <td>
                    {p.commodity ?? 'Not stated'}
                    {p.status && <span className="sub">{p.status}</span>}
                  </td>
                  <td className="num">{p.diameterInches === null ? '' : `${p.diameterInches}"`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Block>

      <Block title="Original land survey" aside="For title research">
        {report.surveys.length === 0 ? (
          <p className="muted">Not found.</p>
        ) : (
          <ul className="plain">
            {report.surveys.map((s, i) => (
              <li key={i}>
                <strong>{s.abstract ?? 'No abstract number'}</strong>
                {[s.name, s.block && `Block ${s.block}`, s.section && `Survey ${s.section}`].filter(Boolean).map((part) => (
                  <span key={String(part)}> · {part}</span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Notes caveats={report.caveats} sources={report.sources} />
    </>
  );
}
