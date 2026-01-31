## Why

当前 LifeStream 的日志（logs）与报表（reports）仅存储在浏览器 `localStorage`，且报表生成依赖云端 Gemini API（需要 `process.env.API_KEY`）。为了实现离线可用、可控的数据持久化与本地大模型推理，需要把日志/报表落盘到本地 PostgreSQL，并改为调用本机部署的 llama.cpp（HTTP server），同时将模型信息与数据库连接信息统一从项目根目录 `config.toml` 读取。

## What Changes

- 新增一个本地后端服务（运行在本机），为前端提供日志/报表的读写 API，并负责连接本地 PostgreSQL 进行持久化。
- 新增 PostgreSQL 数据表/初始化逻辑：
  - 日志表：保留 `dateKey (YYYY-MM-DD)` 分组字段，以及 `id/timestamp/content/tags` 等字段。
  - 报表表：保存 `type/periodStart/periodEnd/content/createdAt`。
- 新增从项目根目录 `config.toml` 读取配置的机制：
  - Postgres 连接信息（host/port/user/password/database 或 DSN）。
  - llama.cpp 模型/服务信息（例如 baseUrl、model 名称、请求参数等）。
- 将现有报表生成从 `services/geminiService.ts` 迁移为调用本地 llama.cpp HTTP 服务（不再依赖外部云端 API Key）。
- 调整前端状态管理：日志/报表默认从后端 API 读取并写入（不再以 `localStorage` 作为权威存储）。

## Capabilities

### New Capabilities

- `local-backend-api`: 提供本地后端 API，用于日志/报表的增删改查与按时间范围查询，为前端提供统一的数据访问层。
- `postgres-persistence`: 将日志与报表持久化到本地 PostgreSQL（包含建表/初始化），并确保日志包含 `dateKey` 分组字段、报表包含指定字段集合。
- `toml-config`: 从项目根目录 `config.toml` 读取数据库与模型配置，并对缺失/非法配置给出明确错误。
- `llamacpp-llm-provider`: 通过 HTTP 调用本地 llama.cpp server 生成报表内容，并在失败时提供可诊断的错误信息。

### Modified Capabilities

- （无，当前仓库 `openspec/specs/` 为空）

## Impact

- 代码影响范围：
  - 前端：`context/AppStateContext.tsx`（数据读写路径）、`components/ReportsView.tsx`（报表生成触发）、`services/geminiService.ts`（替换/迁移为 llama.cpp provider）。
  - 后端：新增本地服务与数据库访问层、SQL/迁移/初始化逻辑。
- 新增依赖：PostgreSQL 客户端库、TOML 解析库，以及本地服务框架/路由（取决于实现）。
- 运行方式变化：需要本机启动 PostgreSQL 与本地后端服务；前端通过 HTTP 访问后端（浏览器环境无法直接连接 Postgres）。
- 数据迁移：如需保留历史 `localStorage` 数据，可能需要一次性导入/迁移策略（在设计阶段明确）。
