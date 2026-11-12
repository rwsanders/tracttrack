import { readFileSync } from 'node:fs';
import type { Parcel, TaxReport, TaxUnit } from '../../../shared/types.ts';
import { queryLayer } from '../../lib/arcgis.ts';

const TEA_DISTRICTS =
  'https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services/School_Districts__2026/FeatureServer/0';
const TX_CITIES =
  'https://feature.geographic.texas.gov/arcgis/rest/services/City_Boundaries/Texas_City_Boundaries/MapServer/0';

interface RateUnit {
  name: string;
  rate: number;
  counties: string[];
}

export interface TaxRates {
  taxYear: number;
  counties: Record<string, { name: string; rate: number }>;
  cities: Record<string, RateUnit>;
  schools: Record<string, RateUnit>;
  special: Record<string, RateUnit>;
}

let cached: TaxRates | undefined;
export function loadRates(): TaxRates {
  cached ??= JSON.parse(readFileSync(new URL('./data/tax-rates.json', import.meta.url), 'utf8')) as TaxRates;
  return cached;
}

/** Texas numbers its counties 1-254 alphabetically; FIPS codes are the odd numbers 48001-48507. */
export function countyNumber(fips: string | null): string | null {
  const n = Number(fips);
  if (!Number.isInteger(n) || n < 48001 || n > 48507 || n % 2 === 0) return null;
  return String((n - 48000 + 1) / 2).padStart(3, '0');
}

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(city|town|village) of\b/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Finds a city's rate by name, preferring the entry that reports in the parcel's county. */
export function findCity(rates: TaxRates, cityName: string, county: string | null): RateUnit | null {
  const target = normalizeName(cityName);
  const matches = Object.values(rates.cities).filter((c) => normalizeName(c.name) === target);
  if (matches.length === 0) return null;
  return matches.find((c) => county !== null && c.counties.includes(county)) ?? (matches.length === 1 ? matches[0] : null);
}

export interface Jurisdictions {
  /** TEA county-district number, e.g. "086-901". */
  schoolDistrict: { id: string; name: string } | null;
  city: string | null;
}

/** Pure rate math, separated from the lookups so it can be tested offline. */
export function buildTaxReport(rates: TaxRates, parcel: Parcel, where: Jurisdictions): TaxReport {
  const county = countyNumber(parcel.fips);
  const basis = parcel.marketValue !== null && parcel.marketValue > 0 ? parcel.marketValue : null;
  const estimate = (rate: number) => (basis === null ? null : (basis * rate) / 100);
  const units: TaxUnit[] = [];
  const caveats: string[] = [];

  const countyRate = county ? rates.counties[county] : undefined;
  if (countyRate) {
    units.push({ kind: 'county', name: `${countyRate.name} County`, rate: countyRate.rate, estimate: estimate(countyRate.rate) });
  } else {
    caveats.push('The county tax rate could not be matched, so the total is understated.');
  }

  if (where.schoolDistrict) {
    const school = rates.schools[where.schoolDistrict.id];
    if (school) {
      units.push({ kind: 'school', name: school.name, rate: school.rate, estimate: estimate(school.rate) });
    } else {
      caveats.push(`No published rate was found for ${where.schoolDistrict.name}, so the total is understated.`);
    }
  } else {
    caveats.push('The school district could not be determined, so the total is understated.');
  }

  if (where.city) {
    const city = findCity(rates, where.city, county);
    if (city) {
      units.push({ kind: 'city', name: `City of ${city.name}`, rate: city.rate, estimate: estimate(city.rate) });
    } else {
      caveats.push(`The parcel is inside ${where.city}, but no city rate was found; the total may be understated.`);
    }
  }

  const totalRate = units.reduce((sum, u) => sum + u.rate, 0);
  const possibleUnits = county
    ? Object.values(rates.special)
        .filter((u) => u.counties.includes(county) && u.rate > 0)
        .map((u) => ({ name: u.name, rate: u.rate }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  if (basis === null) caveats.push('The appraisal roll has no market value for this parcel, so only rates are shown.');
  caveats.push(
    'Estimated from the appraisal district market value. Agricultural, wildlife or timber valuation and exemptions such as homestead can lower the real bill dramatically, and land that loses a special valuation can owe rollback taxes.',
  );
  if (possibleUnits.length) {
    caveats.push(
      'Special districts (water, hospital, emergency services, college, MUD) are not included because their boundaries are not published statewide. Ask the appraisal district which apply.',
    );
  }

  return {
    taxYear: rates.taxYear,
    basisValue: basis,
    units,
    totalRate: Math.round(totalRate * 1e6) / 1e6,
    totalEstimate: basis === null ? null : (basis * totalRate) / 100,
    possibleUnits,
    caveats,
    sources: [
      { name: 'Texas Comptroller, Tax Rates and Levies', url: 'https://comptroller.texas.gov/taxes/property-tax/rates/' },
      { name: 'Texas Education Agency school district boundaries', url: 'https://schoolsdata2-tea-texas.opendata.arcgis.com/' },
      { name: 'TxGIO city boundaries', url: 'https://geographic.texas.gov/' },
    ],
  };
}

export async function taxReport(parcel: Parcel): Promise<TaxReport> {
  const [school, city] = await Promise.allSettled([
    queryLayer<{ DISTRICT: string | null; NAME: string | null }>(TEA_DISTRICTS, {
      service: 'Texas Education Agency',
      geometry: parcel.centroid,
      outFields: ['DISTRICT', 'NAME'],
      limit: 1,
    }),
    queryLayer<{ city_name: string | null }>(TX_CITIES, {
      service: 'TxGIO city boundaries',
      geometry: parcel.centroid,
      outFields: ['city_name'],
      limit: 1,
    }),
  ]);

  const district = school.status === 'fulfilled' ? school.value.features[0]?.attributes : undefined;
  const cityName = city.status === 'fulfilled' ? (city.value.features[0]?.attributes.city_name ?? null) : null;

  const report = buildTaxReport(loadRates(), parcel, {
    schoolDistrict: district?.DISTRICT ? { id: district.DISTRICT, name: district.NAME ?? 'the school district' } : null,
    city: cityName,
  });
  if (city.status === 'rejected') {
    report.caveats.unshift('City limits could not be checked right now; a city tax may also apply.');
  }
  return report;
}
