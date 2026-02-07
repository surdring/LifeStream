
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
- `[auth]`：鉴权配置
  - `jwt_secret`：JWT 签名密钥（**长度至少 16**；建议使用强随机字符串；生产环境不要泄露/不要提交到仓库）
- `[postgres]`：你的 Postgres 连接信息
- `[llm]`：选择 `llm_provider = "llamacpp"` 或 `"provider"`
- 若选择 `llamacpp`：填写 `[llamacpp].baseUrl / model / temperature`（可选 `api_key`）
- 若选择 `provider`：填写 `[provider].base_url / model_id / api_key`

安全提示：

- **不要把真实密码/Key 提交到仓库**。
- 你也可以通过环境变量提供 JWT 密钥：`LIFESTREAM_JWT_SECRET`

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

- `http://127.0.0.1:3001`

首次打开会进入登录页：

- 如果是第一次使用（系统只有默认用户且未设置密码），会提示“初始化管理员账号”（bootstrap）
- 初始化完成后会自动登录

说明：

- 鉴权启用后，除 `/api/health` 与 `/api/auth/*` 外，所有 `/api/*` 都需要登录（Bearer Token）
- 历史已有的日志/报表数据会自动归属到默认用户（`default`）下

## 开发/运维辅助

### 1) 清空测试数据（日志 + 报表）

当你用本项目做功能测试，想一键清空“测试生成的日志和报表”时，可以运行：

```bash
npm run clear:test-data
```

该脚本会读取 `config.toml` 连接 Postgres，并执行：

- 清空表 `logs`
- 清空表 `reports`

为了避免误删，默认会要求你输入 `DELETE` 才会继续。

如果你确认要跳过交互提示（**非常谨慎使用**）：

```bash
npm run clear:test-data -- --yes
```

注意：这是“全表清空”，请只对测试库使用。

### 2) 删除报表

在“洞察与报表”页面，每条报表右上角提供“删除”按钮。

对应后端接口：

- `DELETE /api/reports/:id`
  - 成功返回 `204`
  - 报表不存在返回 `404`

### 3) 使用 frp 做内网穿透（推荐只暴露前端 3000）

如果你只有一台“便宜公网服务器”，而真正跑 LifeStream 的机器在内网/家里（无法直接公网访问），可以用 `frp` 把内网的前端 dev server 暴露到公网。

推荐做法：

- **只暴露前端 Vite（3000）**
- 后端（8787）与数据库保持只在内网监听
- 浏览器访问公网域名 -> frp -> 内网 Vite（3000）
- 浏览器请求的 `/api/*` 会先到 Vite，再由 Vite Proxy 转发到同机后端 `127.0.0.1:8787`

这样做的好处：

- 公网侧只需要开一个入口（3000/HTTP 域名）
- 后端端口不直接暴露，安全性更好

#### A. 公网服务器（frps）示例配置

下面以 `frp` 的 TOML 配置为例（你可以按自己的版本改成 ini）。

`frps.toml`：

```toml
bindPort = 7700

# HTTP 虚拟主机端口（可自定义；如果你没有 80/443 权限，用 7080 之类也可以）
vhostHTTPPort = 7080

# 强烈建议开启鉴权（示例使用 token）
[auth]
method = "token"
token = "PLEASE_CHANGE_ME"
```

启动 frps（示例）：

```bash
./frps -c frps.toml
```

#### B. 内网机器（frpc）示例配置

`frpc.toml`：

```toml
serverAddr = "47.96.159.100"
serverPort = 7700

[auth]
method = "token"
token = "PLEASE_CHANGE_ME"

[[proxies]]
name = "lifestream-web"
type = "http"
localIP = "127.0.0.1"
localPort = 3000

# 方式 1：使用自定义域名（推荐）
customDomains = ["lifestream.tofly.top"]
```

启动 frpc（示例）：

```bash
./frpc -c frpc.toml
```

然后你就可以通过类似下面的地址访问：

- `http://lifestream.tofly.top:7080`

#### C. 启动顺序（内网机器）

1. 启动 Postgres / LLM（按你的环境）
2. 启动后端：`npm run dev:server`
3. 启动前端：`npm run dev`
4. 启动 frpc：`./frpc -c frpc.toml`

#### D. 注意事项

- Vite 对 Host Header 有校验。如果你用 frp 域名访问遇到 403，需要在 `vite.config.ts` 的 `server.allowedHosts` 里加入对应域名/公网 IP（本项目已预留该配置）。
- 强烈建议为 frp 开启鉴权（token/oidc 等），避免公网被扫到后随意转发。
- 这是“开发/临时对外访问”方案。生产环境更推荐：构建前端 + Nginx 反代 `/api`（见下方“部署（生产环境）”）。

### 4) 创建新用户（管理员操作）

当前项目默认不提供“开放注册”。

- 首次进入前端登录页会进行 bootstrap：把默认用户 `default` 设置为管理员账号
- 后续新增用户需要使用管理员账号调用接口创建

#### A. 管理员登录获取 JWT

```bash
curl -s -X POST http://127.0.0.1:8787/api/auth/login \
  -H "content-type: application/json" \
  -d '{"username":"surdring","password":"YOUR_PASSWORD"}'
```

返回中会包含 `token`（JWT 形如 `xxx.yyy.zzz`）。

#### B. 用 JWT 创建新用户

```bash
curl -s -X POST http://127.0.0.1:8787/api/auth/register \
  -H "content-type: application/json" \
  -H "authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"username":"surdring001","password":"123456","isAdmin":false}'
```

成功会返回 `201`，并返回新用户信息（不包含密码）。

#### C. 常见错误

- `401 Unauthorized`：没带 token / token 不是有效 JWT / token 过期
- `403 Forbidden`：登录的是普通用户（非管理员），无权创建新用户
- `409 Username already exists.`：用户名重复

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

