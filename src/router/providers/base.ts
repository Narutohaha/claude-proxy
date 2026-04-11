import type { ProviderConfig } from '../config/config.js';
import type { AnthropicRequest, StreamEvent } from '../storage/models.js';

export interface Provider {
  name: string;
  type: string;
  getEndpoint(): string;
  getHeaders(): Record<string, string>;
  transformRequest(req: AnthropicRequest): any;
  transformRequestBody(body: string): string;
}

export function createProvider(name: string, config: ProviderConfig): Provider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(name, config);
    case 'openai':
      return new OpenAIProvider(name, config);
    default:
      return new GenericProvider(name, config);
  }
}

class AnthropicProvider implements Provider {
  name: string;
  type = 'anthropic';
  private baseURL: string;
  private apiKey: string;
  private authType: 'header' | 'bearer';
  private extraHeaders: Record<string, string>;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.baseURL = config.base_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
    this.authType = config.auth_type || 'header';
    this.extraHeaders = config.headers || {};
  }

  getEndpoint(): string {
    return `${this.baseURL}/v1/messages`;
  }

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    return { ...headers, ...this.extraHeaders };
  }

  transformRequest(req: AnthropicRequest): any {
    return req;
  }

  transformRequestBody(body: string): string {
    return body;
  }
}

class OpenAIProvider implements Provider {
  name: string;
  type = 'openai';
  private baseURL: string;
  private apiKey: string;
  private extraHeaders: Record<string, string>;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.baseURL = config.base_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
    this.extraHeaders = config.headers || {};
  }

  getEndpoint(): string {
    return `${this.baseURL}/chat/completions`;
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
    };
  }

  transformRequest(req: AnthropicRequest): any {
    const messages: any[] = [];

    if (req.system) {
      if (typeof req.system === 'string') {
        messages.push({ role: 'system', content: req.system });
      } else if (Array.isArray(req.system)) {
        const systemText = req.system
          .filter((s): s is { type: 'text'; text: string } => s.type === 'text' || s.type === 'text_prompt')
          .map(s => s.text)
          .join('\n\n');
        if (systemText) messages.push({ role: 'system', content: systemText });
      }
    }

    for (const msg of req.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const content = msg.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map(block => block.text)
          .join('\n');

        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            messages.push({
              role: 'assistant',
              tool_calls: [{
                id: block.tool_use_id || `call_${Date.now()}`,
                type: 'function',
                function: { name: block.name || '', arguments: JSON.stringify(block.input || {}) },
              }],
            });
          } else if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            });
          }
        }

        if (content) messages.push({ role: msg.role, content });
      }
    }

    const openaiReq: any = {
      model: req.model,
      messages,
      max_tokens: req.max_tokens,
      stream: req.stream,
    };

    if (req.temperature !== undefined) openaiReq.temperature = req.temperature;
    if (req.top_p !== undefined) openaiReq.top_p = req.top_p;

    if (req.tools && req.tools.length > 0) {
      openaiReq.tools = req.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }));
    }

    return openaiReq;
  }

  transformRequestBody(body: string): string {
    try {
      const req = JSON.parse(body) as AnthropicRequest;
      const transformed = this.transformRequest(req);
      return JSON.stringify(transformed);
    } catch {
      return body;
    }
  }
}

class GenericProvider implements Provider {
  name: string;
  type = 'generic';
  private baseURL: string;
  private apiKey: string;
  private extraHeaders: Record<string, string>;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.baseURL = config.base_url.replace(/\/$/, '');
    this.apiKey = config.api_key;
    this.extraHeaders = config.headers || {};
  }

  getEndpoint(): string {
    if (this.baseURL.includes('/v1')) return `${this.baseURL}/messages`;
    return `${this.baseURL}/v1/messages`;
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      ...this.extraHeaders,
    };
  }

  transformRequest(req: AnthropicRequest): any {
    return req;
  }

  transformRequestBody(body: string): string {
    return body;
  }
}
