## Context

- 当前项目是一个 Vite + React 的纯前端应用：日志（logs）与报表（reports）由 `context/AppStateContext.tsx` 管理，并持久化到浏览器 `localStorage`。
- 报表生成由 `services/geminiService.ts` 调用云端 Gemini（通过 `process.env.API_KEY` / `GEMINI_API_KEY`）。
- 本次变更目标是：
  - 将日志与报表持久化到本地 PostgreSQL。
  - 报表生成改为调用本机部署的 llama.cpp HTTP server。
  - 大模型信息与数据库连接信息统一从项目根目录 `config.toml` 读取。

约束与假设：

- 浏览器环境无法直接连接 PostgreSQL，因此必须引入本地后端服务作为前端与数据库/模型之间的桥梁。
- llama.cpp 以 server 形式运行（HTTP），后端通过 HTTP 调用。
- `config.toml` 为单一配置文件（不区分环境）。

## Goals / Non-Goals

**Goals:**

- 引入本地后端 API，使前端以 HTTP 方式读写日志与报表。
- 将日志与报表作为“权威数据源”持久化到 PostgreSQL：
  - 日志包含 `dateKey (YYYY-MM-DD)` 分组字段，以及 `id/timestamp/content/tags`。
  - 报表包含 `type/periodStart/periodEnd/content/createdAt`。
- 通过 llama.cpp HTTP server 生成报表内容，并由后端统一编排：
  - 拉取指定周期日志 -> 构造 prompt -> 调用 llama.cpp -> 返回与落库。
- 配置读取：从项目根目录 `config.toml` 加载 Postgres 与 llama.cpp 配置，缺失或非法配置时给出清晰报错并 fail-fast。
- 保持现有 UI/交互尽量不变（Daily 录入、Report 生成与历史查看）。

**Non-Goals:**

- 多用户/鉴权/权限模型。
- 云端部署、跨设备同步。
- 高可用/分布式部署与复杂迁移体系。
- 对日志内容进行结构化抽取或额外索引（本次仅实现可靠落库与最小查询）。

## Decisions

- **后端形态：新增 Node.js 本地服务（TypeScript）**
  - 选择理由：当前仓库已有 TS/Node 工具链；本地服务可同时负责 Postgres 连接与 llama.cpp 调用，并为前端提供统一 API。
  - 备选方案：Electron/Tauri 桌面端直连 DB（不符合当前纯 Web 项目形态）；前端直连 DB（浏览器限制）。

- **配置读取：启动时读取并校验 `config.toml`（fail-fast）**
  - 后端进程启动时加载项目根目录 `config.toml`。
  - 校验关键字段（Postgres 连接信息、llama.cpp baseUrl/model、后端监听端口等）。
  - 备选方案：环境变量（当前需求明确要求从 TOML 读取；环境变量仅作为调试可选项，是否支持在实现阶段决定）。

- **llama.cpp 调用协议：优先兼容 OpenAI-style `v1/chat/completions`**
  - 选择理由：llama.cpp 的 server 常提供 OpenAI 兼容接口，生态成熟，便于切换模型服务实现。
  - 后端以 `baseUrl` 组装请求地址，携带 `model` 与 `messages`，并读取返回的文本。
  - 备选方案：llama.cpp 自定义 endpoint（若实际部署不兼容 OpenAI 风格，将在实现阶段在 adapter 层做兼容）。

- **数据模型与表结构：最小满足需求，并便于查询**
  - `logs` 表：
    - 主键 `id`（UUID），`date_key`（DATE），`timestamp_ms`（BIGINT），`content`（TEXT），`tags`（TEXT[] 或 JSONB），`created_at`（TIMESTAMPTZ）。
    - 为 `date_key` 与 `timestamp_ms` 建索引，支持按日期/时间范围查询。
  - `reports` 表：
    - 主键 `id`（UUID），`type`（TEXT/ENUM），`period_start`（DATE），`period_end`（DATE），`content`（TEXT），`created_at_ms`（BIGINT 或 TIMESTAMPTZ）。
    - 为 `(type, period_start, period_end)` 建唯一约束（避免重复生成同一周期的报表，是否覆盖由实现策略决定）。

- **前端数据源：从后端 API 拉取并写入，不再以 `localStorage` 为权威**
  - 前端 `AppStateContext` 调整为：初始化时从 API 获取 logs/reports/todos（本次变更范围主要是 logs/reports；todos 是否一并迁移在实现阶段确认）。
  - 本地缓存策略：可保留 `localStorage` 作为非权威缓存（可选）；权威存储在 Postgres。

- **API 设计（草案）**
  - `GET /api/logs?start=YYYY-MM-DD&end=YYYY-MM-DD`：查询范围内日志（按时间升序）。
  - `POST /api/logs`：新增日志（content/timestamp/tags/dateKey）。
  - `PUT /api/logs/:id` / `DELETE /api/logs/:id`：更新/删除。
  - `GET /api/reports?type=WEEKLY|MONTHLY|YEARLY`：获取报表列表。
  - `POST /api/reports/generate`：生成报表（type/periodStart/periodEnd/language），返回并落库。

## Risks / Trade-offs

- **[本地依赖复杂度提升]** → 提供明确的启动顺序与错误提示；后续可增加一键启动脚本。
- **[llama.cpp API 兼容性差异]** → 在 adapter 层隔离协议；将 endpoint/model/baseUrl 可配置。
- **[日期与时区导致的 dateKey 偏移]** → 明确 `dateKey` 由前端生成并传入（YYYY-MM-DD），后端按 date 解析存储；查询按 date_key 与 timestamp 双重排序。
- **[历史 localStorage 数据丢失]** → 设计阶段明确是否提供一次性导入；若需要，提供“导入接口/脚本”。
- **[重复生成报表]** → 通过 DB 唯一约束与“覆盖/拒绝”策略控制；默认可拒绝并返回已存在报表。

## Migration Plan

- 第 1 步：新增本地后端服务骨架（健康检查、读取 `config.toml`）。
- 第 2 步：实现 Postgres 连接与建表/初始化（应用启动时自动创建表，或提供单独 init 命令）。
- 第 3 步：实现 logs/reports API，并在本地联通测试。
- 第 4 步：实现 llama.cpp provider，并通过 `POST /api/reports/generate` 生成并落库。
- 第 5 步：前端切换到后端 API：
  - `addLog/addReport/getLogsForPeriod` 从本地状态 + localStorage 迁移为 API 调用。
- 可选第 6 步：提供 localStorage -> Postgres 的一次性导入。

回滚策略：

- 运行时回滚：停用后端服务并恢复前端 `localStorage` 路径（保留现有实现）；llama.cpp 调用失败时可降级为“不生成报表并提示错误”。

## Open Questions

- llama.cpp server 的实际地址与接口形态是否严格 OpenAI-compatible（`/v1/chat/completions`）？
- 是否需要保留 Gemini 作为可选 provider（配置开关）？本次 proposal 目标是迁移到 llama.cpp。
- 是否需要将 todos 一并落库（当前 proposal 仅覆盖 logs/reports）？
- 是否必须提供 localStorage 历史数据导入？如果需要，导入触发方式（按钮/脚本）如何设计？
