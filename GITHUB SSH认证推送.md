# GitHub：SSH 认证并改用 SSH 推送（从 HTTPS 切换）

当你在服务器/机房网络环境中遇到 `git push` 访问 `https://github.com/...` 超时（例如 443 端口无法连接）时，最推荐的方案是：**改用 SSH 方式推送到 GitHub**。

本文记录一套完整可复用的操作流程。

---

## 1. 背景：为什么要从 HTTPS 切到 SSH

如果出现类似报错：

```text
fatal: unable to access 'https://github.com/<owner>/<repo>.git/':
Failed to connect to github.com port 443 ... Couldn't connect to server
```

通常说明：

- 当前机器到 GitHub 的 **HTTPS 443** 出网受限/超时（防火墙、代理、DNS、线路问题等）
- 并非代码或 Git 本身的问题

此时改用 SSH 通道（`git@github.com:...`）往往更容易成功。

---

## 2. 生成 SSH Key（ED25519）

在本机生成一对密钥（私钥 + 公钥）：

```bash
ssh-keygen -t ed25519 -C "你的邮箱" 
```

常用建议：

- **文件路径**：默认保存到 `~/.ssh/id_ed25519`（直接回车即可）
- **passphrase**：可以为空（直接回车两次），也可以设置（更安全）

生成完成后一般会得到：

- 私钥：`~/.ssh/id_ed25519`
- 公钥：`~/.ssh/id_ed25519.pub`

---

## 3. 获取“真正要复制”的公钥

公钥是 `.pub` 文件里以 `ssh-ed25519` 开头的那一整行，例如：

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... your_email@example.com
```

查看公钥：

```bash
cat ~/.ssh/id_ed25519.pub
```

### 3.1 常见误区：fingerprint 不是公钥

`ssh-keygen` 输出中的：

```text
SHA256:xxxxxxxxxxxxxxxx
```

这是 **指纹（fingerprint）**，用于核对公钥，不是要粘贴到 GitHub 的公钥文本。

---

## 4. 将公钥添加到 GitHub

1. 打开 GitHub：
   - `Settings` -> `SSH and GPG keys` -> `New SSH key`
2. `Title` 随便填（例如：`lifestream-server`）
3. `Key` 粘贴第 3 节 `cat ~/.ssh/id_ed25519.pub` 的完整输出
4. 保存

---

## 5. 验证 SSH 是否认证成功

运行：

```bash
ssh -T git@github.com
```

如果看到类似输出：

```text
Hi <username>! You've successfully authenticated, but GitHub does not provide shell access.
```

说明：

- **认证成功**（你的 key 已被 GitHub 接受）
- GitHub 不提供 shell，所以会提示 `does not provide shell access`，且常见会返回非 0 退出码
- 这不是错误，属于正常现象

---

## 6. 把 Git Remote 从 HTTPS 切换到 SSH

先查看当前 remote：

```bash
git remote -v
```

如果看到类似：

```text
origin  https://github.com/<owner>/<repo>.git (fetch)
origin  https://github.com/<owner>/<repo>.git (push)
```

把 `origin` 改成 SSH：

```bash
git remote set-url origin git@github.com:<owner>/<repo>.git
```

再次确认：

```bash
git remote -v
```

应该变为：

```text
origin  git@github.com:<owner>/<repo>.git (fetch)
origin  git@github.com:<owner>/<repo>.git (push)
```



---

## 7. 推送代码



直接推送即可：

```bash
git push
```

如果是首次推送某个分支，也可以：

```bash
git push -u origin main
```

6、7合并命令：

```bash
git remote -v
git remote set-url origin git@github.com:surdring/LifeStream.git
git remote -v
git push
```
---

## 8. 常见问题排查

### 8.1 `cat ~/.ssh/id_ed25519.pub` 和 `ssh-keygen -lf` 输出不一致？

这是正常的：

- `cat ~/.ssh/id_ed25519.pub`：输出 **公钥原文**（很长的 `AAAAC3...`）
- `ssh-keygen -lf ~/.ssh/id_ed25519.pub`：输出 **指纹（fingerprint）**（`SHA256:...`）

它们本来就不会长得一样。

### 8.2 确认私钥和公钥是否配对

从私钥导出公钥（用于核对）：

```bash
ssh-keygen -y -f ~/.ssh/id_ed25519
```

这条命令输出的公钥应与：

```bash
cat ~/.ssh/id_ed25519.pub
```

一致（末尾注释 comment 可能略有差异）。

### 8.3 多次生成 key 覆盖导致公钥变化

如果你生成 key 时选择了覆盖：

```text
/home/user/.ssh/id_ed25519 already exists.
Overwrite (y/n)? y
```

那么旧的 key 会被替换，`.pub` 文件内容也会改变。

### 8.4 还是 push 失败怎么办？

- 确认 `ssh -T git@github.com` 已成功认证
- 确认 `git remote -v` 的 push URL 已是 `git@github.com:...`
- 检查是否存在 SSH 代理/权限问题（例如密钥权限过宽）：

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

---

## 9.（可选）为 SSH 连接写一个 config

如果你未来会用多把 key 或多个 GitHub 账号，可以在 `~/.ssh/config` 增加：

```sshconfig
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

---

## 10. 快速复盘（最短路径）

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
cat ~/.ssh/id_ed25519.pub
# 把上面输出粘贴到 GitHub SSH keys
ssh -T git@github.com

git remote set-url origin git@github.com:<owner>/<repo>.git
git push
```
