<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LifeStream

一个本地优先的 AI 日志/复盘应用：记录每日日志、生成日报/周报/月报/年报，并从日志里提炼康奈尔式“线索区（Cues）”（关键词 / 自测问题 / 行动项 / 证据）。

## 架构概览

- **前端**：Vite + React（默认端口 `3000`）
- **后端**：Express API（默认端口 `8787`）
- **存储**：Postgres（自动建表）
- **LLM**：
  - `llamacpp`：调用 OpenAI 兼容接口（例如本机 llama.cpp server）
  - `provider`：调用兼容 OpenAI Chat Completions 的第三方服务（需要 API Key）

前端通过 Vite Proxy 将 `/api/*` 转发到后端（见 `vite.config.ts`）。

## 本地运行（推荐）

### 1. 前置条件

- Node.js（建议 18+）
- Postgres（建议 14+）
- 二选一的 LLM 后端：
  - llama.cpp / 任意 OpenAI 兼容推理服务（本项目默认配置为 `llamacpp`）
  - 或 provider（你自己的 OpenAI 兼容服务 + API Key）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 `config.toml`

把示例配置复制一份：

```bash
cp config.toml.example config.toml
```

然后按你的环境修改：

- `[server]`：后端监听地址/端口（默认 `127.0.0.1:8787`）
- `[postgres]`：你的 Postgres 连接信息
- `[llm]`：选择 `llm_provider = "llamacpp"` 或 `"provider"`
- 若选择 `llamacpp`：填写 `[llamacpp].baseUrl / model / temperature`（可选 `api_key`）
- 若选择 `provider`：填写 `[provider].base_url / model_id / api_key`

安全提示：

- **不要把真实密码/Key 提交到仓库**。

### 4. 准备数据库

确保目标数据库存在（后端启动时会自动建表，但不会自动创建数据库）：

```bash
createdb -h 127.0.0.1 -p 5432 -U postgres lifestream
```

如果你的数据库名不同，请同步修改 `config.toml` 的 `[postgres].database`。

### 5. 启动后端

一个终端运行：

```bash
npm run dev:server
```

健康检查：

- `GET http://127.0.0.1:8787/api/health`

### 6. 启动前端

另一个终端运行：

```bash
npm run dev
```

打开：

- `http://127.0.0.1:3000`

## 部署（生产环境）

本项目的后端目前**只提供 API**（`server/index.ts` 没有托管前端静态文件），因此推荐按“前后端分离”方式部署：

- **前端**：构建后作为纯静态站点部署（Nginx/对象存储/CDN 等均可）
- **后端**：Node 进程常驻（PM2 / systemd / 容器均可）
- **反向代理**：Nginx 把 `/api` 转发到后端，其余路径返回前端静态资源

### 方案 A：Nginx + PM2（推荐）

#### 1) 构建前端静态资源

```bash
npm install
npm run build
```

构建产物在 `dist/`。

#### 2) 运行后端

确保部署机器上也有 `config.toml`（可从 `config.toml.example` 复制后修改）。

用 PM2 启动：

```bash
npm install
npm run server
```

或者（推荐）交给 PM2 管理：

```bash
npm install
pm2 start "npm run server" --name lifestream-server
pm2 save
```

后端默认监听 `127.0.0.1:8787`，建议只在本机监听并由 Nginx 反代。

#### 3) Nginx 配置示例

将前端 `dist/` 放到例如 `/var/www/lifestream/dist`，并配置：

```nginx
server {
  listen 80;
  server_name your.domain.com;

  # 前端静态资源
  root /var/www/lifestream/dist;
  index index.html;

  # API 反代
  location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # SPA 路由回退
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

### 方案 B：只部署后端（给前端单独域名/平台）

如果你把前端部署在 Vercel/Netlify 等平台，记得配置：

- 将前端请求的 `/api` 反代到你的后端域名
- 或直接在前端环境里把 API base 指向后端（本项目当前默认走 `/api` 相对路径 + 反代）

## 常见问题

### 1) “No logs found for this period.”

说明该日期范围内没有日志数据。先在“每日日志”里写入日志，再生成报表/线索。

### 2) LLM 调用失败（llama.cpp/provider）

请检查 `config.toml`：

- `llm.llm_provider` 是否与对应段落（`[llamacpp]` 或 `[provider]`）匹配
- `baseUrl/base_url` 是否可从后端机器访问
- `api_key` 是否正确

