#!/usr/bin/env node
// Builds server/states/tx/data/tax-rates.json from the Texas Comptroller's
// annual "Tax Rates and Levies" workbooks.
//
//   npm run data:tx-tax-rates            # default year below
//   npm run data:tx-tax-rates -- 2026    # another year, once published
//
// Source: https://comptroller.texas.gov/taxes/property-tax/rates/
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const year = Number(process.argv[2] ?? 2025);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheDir = path.join(root, 'scripts', '.cache');
const outFile = path.join(root, 'server', 'states', 'tx', 'data', 'tax-rates.json');
const base = 'https://comptroller.texas.gov/taxes/property-tax/docs';

const files = {
  county: `${year}-county-rates-levies.xlsx`,
  city: `${year}-city-rates-levies.xlsx`,
  school: `${year}-school-district-rates-levies.xlsx`,
  special: `${year}-special-district-rates-levies.xlsx`,
};

async function fetchWorkbook(name) {
  await mkdir(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, name);
  if (!existsSync(cached)) {
    const res = await fetch(`${base}/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    await writeFile(cached, Buffer.from(await res.arrayBuffer()));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await readFile(cached));
  return wb;
}

/** Reads the "Detail" sheet into objects keyed by normalized header text. */
async function readRows(name) {
  const wb = await fetchWorkbook(name);
  const ws = wb.getWorksheet('Detail') ?? wb.worksheets[0];
  let headers = null;
  const rows = [];
  ws.eachRow((row) => {
    const values = row.values.slice(1).map((v) => (v && typeof v === 'object' && 'result' in v ? v.result : v));
    if (!headers) {
      if (values.some((v) => typeof v === 'string' && v.trim().toUpperCase() === 'TAXING UNIT ID')) {
        headers = values.map((v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase());
      }
      return;
    }
    const rec = {};
    headers.forEach((h, i) => (rec[h] = values[i]));
    if (rec['TAXING UNIT ID']) rows.push(rec);
  });
  if (!headers) throw new Error(`${name}: header row not found`);
  return rows;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : 0;
};
const text = (v) => String(v ?? '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

const [countyRows, cityRows, schoolRows, specialRows] = await Promise.all(
  [files.county, files.city, files.school, files.special].map(readRows),
);

// County number (001..254) -> rate. FIPS = 48000 + 2n - 1.
const counties = {};
for (const r of countyRows) {
  const id = text(r['COUNTY ID']).padStart(3, '0');
  counties[id] = { name: text(r['COUNTY NAME']), rate: num(r['TOTAL COUNTY TAX RATE']) };
}

// A unit that crosses county lines appears once per appraisal district with
// the same rate, so entries are keyed by the unit's own ID prefix and the
// counties it reports in are collected alongside.
function collect(rows, nameKey) {
  const units = {};
  for (const r of rows) {
    const unitId = text(r['TAXING UNIT ID']);
    const key = unitId.split('-').slice(0, 3).join('-');
    const rate = num(r['TOTAL TAX RATE']);
    const county = text(r['COUNTY ID']).padStart(3, '0');
    const u = (units[key] ??= { name: text(r[nameKey]), rate, counties: [] });
    if (rate > u.rate) u.rate = rate;
    if (!u.counties.includes(county)) u.counties.push(county);
  }
  return units;
}

const cities = collect(cityRows, 'TAXING UNIT NAME');
const schoolsRaw = collect(schoolRows, 'TAXING UNIT NAME');
const special = collect(specialRows, 'TU NAME');

// School districts are re-keyed by their TEA county-district number ("086-901").
const schools = {};
for (const [key, u] of Object.entries(schoolsRaw)) {
  schools[key.split('-').slice(0, 2).join('-')] = u;
}

const out = {
  taxYear: year,
  source: 'Texas Comptroller of Public Accounts, Tax Rates and Levies',
  sourceUrl: 'https://comptroller.texas.gov/taxes/property-tax/rates/',
  generated: new Date().toISOString().slice(0, 10),
  note: 'Rates are dollars per $100 of taxable value.',
  counties,
  cities,
  schools,
  special,
};

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(out));
console.log(
  `Wrote ${path.relative(root, outFile)}: ${Object.keys(counties).length} counties, ` +
    `${Object.keys(cities).length} cities, ${Object.keys(schools).length} school districts, ` +
    `${Object.keys(special).length} special districts (tax year ${year}).`,
);
