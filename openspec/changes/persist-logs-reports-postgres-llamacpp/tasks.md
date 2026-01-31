## 1. 后端工程与依赖

- [ ] 1.1 在仓库中新增本地后端服务目录与入口文件（TypeScript），并确定运行端口/host 的默认值与可配置方式
- [ ] 1.2 为后端增加所需依赖（HTTP 框架、CORS、PostgreSQL 客户端、TOML 解析、参数校验等）并更新根 `package.json` scripts（例如新增 `dev:server`）
- [ ] 1.3 增加后端的基础工程约束（tsconfig/构建或运行时方案）以支持本地开发与生产运行

## 2. TOML 配置读取（config.toml）

- [ ] 2.1 定义 `config.toml` 的字段结构（Postgres、llama.cpp、server listen 等）与 TypeScript 类型
- [ ] 2.2 实现启动时从项目根目录读取 `config.toml` 并进行校验（缺失/非法字段 fail-fast，错误信息可诊断）
- [ ] 2.3 为配置读取增加最小的单元/冒烟验证（例如缺失文件、缺失字段、非法 URL/端口）

## 3. PostgreSQL 持久化与初始化

- [ ] 3.1 设计并实现 `logs` 与 `reports` 表的建表 SQL（含索引/约束），满足 spec 要求字段：logs 包含 `dateKey`，reports 包含 `type/periodStart/periodEnd/content/createdAt`
- [ ] 3.2 实现数据库初始化机制（启动时自动创建表，或提供单独 init 命令），并在失败时输出可诊断错误
- [ ] 3.3 实现 logs 的存取接口：按 date 范围查询（inclusive）、新增、更新、删除
- [ ] 3.4 实现 reports 的存取接口：按 type 查询列表、按 `(type, periodStart, periodEnd)` 去重策略（返回已存在或冲突错误）

## 4. llama.cpp Provider（HTTP）

- [ ] 4.1 实现 llama.cpp HTTP client adapter（基于 `config.toml` 的 `baseUrl`/`model`），并设置超时与错误映射
- [ ] 4.2 实现报表 prompt 构造：日志按 `timestamp` 升序、支持 `language=en|zh` 的输出指令
- [ ] 4.3 实现对 llama.cpp 不可达/返回不可解析内容的处理，确保前端得到可诊断错误

## 5. 本地后端 API 路由

- [ ] 5.1 实现 `GET /api/health` 健康检查
- [ ] 5.2 实现 logs API：`GET /api/logs?start&end`、`POST /api/logs`、`PUT /api/logs/:id`、`DELETE /api/logs/:id`
- [ ] 5.3 实现 reports API：`GET /api/reports?type=`、`POST /api/reports/generate`（生成 + 落库 + 返回）
- [ ] 5.4 统一错误响应格式（JSON）与状态码（400/404/409/500/503 等），并确保参数校验完整

## 6. 前端集成与替换 localStorage/Gemini

- [ ] 6.1 新增前端 API client（fetch 封装）并定义与后端一致的数据类型
- [ ] 6.2 改造 `AppStateContext`：初始化从后端加载 logs/reports；`addLog/updateLog/deleteLog/addReport` 改为调用后端并同步前端状态
- [ ] 6.3 改造 `ReportsView`：生成报表改为调用 `POST /api/reports/generate`，并保留现有 UI 交互与错误提示
- [ ] 6.4 移除或停用 `services/geminiService.ts` 的默认路径，确保不再依赖 `GEMINI_API_KEY`

## 7. 本地运行验证

- [ ] 7.1 提供最小可复现的本地启动步骤（Postgres + llama.cpp server + 后端 + 前端），并完成一次端到端冒烟（写日志->生成报表->刷新后仍可读取）
- [ ] 7.2 覆盖关键失败场景的手工验证：Postgres 连接失败、llama.cpp 不可用、重复生成同周期报表
