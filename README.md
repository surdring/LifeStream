
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

### 3) 使用 frp 做内网穿透（真实配置：暴露内网 Nginx 3001）

如果你只有一台公网服务器（跑 `frps`），而真正跑 LifeStream 的机器在内网/家里（无法直接公网访问），可以用 `frp` 把内网的 Nginx 入口暴露到公网。

你当前的真实链路是：

- 内网机器：Nginx 监听 `3001`（托管 `dist/`，并把 `/api/` 反代到后端 `127.0.0.1:8787`）
- frpc：把本机 `127.0.0.1:3001` 通过 `http` 代理出去（`subdomain = "lifestream"`）
- frps：对外提供 `vhostHTTPPort = 7080`
- 公网访问：`http://lifestream.tofly.top:7080/`

#### A. 公网服务器（frps）配置

下面以 `frp` 的 TOML 配置为例（你可以按自己的版本改成 ini）。

`frps.toml`（请按你的服务器实际情况填写域名解析与鉴权）：

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

#### B. 内网机器（frpc）配置

`frpc.toml`（保留你当前真实在用的 proxy 配置）：

```toml
serverAddr = "YOUR_FRPS_HOST"
serverPort = 7700

[auth]
method = "token"
token = "PLEASE_CHANGE_ME"

[[proxies]]
name = "lifestream_web"
type = "http"
localIP = "127.0.0.1"
localPort = 3001
subdomain = "lifestream"
```

启动 frpc（示例）：

```bash
./frpc -c frpc.toml
```

然后你就可以通过下面的地址访问：

- `http://lifestream.tofly.top:7080`

#### C. 启动顺序（内网机器）

1. 构建前端：`npm run build`（生成 `dist/`）
2. 启动后端（systemd/手动均可）
3. 启动/重载 Nginx（监听 3001）
4. 启动 frpc：`./frpc -c frpc.toml`

#### D. 注意事项

- 强烈建议为 frp 开启鉴权（token/oidc 等），避免公网被扫到后随意转发。
- 如果你希望去掉 `:7080` 或上 HTTPS，可以在公网服务器用 Nginx 再反代一次（80/443 -> 7080）。

#### E. （推荐）内网机器用 Nginx 作为 frpc 的本地入口

当你希望更稳定地对外提供服务（而不是直接暴露 `npm run dev` 的 Vite 开发服务器），可以在**内网机器**用 Nginx 托管前端 `dist/` 并反代 `/api` 到后端，然后让 `frpc` 的 `localPort` 指向 Nginx。

如果你使用的是宝塔/自定义安装的 Nginx（配置在 `/www/server/nginx/conf/nginx.conf`），通常站点配置文件放在：

- `/www/server/panel/vhost/nginx/*.conf`

按你当前真实配置（`frpc.toml` 的 `localPort = 3001`），推荐按下面步骤配置：

1) 新建 Nginx 站点配置文件（内网机器）

创建文件（名字随意，这里建议用）：

- `/www/server/panel/vhost/nginx/lifestream_3001.conf`

内容如下（直接照抄即可）：

```nginx
server {
  listen 3001;
  server_name _;

  root /home/zhengxueen/workspace/LifeStream/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

2) 确保前端已构建

在项目目录执行（生成 `dist/`）：

```bash
npm run build
```

3) 确保 Nginx 用户 `www` 能读到 `dist/`

你的 `nginx.conf` 顶部是 `user www www;`，所以至少要保证目录可读可进：

```bash
chmod o+rx /home/zhengxueen
chmod -R o+rX /home/zhengxueen/workspace/LifeStream/dist
```

如果你不想给 home 目录放开权限，那就把 `dist/` 复制到 `/www/wwwroot/lifestream/dist` 这类宝塔网站目录（`www` 默认有权限），然后把上面配置里的 `root` 改掉即可。

4) 测试并重载（宝塔 Nginx）

```bash
sudo /www/server/nginx/sbin/nginx -t -c /www/server/nginx/conf/nginx.conf
sudo /www/server/nginx/sbin/nginx -s reload
```

5) 验证

内网机器本机测试：

```bash
curl -I http://127.0.0.1:3001/
curl -I http://127.0.0.1:3001/api/health
```

公网仍然通过 frp：

- `http://lifestream.tofly.top:7080/`

内网机器启动顺序建议：

1. 构建前端：`npm run build`（生成 `dist/`）
2. 启动后端（systemd/手动均可）
3. 启动/重载 Nginx
4. 启动 frpc


