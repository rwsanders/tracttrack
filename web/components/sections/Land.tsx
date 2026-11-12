import type { LandReport } from '../../../shared/types.ts';
import { acres, feet, percent } from '../../lib/format.ts';
import { Block, Field, Notes, ShareBar } from '../ui.tsx';

export function Land({ report }: { report: LandReport }) {
  const { elevation, soils, wetlands } = report;
  return (
    <>
      <Block title="Terrain">
        {elevation ? (
          <dl className="fields">
            <Field label="Elevation range">
              {feet(elevation.minFt)} to {feet(elevation.maxFt)}
            </Field>
            <Field label="Relief">
              {feet(elevation.maxFt - elevation.minFt)}
              <span className="hint"> across {elevation.samples} sample points</span>
            </Field>
          </dl>
        ) : (
          <p className="muted">Elevation is not available here right now.</p>
        )}
      </Block>

      <Block
        title="Soils"
        aside={report.primeFarmlandPercent === null ? undefined : `${percent(report.primeFarmlandPercent)} prime farmland`}
      >
        {soils.length === 0 ? (
          <p className="muted">No soil survey data returned for this tract.</p>
        ) : (
          <ul className="soils">
            {soils.map((s) => (
              <li key={`${s.symbol}-${s.name}`}>
                <div className="soils-head">
                  <span className="soils-name">{s.name}</span>
                  <span className="soils-share">
                    {percent(s.percent)} · {acres(s.acres)} ac
                  </span>
                </div>
                <ShareBar percent={s.percent} tone={s.farmland?.toLowerCase().startsWith('all areas are prime') ? 'good' : 'neutral'} />
                <p className="soils-meta">
                  {[
                    s.farmland,
                    s.drainage,
                    s.slopePercent !== null && `${s.slopePercent}% slope`,
                    s.capabilityClass && `Capability class ${s.capabilityClass}`,
                    s.hydrologicGroup && `Hydrologic group ${s.hydrologicGroup}`,
                    s.flooding && s.flooding !== 'None' && `Flooding: ${s.flooding.toLowerCase()}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Wetlands and water">
        {wetlands.length === 0 ? (
          <p className="muted">None mapped on this tract.</p>
        ) : (
          <ul className="plain">
            {wetlands.map((w) => (
              <li key={w.type}>
                <strong>{w.type}</strong> · {w.features} mapped feature{w.features === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Notes caveats={report.caveats} sources={report.sources} />
    </>
  );
}
