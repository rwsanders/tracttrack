import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { app } from './app.ts';

const port = Number(process.env.PORT ?? 8787);

// In production the API also serves the built client; in development Vite does.
if (process.env.NODE_ENV === 'production') {
  if (!existsSync('dist/index.html')) {
    console.error('dist/ is missing. Run "npm run build" before "npm start".');
    process.exit(1);
  }
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`TractTrack API listening on http://localhost:${info.port}`);
});
