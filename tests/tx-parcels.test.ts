import { describe, expect, it } from 'vitest';
import { legalAcres, normalizeParcel, number, sourceDate, text, tidyAddress } from '../server/states/tx/parcels.ts';

const rings = [
  [
    [-98.0, 30.0],
    [-98.0, 30.002],
    [-97.998, 30.002],
    [-97.998, 30.0],
    [-98.0, 30.0],
  ],
];

describe('field cleanup', () => {
  it('treats the literal "Null" and blanks as missing', () => {
    expect(text('Null')).toBeNull();
    expect(text('  ')).toBeNull();
    expect(text(undefined)).toBeNull();
    expect(text(' SMITH,  JOHN ')).toBe('SMITH, JOHN');
  });

  it('parses numbers and rejects junk', () => {
    expect(number('427250')).toBe(427250);
    expect(number('$1,250.50')).toBe(1250.5);
    expect(number('Null')).toBeNull();
    expect(number('abc')).toBeNull();
  });

  it('reads spreadsheet serial dates and ISO dates', () => {
    expect(sourceDate('46054')).toBe('2026-02-01');
    expect(sourceDate('2025-07-15')).toBe('2025-07-15');
    expect(sourceDate('Null')).toBeNull();
    expect(sourceDate('7')).toBeNull();
  });
});

describe('tidyAddress', () => {
  it('removes the gaps left by empty address parts', () => {
    expect(tidyAddress('0 S COUNTY RD 01200,, TX 79706')).toBe('0 S COUNTY RD 01200, TX 79706');
    expect(tidyAddress('535 HOERSTER RD , FREDERICKSBURG, TX')).toBe('535 HOERSTER RD, FREDERICKSBURG, TX');
    expect(tidyAddress(', ,')).toBeNull();
    expect(tidyAddress(null)).toBeNull();
  });
});

describe('legalAcres', () => {
  it('trusts an explicit unit', () => {
    expect(legalAcres(10, 'AC', 500)).toBe(10);
    expect(legalAcres(43560, 'SQFT', null)).toBe(1);
  });

  it('uses the mapped boundary to tell acres from square feet', () => {
    expect(legalAcres(80.42, null, 80.27)).toBe(80.42);
    expect(legalAcres(10890, null, 0.25)).toBeCloseTo(0.25, 5);
  });

  it('drops figures that fit neither unit', () => {
    expect(legalAcres(999, null, 2)).toBeNull();
    expect(legalAcres(0, null, 2)).toBeNull();
    expect(legalAcres(5, null, null)).toBeNull();
  });
});

describe('normalizeParcel', () => {
  const raw = {
    objectid: '4876960',
    PROP_ID: '4764',
    GEO_ID: 'A0125-0190-000000-00',
    OWNER_NAME: 'DOE, JANE',
    NAME_CARE: 'DOE, JANE',
    LEGAL_AREA: '12.1',
    LEGAL_DESC: 'ABS A0125 J W CLARK 190, 12.1 ACRES',
    LAND_VALUE: '300000',
    IMP_VALUE: '0',
    MKT_VALUE: '300000',
    SITUS_ADDR: '310 SAMPLE RD , TX',
    MAIL_ADDR: 'Null',
    MAIL_LINE1: 'Null',
    MAIL_LINE2: 'PO BOX 1',
    MAIL_CITY: 'FREDERICKSBURG',
    MAIL_STAT: 'TX',
    MAIL_ZIP: '78624',
    SOURCE: 'GILLESPIE APPRAISAL DISTRICT',
    DATE_ACQ: '46054',
    FIPS: '48171',
    COUNTY: 'GILLESPIE',
    TAX_YEAR: '2026',
    YEAR_BUILT: 'Null',
    STAT_LAND_USE: 'Null',
    LOC_LAND_USE: 'Null',
  };

  it('builds a clean parcel', () => {
    const p = normalizeParcel(raw, rings)!;
    expect(p.id).toBe('TX:48171:4764');
    expect(p.owner).toBe('DOE, JANE');
    expect(p.careOf).toBeNull(); // same as the owner, so not repeated
    expect(p.mailingAddress).toBe('PO BOX 1, FREDERICKSBURG, TX 78624');
    expect(p.situsAddress).toBe('310 SAMPLE RD, TX');
    expect(p.marketValue).toBe(300000);
    expect(p.yearBuilt).toBeNull();
    expect(p.landUse).toBeNull();
    expect(p.sourceDate).toBe('2026-02-01');
    expect(p.mappedAcres).toBeGreaterThan(9);
    expect(p.mappedAcres).toBeLessThan(12);
    expect(p.legalAcres).toBe(12.1);
    expect(p.geometry.type).toBe('Polygon');
  });

  it('returns nothing without a boundary', () => {
    expect(normalizeParcel(raw, undefined)).toBeNull();
  });
});
