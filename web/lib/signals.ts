import type { FloodReport, LandReport, MarketReport, MineralReport, TaxReport } from '../../shared/types.ts';
import { acreRange, money, percent, plural } from './format.ts';

export type Tone = 'good' | 'warn' | 'neutral';

export interface Signal {
  tone: Tone;
  title: string;
  detail?: string;
}

/** Null when there were too few similar parcels to say anything. */
export function marketSignal(r: MarketReport): Signal | null {
  if (!r.landPerAcre) return null;
  const where = `${plural(r.comparableCount, 'parcel')} of ${acreRange(r.band.minAcres, r.band.maxAcres)} within ${r.radiusMiles} mi.`;
  if (r.subjectAtProductivityValue) {
    return {
      tone: 'neutral',
      title: 'Land is carried at an agricultural value',
      detail: `Similar tracts nearby are appraised at ${money(r.landPerAcre.low)} to ${money(r.landPerAcre.high)} an acre.`,
    };
  }
  const diff = r.subjectVsMedianPercent;
  if (diff === null) return { tone: 'neutral', title: `Similar tracts appraise near ${money(r.landPerAcre.median)} an acre`, detail: where };
  if (Math.abs(diff) < 10) return { tone: 'neutral', title: 'Appraised in line with similar tracts nearby', detail: where };
  return {
    tone: 'neutral',
    title: `Appraised ${Math.round(Math.abs(diff))}% ${diff < 0 ? 'below' : 'above'} similar tracts nearby`,
    detail: where,
  };
}

/** One-line reading of each report, used for the at-a-glance list and section banners. */
export function taxSignal(r: TaxReport): Signal {
  if (r.totalEstimate === null) {
    return { tone: 'neutral', title: `Combined rate $${r.totalRate.toFixed(4)} per $100`, detail: 'No roll value to apply it to.' };
  }
  return {
    tone: 'neutral',
    title: `About ${money(r.totalEstimate)} a year in property tax`,
    detail: `${r.units.map((u) => u.name).join(', ')}, on appraised value before exemptions.`,
  };
}

export function mineralSignal(r: MineralReport): Signal {
  const active = r.wellsOnParcel.length;
  if (r.signal === 'on-parcel') {
    const parts = [active > 0 && plural(active, 'well') + ' on the tract', r.lateralsUnderParcel > 0 && plural(r.lateralsUnderParcel, 'horizontal well path') + ' beneath it']
      .filter(Boolean)
      .join(' and ');
    return { tone: 'warn', title: 'Oil and gas activity on this tract', detail: `${parts}. Expect existing leases and surface use.` };
  }
  if (r.signal === 'nearby') {
    const near = active > 0 ? `${plural(active, 'inactive well site')} on the tract` : `${plural(r.nearbyTotal, 'well')} within ${r.radiusMiles} mile`;
    return { tone: 'neutral', title: 'Oil and gas activity nearby', detail: `${near}. Minerals here may well be leased or severed.` };
  }
  return { tone: 'good', title: 'No recorded oil or gas wells nearby', detail: `Nothing within ${r.radiusMiles} mile in Railroad Commission records.` };
}

export function pipelineSignal(r: MineralReport): Signal | null {
  if (r.pipelines.length === 0) return null;
  return {
    tone: 'warn',
    title: `${plural(r.pipelines.length, 'pipeline')} cross${r.pipelines.length === 1 ? 'es' : ''} this tract`,
    detail: 'Easements limit where you can build.',
  };
}

export function floodSignal(r: FloodReport): Signal {
  if (!r.mapped) return { tone: 'neutral', title: 'No FEMA flood map here', detail: 'Flood risk is unstudied, not absent.' };
  const sfha = r.sfhaPercent ?? (r.zones.some((z) => z.sfha) ? null : 0);
  if (sfha === null) return { tone: 'warn', title: 'Partly in the 100-year floodplain' };
  if (sfha < 0.05) return { tone: 'good', title: 'Outside the 100-year floodplain' };
  return {
    tone: 'warn',
    title: `${percent(sfha)} of the tract is in the 100-year floodplain`,
    detail: 'Lenders require flood insurance for buildings there.',
  };
}

export function landSignals(r: LandReport): Signal[] {
  const out: Signal[] = [];
  if (r.primeFarmlandPercent !== null && r.primeFarmlandPercent >= 1) {
    out.push({ tone: 'good', title: `${percent(r.primeFarmlandPercent)} prime farmland soils` });
  }
  if (r.wetlands.length > 0) {
    out.push({
      tone: 'warn',
      title: 'Mapped wetlands or water features',
      detail: r.wetlands.map((w) => w.type).join(', '),
    });
  }
  return out;
}
