# Claude Proxy

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![GitHub Stars](https://img.shields.io/github/stars/Narutohaha/claude-proxy?style=social)](https://github.com/Narutohaha/claude-proxy/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Narutohaha/claude-proxy?style=social)](https://github.com/Narutohaha/claude-proxy/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/Narutohaha/claude-proxy)](https://github.com/Narutohaha/claude-proxy/issues)

[中文文档](#中文文档)

A Claude Code API proxy service with custom model names, multi-model routing, request analysis, and statistics monitoring.

## Features

- 🏷️ **Custom Model Names** - Define memorable model names (e.g., `my-smart-model`) that automatically map to real models
- 🔄 **Multi-Model Routing** - Automatically route requests to different API providers based on model names
- 📊 **Request/Response Parsing** - Parse Claude Code request structures (messages, tools, thinking, etc.)
- 📈 **Statistics Monitoring** - Track token usage, latency, and model distribution
- 💾 **History Records** - SQLite persistent storage for all requests
- 🖥️ **Web UI** - Modern, elegant embedded dashboard with raw/parsed view toggle
- 🔌 **Easy Integration** - Works seamlessly with Claude Code CLI tool

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Config File

```bash
npx tsx src/index.ts --generate-config
```

### 3. Edit Configuration

Edit `config.yaml` to configure your API providers and custom models:

```yaml
server:
  host: "0.0.0.0"
  port: 3456

providers:
  openai:
    type: "anthropic"
    base_url: "https://api.openai.com/v1"
    api_key: "${OPENAI_API_KEY}"
    auth_type: "bearer"

  anthropic:
    type: "anthropic"
    base_url: "https://api.anthropic.com"
    api_key: "${ANTHROPIC_API_KEY}"
    auth_type: "header"

# Custom model configuration
custom_models:
  - name: "Thinking-Model"
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    description: "Claude Sonnet 4"

  - name: "Sonnet-Model"
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    description: "Claude Sonnet 4"

  - name: "Opus-Model"
    provider: "anthropic"
    model: "claude-opus-4-20250514"
    description: "Claude Opus 4"

  - name: "Haiku-Model"
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"
    description: "Claude 3.5 Haiku"
```

### 4. Start the Server

```bash
npm run dev
```

### 5. Configure Claude Code

**Option 1: Environment Variables**

```bash
# PowerShell
$env:ANTHROPIC_BASE_URL = "http://localhost:3456"
$env:ANTHROPIC_MODEL = "Thinking-Model"

# Linux/macOS
export ANTHROPIC_BASE_URL=http://localhost:3456
export ANTHROPIC_MODEL=Thinking-Model

# Start Claude Code
claude
```

**Option 2: settings.json Configuration**

Configure in Claude Code's settings.json (located at `~/.claude/settings.json` or `%USERPROFILE%\.claude\settings.json`):

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "anykey",
    "ANTHROPIC_BASE_URL": "http://localhost:3456",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "Haiku-Model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "Opus-Model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "Sonnet-Model",
    "ANTHROPIC_REASONING_MODEL": "Thinking-Model"
  },
  "includeCoAuthoredBy": false
}
```

## Web UI Dashboard

After starting the server, access the built-in Web UI dashboard:

```
http://localhost:3456
```

### Features

- 📊 **Statistics Overview** - View total requests, tokens, and latency metrics
- 📋 **Request History** - Browse all proxied requests with timestamps
- 🔍 **Request Details** - Inspect request/response payloads in raw or parsed view
- 📈 **Model Distribution** - See usage breakdown by model

### Screenshot

The dashboard provides a clean interface to monitor your Claude Code usage and debug requests.

## Custom Model Configuration

### Configuration Fields

| Field | Description |
|-------|-------------|
| `name` | Custom model name for Claude Code to use |
| `provider` | Provider name (must be defined in providers) |
| `model` | Actual model name to call |
| `description` | Model description (optional, displayed in UI) |

### Configuration Example

```yaml
custom_models:
  # Use OpenAI's GPT-4
  - name: "Smart-Model"
    provider: "openai"
    model: "gpt-4"
    description: "GPT-4"

  # Use Anthropic's Claude
  - name: "Claude-Model"
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    description: "Claude Sonnet 4"
```

### Switching Models in Claude Code

```bash
# Switch to Haiku model
$env:ANTHROPIC_MODEL = "Haiku-Model"

