import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { v4 as uuidv4 } from 'uuid';
import type { Context } from 'hono';
import type { Config } from '../config/config.js';
import { Router } from '../router/router.js';
import { SQLiteStore } from '../storage/sqlite.js';
import type { AnthropicRequest, RequestRecord, StreamEvent } from '../storage/models.js';

interface ProxyDeps {
  config: Config;
  router: Router;
  store: SQLiteStore;
}

export async function handleMessages(c: Context, deps: ProxyDeps) {
  const { config, router, store } = deps;
  const startTime = Date.now();
  const requestId = uuidv4();
  const clientIP = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

  const rawRequestBody = await c.req.text();
  let requestJson: AnthropicRequest;

  try {
    requestJson = JSON.parse(rawRequestBody);
  } catch (e) {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const model = requestJson.model;
  console.log(`[${requestId}] Request: model=${model}, stream=${requestJson.stream}`);

  const routeResult = router.route(model);
  if (!routeResult) {
    return c.json({ error: `No provider configured for model: ${model}` }, 400);
  }

  const { provider, actualModel } = routeResult;
  console.log(`[${requestId}] Routed to provider: ${provider.name}, actual model: ${actualModel}`);

  const record: RequestRecord = {
    id: requestId,
    timestamp: new Date(),
    model,
    provider: provider.name,
    routed_model: actualModel,
    raw_request: rawRequestBody,
    raw_response: '',
    messages_json: JSON.stringify(requestJson.messages),
    system_json: requestJson.system ? JSON.stringify(requestJson.system) : null,
    tools_json: requestJson.tools ? JSON.stringify(requestJson.tools) : null,
    max_tokens: requestJson.max_tokens || null,
    temperature: requestJson.temperature || null,
    thinking_json: requestJson.thinking ? JSON.stringify(requestJson.thinking) : null,
    response_content: null,
    stop_reason: null,
    input_tokens: 0,
    output_tokens: 0,
    duration_ms: 0,
    client_ip: clientIP,
    error: null,
  };

  let upstreamBody = rawRequestBody;
  if (actualModel !== model) {
    const modifiedRequest = { ...requestJson, model: actualModel };
    upstreamBody = JSON.stringify(modifiedRequest);
  }

  if (provider.type === 'openai') {
    upstreamBody = provider.transformRequestBody(upstreamBody);
  }

  try {
    const upstreamUrl = provider.getEndpoint();
    const headers = provider.getHeaders();

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: upstreamBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      record.error = errorText;
      record.raw_response = errorText;
      record.duration_ms = Date.now() - startTime;
      store.saveRequest(record);

      return new Response(errorText, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (requestJson.stream) {
      return streamSSE(c, async (stream) => {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let contentBuilder = '';
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  await stream.writeln('data: [DONE]\n\n');
                  continue;
                }

                try {
                  const event = JSON.parse(data) as StreamEvent;

                  if (event.type === 'message_start' && event.message) {
                    inputTokens = event.message.usage?.input_tokens || 0;
                  } else if (event.type === 'content_block_delta' && event.delta) {
                    if (event.delta.type === 'text_delta') {
                      contentBuilder += event.delta.text || '';
                    }
                  } else if (event.type === 'message_delta') {
                    if (event.delta?.stop_reason) {
                      record.stop_reason = event.delta.stop_reason;
                    }
                    if (event.usage) {
                      outputTokens = event.usage.output_tokens || 0;
                    }
                  }
                } catch {}

                await stream.writeln(`data: ${data}\n\n`);
              } else if (line.startsWith('event: ')) {
                await stream.writeln(`${line}\n`);
              } else if (line.trim()) {
                await stream.writeln(`${line}\n`);
              }
            }
          }

          record.response_content = contentBuilder;
          record.input_tokens = inputTokens;
          record.output_tokens = outputTokens;
          record.duration_ms = Date.now() - startTime;
          store.saveRequest(record);

        } catch (error) {
          console.error(`[${requestId}] Stream error:`, error);
          record.error = String(error);
          record.duration_ms = Date.now() - startTime;
          store.saveRequest(record);
        }
      });
    }

    const rawResponseBody = await response.text();
    record.raw_response = rawResponseBody;
    record.duration_ms = Date.now() - startTime;

    try {
      const responseJson = JSON.parse(rawResponseBody);

      if (responseJson.content && Array.isArray(responseJson.content)) {
        const textContent = responseJson.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');
        record.response_content = textContent;
      }

      record.stop_reason = responseJson.stop_reason;
      record.input_tokens = responseJson.usage?.input_tokens || 0;
      record.output_tokens = responseJson.usage?.output_tokens || 0;
    } catch {}

    store.saveRequest(record);

    return new Response(rawResponseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[${requestId}] Upstream error:`, error);
    record.error = String(error);
    record.duration_ms = Date.now() - startTime;
    store.saveRequest(record);

    return c.json({ error: 'Upstream request failed' }, 502);
  }
}

export function createProxyApp(deps: ProxyDeps): Hono {
  const app = new Hono();
  app.use('*', cors());

  app.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/messages', (c) => handleMessages(c, deps));

  return app;
}