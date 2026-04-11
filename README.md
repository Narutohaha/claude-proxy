# Claude Proxy

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