# Switch to custom model
$env:ANTHROPIC_MODEL = "Smart-Model"
```

## Routing Rules

For models not defined in `custom_models`, the `routes` configuration is used for matching:

```yaml
routes:
  - pattern: "*"
    provider: "anthropic"
```

Routing rules support wildcards:
- `claude-*` - Matches all models starting with `claude-`
- `*` - Matches all models (default route)

## Provider Types

| Type | Description |
|------|-------------|
| `anthropic` | Anthropic Claude API format (passthrough) |
| `openai` | OpenAI API format (automatic format conversion) |

### Authentication Methods

| auth_type | Description |
|-----------|-------------|
| `header` | Use `x-api-key` request header (default) |
| `bearer` | Use `Authorization: Bearer` request header |

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/messages` | Claude API proxy endpoint |
| `GET /v1/models` | Get available custom model list |
| `GET /api/stats` | Statistics data |
| `GET /api/requests` | Request list |
| `GET /api/requests/:id` | Request details |

## Usage Examples

### View Available Models

```bash
curl http://localhost:3456/v1/models
```

### Send Request

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "model": "Thinking-Model",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Project Structure

```
claude-proxy/
├── src/
│   ├── index.ts           # Entry point
│   ├── config/            # Configuration loading
│   ├── proxy/             # Proxy handling
│   ├── router/            # Model routing
│   │   └── providers/     # LLM adapters
│   ├── storage/           # SQLite storage
│   └── webui/             # Web UI
│       └── static/        # Frontend files
├── config.yaml            # Configuration file
└── package.json
```

## Development

```bash
# Development mode (hot reload)
npm run dev

# Build
npm run build

# Production
npm start
```

## License

MIT

---

# 中文文档

Claude Code API 代理服务，支持自定义模型名、多模型路由、请求分析和统计监控。

## 功能特性

- **自定义模型名** - 定义易记的模型名（如 `my-smart-model`），自动映射到真实模型
- **多模型路由** - 根据模型名自动路由到不同 API 提供商
- **请求/响应解析** - 解析 Claude Code 的请求结构（messages、tools、thinking 等）
- **统计监控** - Token 用量、延迟、模型分布统计
- **历史记录** - SQLite 持久化存储所有请求
- **Web UI** - 现代美观的嵌入式仪表盘，支持原始/解析视图切换

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 生成配置文件

```bash
npx tsx src/index.ts --generate-config
```

### 3. 编辑配置文件

编辑 `config.yaml`，配置你的 API 提供商和自定义模型：

```yaml
server:
  host: "0.0.0.0"
  port: 3456

providers:
  jdcloud:
    type: "anthropic"
    base_url: "https://modelservice.jdcloud.com/coding/anthropic"
    api_key: "${JDCLOUD_API_KEY}"
    auth_type: "bearer"

  zhipucloud:
    type: "anthropic"
    base_url: "https://open.bigmodel.cn/api/anthropic"
    api_key: "${ZHIPU_API_KEY}"
    auth_type: "bearer"

# 自定义模型配置
custom_models:
  - name: "Thinking-Model"
    provider: "jdcloud"
    model: "GLM-5"
    description: "GLM-5"

  - name: "Sonnet-Model"
    provider: "jdcloud"
    model: "GLM-5"
    description: "GLM-5"

  - name: "Opus-Model"
    provider: "jdcloud"
    model: "GLM-5"
    description: "GLM-5"

  - name: "Haiku-Model"
    provider: "jdcloud"
    model: "DeepSeek-V3.2"
    description: "DeepSeek-V3.2"
```

### 4. 启动服务

```bash
npm run dev
```

### 5. 配置 Claude Code

**方式一：环境变量**

