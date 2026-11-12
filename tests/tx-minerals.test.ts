import { describe, expect, it } from 'vitest';
import type { Well } from '../shared/types.ts';
import { formatApi, mineralSignal, toPipelines } from '../server/states/tx/minerals.ts';

const well = (type: string): Well => ({ api: '42-329-31901', wellNumber: '1', type, onParcel: true, lngLat: [0, 0] });

describe('formatApi', () => {
  it('adds the Texas state prefix to an 8-digit number', () => {
    expect(formatApi('32931901')).toBe('42-329-31901');
  });

  it('leaves anything else recognizable', () => {
    expect(formatApi(null)).toBe('Unknown');
    expect(formatApi(' 123 ')).toBe('123');
  });
});

describe('mineralSignal', () => {
  it('flags producing wells and laterals on the tract', () => {
    expect(mineralSignal([well('Oil Well')], 0, 0)).toBe('on-parcel');
    expect(mineralSignal([], 2, 0)).toBe('on-parcel');
  });

  it('treats dry holes and permits on the tract as nearby activity only', () => {
    expect(mineralSignal([well('Dry Hole')], 0, 0)).toBe('nearby');
    expect(mineralSignal([well('Permitted Location')], 0, 0)).toBe('nearby');
    expect(mineralSignal([well('Plugged Oil Well')], 0, 0)).toBe('nearby');
  });

  it('distinguishes nearby wells from none', () => {
    expect(mineralSignal([], 0, 12)).toBe('nearby');
    expect(mineralSignal([], 0, 0)).toBe('none');
  });
});

describe('toPipelines', () => {
  const row = { OPERATOR: 'ACME PIPELINE', COMMODITY_DESCRIPTION: 'NATURAL GAS', SYSTEM_NAME: 'MAIN', DIAMETER: '12.75', STATUS: 'IN SERVICE', INTERSTATE: 'N' };

  it('collapses segments of the same line', () => {
    expect(toPipelines([row, { ...row }])).toHaveLength(1);
  });

  it('keeps lines that differ and cleans their fields', () => {
    const out = toPipelines([row, { ...row, DIAMETER: 0, OPERATOR: '  ', INTERSTATE: null }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ diameterInches: 12.75, interstate: false });
    expect(out[1]).toMatchObject({ diameterInches: null, operator: null, interstate: null });
  });
});