- 如果 owner 是你的用户（例如 `zhengxueen`），通常无需 `sudo` 就能 `chmod`
- 如果提示 `Operation not permitted`，再用 `sudo chmod ...`

如果你不想给 home 目录开放 `o+rx` 权限，可以把 `dist/` 复制到宝塔网站目录（例如 `/www/wwwroot/lifestream/dist`），并把 Nginx 的 `root` 改成该路径。

Nginx 启动/重载命令（内网机器）：

```bash
# 如果你是通过系统包管理器安装的 nginx（常见路径 /etc/nginx），可以用 systemd：
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx

# 如果你的 nginx 是宝塔/自定义安装（配置文件在 /www/server/nginx/conf/nginx.conf）：
sudo /www/server/nginx/sbin/nginx -t -c /www/server/nginx/conf/nginx.conf
sudo /www/server/nginx/sbin/nginx -c /www/server/nginx/conf/nginx.conf
sudo /www/server/nginx/sbin/nginx -s reload
```

此时公网访问仍然是：

- `http://lifestream.tofly.top:7080/`

但落到内网侧将变为：frps -> frpc -> **Nginx(3001)** -> 前端静态资源 / `/api` 反代到后端。

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

#### 3) Nginx 配置

本项目推荐用“内网 Nginx 作为入口（监听 `3001`，供 `frpc.toml` 的 `localPort=3001` 指向）”，具体配置见上文：

- `### 3) 使用 frp 做内网穿透` -> `#### E. （推荐）内网机器用 Nginx 作为 frpc 的本地入口`

### 方案 C：Nginx + systemd（推荐）

如果你希望用 systemd 托管后端进程（而不是 PM2），可以按下面方式部署。

约定（按你的需求）：

- **部署目录**：当前工作目录（例如：`/home/zhengxueen/workspace/LifeStream`）
- **运行用户**：你的普通用户（例如：`zhengxueen`）
- **前端**：Nginx 托管 `dist/`，并反代 `/api/` 到本机后端

#### 1) 构建前端

在项目目录执行：

```bash
npm install
npm run build
```

构建产物在 `dist/`。

#### 2) 创建 systemd unit（后端）

创建文件：`/etc/systemd/system/lifestream-server.service`（需要 root 权限）。

将下面的 `WorkingDirectory`、`User/Group` 替换为你的实际值：

```ini
[Unit]
Description=LifeStream Backend API
After=network.target

[Service]
Type=simple

User=zhengxueen
Group=zhengxueen
WorkingDirectory=/home/zhengxueen/workspace/LifeStream

Environment=NODE_ENV=production
Environment=LIFESTREAM_JWT_SECRET=hu0hnn0uwjccc76@yaoshangxian.top
# 可选：如果你不想把 jwt_secret 写进 config.toml，也可以使用环境变量
# Environment=LIFESTREAM_JWT_SECRET=PLEASE_CHANGE_ME
Environment=PATH=/home/zhengxueen/.nvm/versions/node/v24.11.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/zhengxueen/.nvm/versions/node/v24.11.1/bin/npm run server
Restart=on-failure
RestartSec=3
TimeoutStopSec=20

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lifestream-server
sudo systemctl status lifestream-server
```

查看日志：

```bash
sudo journalctl -u lifestream-server -f
```



#### 3) Nginx 配置示例（托管前端 + 反代 /api）

本项目在你的真实部署中使用“内网 Nginx 监听 `3001` + 托管 `dist/` + `/api/` 反代到 `127.0.0.1:8787`”，并由 frp 将公网请求转发到该端口。

Nginx 的 server 配置内容见上文：

- `### 3) 使用 frp 做内网穿透` -> `#### E. （推荐）内网机器用 Nginx 作为 frpc 的本地入口`

改完 Nginx 配置后重载：

```bash
# 如果你是通过系统包管理器安装的 nginx（常见路径 /etc/nginx），可以用 systemd：
sudo nginx -t
sudo systemctl reload nginx

# 如果你的 nginx 是宝塔/自定义安装（配置文件在 /www/server/nginx/conf/nginx.conf）：
sudo /www/server/nginx/sbin/nginx -t -c /www/server/nginx/conf/nginx.conf
sudo /www/server/nginx/sbin/nginx -s reload
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

## 更新代码

```bash
npm install # 可选
npm run build
sudo /www/server/nginx/sbin/nginx -s reload
```