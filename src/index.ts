import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { writeFileSync } from 'fs';
import { loadConfig, generateExampleConfig } from './config/config.js';
import { Router } from './router/router.js';
import { SQLiteStore } from './storage/sqlite.js';
import { createProxyApp } from './proxy/handler.js';
import { createWebUIApp } from './webui/handlers.js';

const args = process.argv.slice(2);
const configFlagIndex = args.indexOf('--config');
const configPath = configFlagIndex !== -1 ? args[configFlagIndex + 1] : 'config.yaml';

if (args.includes('--generate-config')) {
  writeFileSync('config.yaml', generateExampleConfig(), 'utf-8');
  console.log('Example config written to config.yaml');
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Claude Proxy - Claude Code API proxy with multi-model routing

Usage: claude-proxy [options]

Options:
  --config <path>    Path to config file (default: config.yaml)
  --generate-config  Generate example config file
  --help, -h         Show this help message

Example:
  claude-proxy --config config.yaml

Then set in Claude Code:
  export ANTHROPIC_BASE_URL=http://localhost:3456
  `);
  process.exit(0);
}

let config;
try {
  config = loadConfig(configPath);
} catch (error) {
  console.error(`Failed to load config: ${error}`);
  console.log('Run with --generate-config to create an example config file');
  process.exit(1);
}

console.log(`Loading config from: ${configPath}`);
console.log(`Server: ${config.server.host}:${config.server.port}`);
console.log(`Providers: ${Object.keys(config.providers).join(', ')}`);

async function main() {
  const router = new Router(config);
  const store = await SQLiteStore.create(config.storage.path);

  const app = new Hono();
  app.use('*', cors());

  // Proxy API endpoints (for Claude Code)
  app.post('/v1/messages', async (c) => {
    // Import handler logic
    const { handleMessages } = await import('./proxy/handler.js');
    return handleMessages(c, { config, router, store });
  });

  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Custom models API - for Claude Code to discover available models
  app.get('/v1/models', (c) => {
    const customModels = router.getCustomModels();
    return c.json({
      object: 'list',
      data: customModels.map(m => ({
        id: m.name,
        object: 'model',
        created: Date.now(),
        owned_by: m.provider,
        description: m.description || '',
        actual_model: m.model,
      })),
    });
  });

  // Web UI API endpoints
  app.get('/api/stats', (c) => {
    const startDateStr = c.req.query('start') || undefined;
    const endDateStr = c.req.query('end') || undefined;
    return c.json(store.getStats(startDateStr, endDateStr));
  });

  app.get('/api/requests', (c) => {
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const model = c.req.query('model') || undefined;
    const provider = c.req.query('provider') || undefined;
    const startDateStr = c.req.query('start') || undefined;
    const endDateStr = c.req.query('end') || undefined;
    return c.json(store.listRequests({ limit, offset, model, provider, startDateStr, endDateStr }));
  });

  app.get('/api/requests/:id', (c) => {
    const request = store.getRequestById(c.req.param('id'));
    if (!request) return c.json({ error: 'Request not found' }, 404);
    return c.json(request);
  });

  // Clear all requests
  app.post('/api/clear', (c) => {
    store.clearAll();
    return c.json({ success: true, message: 'All requests cleared' });
  });

  // Serve static files
  const { readFileSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  app.get('/', (c) => {
    try {
      const html = readFileSync(join(__dirname, 'webui/static/index.html'), 'utf-8');
      return c.html(html);
    } catch {
      return c.text('Index.html not found', 404);
    }
  });

  app.get('/static/*', (c) => {
    const path = c.req.path.replace('/static/', '');
    try {
      const content = readFileSync(join(__dirname, 'webui/static', path));
      const ext = path.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
      };
      return new Response(content, {
        headers: { 'Content-Type': contentTypes[ext || ''] || 'application/octet-stream' },
      });
    } catch {
      return c.text('File not found', 404);
    }
  });

  const port = config.server.port;
  const host = config.server.host;

  console.log(`\n🚀 Claude Proxy running at http://${host}:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
  console.log(`🔌 API endpoint: http://localhost:${port}/v1/messages`);

  const customModels = router.getCustomModels();
  if (customModels.length > 0) {
    console.log(`\n📋 Custom models available:`);
    customModels.forEach(m => {
      console.log(`   ${m.name} → ${m.provider}/${m.model}`);
    });
  }

  console.log(`\nConfigure Claude Code:`);
  console.log(`  export ANTHROPIC_BASE_URL=http://localhost:${port}`);
  if (customModels.length > 0) {
    console.log(`  export ANTHROPIC_MODEL=${customModels[0].name}`);
  }

  const shutdown = () => {
    console.log('\nShutting down...');
    store.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Use @hono/node-server for Node.js compatibility
  const { serve } = await import('@hono/node-server');
  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  }, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}

main().catch(console.error);