```bash
# PowerShell
$env:ANTHROPIC_BASE_URL = "http://localhost:3456"
$env:ANTHROPIC_MODEL = "Thinking-Model"

# Linux/macOS
export ANTHROPIC_BASE_URL=http://localhost:3456
export ANTHROPIC_MODEL=Thinking-Model

# 启动 Claude Code
claude
```

**方式二：settings.json 配置文件**

在 Claude Code 的 settings.json 中配置（位于 `~/.claude/settings.json` 或 `%USERPROFILE%\.claude\settings.json`）：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "anykey",
    "ANTHROPIC_BASE_URL": "http://localhost:3456",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "Haiku-Model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "Opus-Model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "Sonnet-Model",
    "ANTHROPIC_REASONING_MODEL": "Thinking-Model"
  },
  "includeCoAuthoredBy": false
}
```

## Web UI 仪表盘

启动服务后，访问内置的 Web UI 仪表盘：

```
http://localhost:3456
```

### 功能特点

- 📊 **统计概览** - 查看总请求数、Token 用量和延迟指标
- 📋 **请求历史** - 浏览所有代理请求及时间戳
- 🔍 **请求详情** - 检查请求/响应数据（原始或解析视图）
- 📈 **模型分布** - 查看各模型使用情况分布

### 截图

仪表盘提供了简洁的界面，用于监控 Claude Code 使用情况和调试请求。

## 自定义模型配置

### 配置说明

| 字段 | 说明 |
|------|------|
| `name` | 自定义模型名，供 Claude Code 使用 |
| `provider` | 提供商名称（需在 providers 中定义） |
| `model` | 实际调用的模型名 |
| `description` | 模型描述（可选，在 UI 中显示） |

### 配置示例

```yaml
custom_models:
  # 使用京东云的 GLM-5
  - name: "Thinking-Model"
    provider: "jdcloud"
    model: "GLM-5"
    description: "GLM-5"

  # 使用京东云的 DeepSeek
  - name: "Haiku-Model"
    provider: "jdcloud"
    model: "DeepSeek-V3.2"
    description: "DeepSeek-V3.2"

  # 使用智谱云
  - name: "Zhipu-Model"
    provider: "zhipucloud"
    model: "glm-4"
    description: "智谱 GLM-4"
```

### 在 Claude Code 中切换模型

```bash
# 切换到 Haiku 模型
$env:ANTHROPIC_MODEL = "Haiku-Model"

# 切换到智谱模型
$env:ANTHROPIC_MODEL = "Zhipu-Model"
```

## 路由规则

对于未在 `custom_models` 中定义的模型，会使用 `routes` 配置进行匹配：

```yaml
routes:
  - pattern: "*"
    provider: "jdcloud"
```

路由规则支持通配符：
- `claude-*` - 匹配所有以 `claude-` 开头的模型
- `*` - 匹配所有模型（默认路由）

## 提供商类型

| 类型 | 说明 |
|------|------|
| `anthropic` | Anthropic Claude API 格式（直接透传） |
| `openai` | OpenAI API 格式（自动格式转换） |

### 认证方式

| auth_type | 说明 |
|-----------|------|
| `header` | 使用 `x-api-key` 请求头（默认） |
| `bearer` | 使用 `Authorization: Bearer` 请求头 |

## API 端点

| 端点 | 描述 |
|------|------|
| `POST /v1/messages` | Claude API 代理端点 |
| `GET /v1/models` | 获取可用的自定义模型列表 |
| `GET /api/stats` | 统计数据 |
| `GET /api/requests` | 请求列表 |
| `GET /api/requests/:id` | 请求详情 |

## 使用示例

### 查看可用模型

```bash
curl http://localhost:3456/v1/models
```

### 发送请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "model": "Thinking-Model",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 项目结构

```
claude-proxy/
├── src/
│   ├── index.ts           # 入口
│   ├── config/            # 配置加载
│   ├── proxy/             # 代理处理
│   ├── router/            # 模型路由
│   │   └── providers/     # 各 LLM 适配器
│   ├── storage/           # SQLite 存储
│   └── webui/             # Web UI
│       └── static/        # 前端文件
├── config.yaml            # 配置文件
└── package.json
```

## 开发

```bash
# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 生产运行
npm start
```

## License

MIT
