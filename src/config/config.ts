import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

export interface ServerConfig {
  host: string;
  port: number;
}

export interface StorageConfig {
  path: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'text' | 'json';
}

export interface ProviderConfig {
  type: 'anthropic' | 'openai' | 'gemini' | 'custom';
  base_url: string;
  api_key: string;
  auth_type?: 'header' | 'bearer';  // 认证方式：header 使用 x-api-key，bearer 使用 Authorization: Bearer
  headers?: Record<string, string>;
}

export interface RouteConfig {
  pattern: string;
  provider: string;
  model?: string;
}

export interface CustomModelConfig {
  name: string;           // 自定义模型名，供 Claude Code 使用
  provider: string;       // 提供商名称
  model: string;          // 实际调用的模型名
  description?: string;   // 模型描述（可选）
}

export interface Config {
  server: ServerConfig;
  storage: StorageConfig;
  logging: LoggingConfig;
  providers: Record<string, ProviderConfig>;
  routes: RouteConfig[];
  custom_models?: CustomModelConfig[];  // 自定义模型列表
}

function expandEnvVars(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, g1, g2) => {
    const varName = g1 || g2;
    return process.env[varName] || '';
  });
}

function expandConfigEnvVars(obj: any): any {
  if (typeof obj === 'string') return expandEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(expandConfigEnvVars);
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandConfigEnvVars(value);
    }
    return result;
  }
  return obj;
}

export function loadConfig(configPath: string): Config {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const rawConfig = yaml.load(content) as Config;
  const config = expandConfigEnvVars(rawConfig) as Config;

  config.server = {
    host: config.server?.host || '0.0.0.0',
    port: config.server?.port || 3456,
  };

  config.storage = {
    path: config.storage?.path || './data/proxy.db',
  };

  config.logging = {
    level: config.logging?.level || 'info',
    format: config.logging?.format || 'text',
  };

  config.providers = config.providers || {};
  config.routes = config.routes || [];
  config.custom_models = config.custom_models || [];

  if (Object.keys(config.providers).length === 0) {
    throw new Error('No providers configured');
  }

  return config;
}

export function generateExampleConfig(): string {
  return `# Claude Proxy 配置文件

server:
  host: "0.0.0.0"
  port: 3456

storage:
  path: "./data/proxy.db"

logging:
  level: "info"
  format: "text"

# API 提供商配置
# type: anthropic (Claude API 格式) 或 openai (OpenAI API 格式)
# auth_type: header (x-api-key) 或 bearer (Authorization: Bearer)
providers:
  # 示例：Anthropic 官方 API
  anthropic:
    type: "anthropic"
    base_url: "https://api.anthropic.com"
    api_key: "\${ANTHROPIC_API_KEY}"
    auth_type: "header"

  # 示例：自定义 API 端点（使用 Bearer 认证）
  my-provider:
    type: "anthropic"
    base_url: "https://api.example.com/anthropic"
    api_key: "\${MY_API_KEY}"
    auth_type: "bearer"

  # 示例：OpenAI 兼容 API
  openai-compatible:
    type: "openai"
    base_url: "https://api.openai.com/v1"
    api_key: "\${OPENAI_API_KEY}"

# 自定义模型配置（供 Claude Code 使用）
# Claude Code 配置: ANTHROPIC_MODEL=my-model
custom_models:
  - name: "my-model"
    provider: "my-provider"
    model: "actual-model-name"
    description: "我的自定义模型"

  - name: "my-fast-model"
    provider: "my-provider"
    model: "fast-model-name"
    description: "快速模型"

# 路由规则（按顺序匹配，用于未在 custom_models 中定义的模型）
routes:
  - pattern: "claude-*"
    provider: "anthropic"

  - pattern: "*"
    provider: "my-provider"
`;
}
