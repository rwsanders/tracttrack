import { describe, expect, it } from 'vitest';
import type { Parcel } from '../shared/types.ts';
import { buildTaxReport, countyNumber, findCity, loadRates, type TaxRates } from '../server/states/tx/taxes.ts';

const rates: TaxRates = {
  taxYear: 2025,
  counties: { '086': { name: 'Gillespie', rate: 0.25 } },
  schools: { '086-901': { name: 'Fredericksburg ISD', rate: 0.75, counties: ['086'] } },
  cities: {
    '086-101-03': { name: 'Fredericksburg', rate: 0.2, counties: ['086'] },
    '001-101-03': { name: 'Reno', rate: 0.3, counties: ['001'] },
    '002-101-03': { name: 'Reno', rate: 0.5, counties: ['002'] },
  },
  special: {
    '086-201-06': { name: 'Hill Country UWCD', rate: 0.005, counties: ['086'] },
    '086-202-06': { name: 'Dormant District', rate: 0, counties: ['086'] },
    '001-201-06': { name: 'Elsewhere WCID', rate: 0.1, counties: ['001'] },
  },
};

const parcel = (over: Partial<Parcel> = {}) =>
  ({ fips: '48171', marketValue: 400_000, centroid: [-98.87, 30.3], ...over }) as Parcel;

describe('countyNumber', () => {
  it('maps odd FIPS codes onto the Comptroller numbering', () => {
    expect(countyNumber('48001')).toBe('001');
    expect(countyNumber('48171')).toBe('086');
    expect(countyNumber('48507')).toBe('254');
  });

  it('rejects codes outside Texas or malformed', () => {
    expect(countyNumber('48002')).toBeNull();
    expect(countyNumber('06037')).toBeNull();
    expect(countyNumber(null)).toBeNull();
  });
});

describe('findCity', () => {
  it('matches regardless of case and "City of" prefixes', () => {
    expect(findCity(rates, 'City of FREDERICKSBURG', '086')?.rate).toBe(0.2);
  });

  it('uses the county to pick between same-named cities', () => {
    expect(findCity(rates, 'Reno', '002')?.rate).toBe(0.5);
  });

  it('refuses to guess between same-named cities in other counties', () => {
    expect(findCity(rates, 'Reno', '086')).toBeNull();
  });
});

describe('buildTaxReport', () => {
  it('adds county and school rates outside city limits', () => {
    const r = buildTaxReport(rates, parcel(), { schoolDistrict: { id: '086-901', name: 'Fredericksburg ISD' }, city: null });
    expect(r.units.map((u) => u.kind)).toEqual(['county', 'school']);
    expect(r.totalRate).toBe(1);
    expect(r.totalEstimate).toBe(4000);
  });

  it('adds the city rate inside city limits', () => {
    const r = buildTaxReport(rates, parcel(), { schoolDistrict: { id: '086-901', name: 'x' }, city: 'Fredericksburg' });
    expect(r.totalRate).toBe(1.2);
    expect(r.totalEstimate).toBeCloseTo(4800, 6);
  });

  it('lists only this county\'s special districts that actually levy', () => {
    const r = buildTaxReport(rates, parcel(), { schoolDistrict: null, city: null });
    expect(r.possibleUnits).toEqual([{ name: 'Hill Country UWCD', rate: 0.005 }]);
  });

  it('says so when a piece is missing rather than silently understating', () => {
    const r = buildTaxReport(rates, parcel(), { schoolDistrict: null, city: 'Atlantis' });
    expect(r.units.map((u) => u.kind)).toEqual(['county']);
    expect(r.caveats.some((c) => c.includes('school district'))).toBe(true);
    expect(r.caveats.some((c) => c.includes('Atlantis'))).toBe(true);
  });

  it('reports rates without a dollar figure when the roll has no value', () => {
    const r = buildTaxReport(rates, parcel({ marketValue: 0 }), { schoolDistrict: { id: '086-901', name: 'x' }, city: null });
    expect(r.basisValue).toBeNull();
    expect(r.totalEstimate).toBeNull();
    expect(r.totalRate).toBe(1);
    expect(r.units.every((u) => u.estimate === null)).toBe(true);
  });
});

describe('published rate data', () => {
  const data = loadRates();

  it('covers every Texas county', () => {
    expect(Object.keys(data.counties)).toHaveLength(254);
  });

  it('holds plausible rates', () => {
    for (const c of Object.values(data.counties)) {
      expect(c.rate).toBeGreaterThanOrEqual(0);
      expect(c.rate).toBeLessThan(2);
    }
    expect(Object.keys(data.schools).length).toBeGreaterThan(900);
    expect(data.schools['086-901']?.name).toMatch(/Fredericksburg/);
  });
});
