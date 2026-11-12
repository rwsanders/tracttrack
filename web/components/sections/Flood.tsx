import type { FloodReport, FloodZone } from '../../../shared/types.ts';
import { acres, percent } from '../../lib/format.ts';
import { floodSignal } from '../../lib/signals.ts';
import { Block, Callout, Notes, ShareBar } from '../ui.tsx';

/** Plain-language reading of FEMA's zone codes. */
function describe(z: FloodZone): string {
  const sub = z.subtype?.toLowerCase() ?? '';
  if (sub.includes('floodway')) return 'Floodway: the channel that must stay clear. Building is heavily restricted.';
  if (z.zone === 'X' && sub.includes('0.2 pct')) return '500-year floodplain: moderate risk.';
  if (z.zone === 'X' && sub.includes('levee')) return 'Protected by a levee: reduced risk that depends on the levee.';
  if (z.zone === 'X') return 'Minimal flood hazard.';
  if (z.zone === 'D') return 'Undetermined: possible but unstudied flood hazard.';
  if (/^(V|VE)$/.test(z.zone)) return 'Coastal high hazard area with wave action.';
  if (z.zone === 'AE') return '100-year floodplain with flood elevations established.';
  if (z.zone === 'AO' || z.zone === 'AH') return '100-year floodplain with shallow flooding or ponding.';
  if (z.zone.startsWith('A')) return '100-year floodplain; no flood elevations determined.';
  if (/open water/i.test(z.zone)) return 'Open water.';
  return z.subtype ?? 'See the FEMA map for details.';
}

export function Flood({ report }: { report: FloodReport }) {
  const signal = floodSignal(report);
  return (
    <>
      <Callout tone={signal.tone} title={signal.title}>
        {signal.detail}
      </Callout>

      {report.mapped && (
        <Block title="FEMA flood zones on this tract">
          <ul className="zones">
            {report.zones.map((z) => (
              <li key={`${z.zone}-${z.subtype}`}>
                <div className="zones-head">
                  <span className={z.sfha ? 'tag tag-warn' : 'tag'}>Zone {z.zone}</span>
                  <span className="zones-share">
                    {z.percent === null ? 'Present' : `${percent(z.percent)} · ${acres(z.acres)} ac`}
                  </span>
                </div>
                {z.percent !== null && <ShareBar percent={z.percent} tone={z.sfha ? 'warn' : 'neutral'} />}
                <p className="zones-desc">{describe(z)}</p>
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Notes caveats={report.caveats} sources={report.sources} />
    </>
  );
}
