import { Hono } from 'hono';
import type { Parcel, ParcelLookup, ReportMap, ReportSection } from '../shared/types.ts';
import { geocode } from './geocode.ts';
import { TtlCache } from './lib/cache.ts';
import { UpstreamError } from './lib/http.ts';
import { floodReport } from './national/flood.ts';
import { landReport } from './national/land.ts';
import { allProviders, providerByCode, providersAt } from './states/registry.ts';
import { BadRequest, parseLngLat, parseParcel } from './validate.ts';

const HOUR = 3_600_000;
const parcelCache = new TtlCache<Parcel[]>(6 * HOUR, 2000);
const reportCache = new TtlCache<ReportMap[ReportSection]>(6 * HOUR, 2000);
const geocodeCache = new TtlCache<Awaited<ReturnType<typeof geocode>>>(24 * HOUR, 1000);

export const app = new Hono();

app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  if (err instanceof UpstreamError) {
    console.warn(`[upstream] ${err.message}`);
    return c.json({ error: `${err.service} is not responding right now. Try again in a moment.` }, 502);
  }
  console.error(err);
  return c.json({ error: 'Something went wrong on our side.' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/states', (c) => c.json({ states: allProviders().map((p) => p.config) }));

app.get('/api/parcels/at', async (c) => {
  const lngLat = parseLngLat(c.req.query('lat'), c.req.query('lng'));
  // ~1 m grid: repeated clicks on the same spot share a cache entry.
  const key = `${lngLat[0].toFixed(5)},${lngLat[1].toFixed(5)}`;
  const parcels = await parcelCache.wrap(key, async () => {
    for (const provider of providersAt(lngLat)) {
      const found = await provider.parcelsAt(lngLat);
      if (found.length) return found;
    }
    return [];
  });
  return c.json({ parcels } satisfies ParcelLookup);
});

app.post('/api/report/:section', async (c) => {
  const section = c.req.param('section') as ReportSection;
  const parcel = parseParcel(await c.req.json().catch(() => null));
  const provider = providerByCode(parcel.state);
  if (!provider || !provider.config.sections.includes(section)) {
    throw new BadRequest('That report is not available for this parcel.');
  }
  const run: Record<ReportSection, (() => Promise<ReportMap[ReportSection]>) | undefined> = {
    taxes: provider.taxes && (() => provider.taxes!(parcel)),
    minerals: provider.minerals && (() => provider.minerals!(parcel)),
    flood: () => floodReport(parcel),
    land: () => landReport(parcel),
  };
  const work = run[section];
  if (!work) throw new BadRequest('That report is not available for this parcel.');
  // Tax estimates depend on the roll value, so it is part of the key.
  const key = `${section}:${parcel.id}:${parcel.taxYear ?? ''}:${parcel.marketValue ?? ''}:${parcel.centroid.join(',')}`;
  return c.json(await reportCache.wrap(key, work));
});

app.get('/api/geocode', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 200);
  if (q.length < 3) return c.json({ results: [] });
  const results = await geocodeCache.wrap(q.toLowerCase(), () => geocode(q));
  return c.json({ results });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
