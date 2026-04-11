import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { SQLiteStore } from '../storage/sqlite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createWebUIApp(store: SQLiteStore): Hono {
  const app = new Hono();

  app.get('/api/stats', (c) => {
    const startDate = c.req.query('start') ? new Date(c.req.query('start') as string) : undefined;
    const endDate = c.req.query('end') ? new Date(c.req.query('end') as string) : undefined;
    const stats = store.getStats(startDate, endDate);
    return c.json(stats);
  });

  app.get('/api/requests', (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const model = c.req.query('model') || undefined;
    const provider = c.req.query('provider') || undefined;
    const startDate = c.req.query('start') ? new Date(c.req.query('start') as string) : undefined;
    const endDate = c.req.query('end') ? new Date(c.req.query('end') as string) : undefined;

    const requests = store.listRequests({ limit, offset, model, provider, startDate, endDate });
    return c.json(requests);
  });

  app.get('/api/requests/:id', (c) => {
    const id = c.req.param('id');
    const request = store.getRequestById(id);
    if (!request) return c.json({ error: 'Request not found' }, 404);
    return c.json(request);
  });

  app.get('/', (c) => {
    try {
      const htmlPath = join(__dirname, 'static', 'index.html');
      const html = readFileSync(htmlPath, 'utf-8');
      return c.html(html);
    } catch {
      return c.text('Index.html not found', 404);
    }
  });

  app.get('/static/*', async (c) => {
    const path = c.req.path.replace('/static/', '');
    try {
      const filePath = join(__dirname, 'static', path);
      const content = readFileSync(filePath);
      const ext = path.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
      };
      return new Response(content, {
        headers: { 'Content-Type': contentTypes[ext || ''] || 'application/octet-stream' },
      });
    } catch {
      return c.text('File not found', 404);
    }
  });

  return app;
}
