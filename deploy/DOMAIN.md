# 域名接入说明（阿里云 ECS + 本项目）

## 1. 准备域名

- 在阿里云「域名」或其它注册商购买域名。
- **服务器在中国大陆**：域名需完成 **ICP 备案**，否则 80/443 可能被拦截（阿里云控制台有备案入口）。
- **香港/海外机**：一般不需要大陆备案，以服务商规则为准。

## 2. DNS 解析

在域名控制台添加 **A 记录**：

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | `@` 或 `www` | `47.106.215.66` |

- 只绑 `www`：主机记录填 `www`，访问 `https://www.你的域名`。
- 根域名和 www 都要：各加一条 A，或 `@` + `www` 都指向同一 IP。

生效时间：几分钟到 48 小时，可用 `ping 你的域名` 看是否已是 `47.106.215.66`。

## 3. 安全组

入方向放行：

- **TCP 80**（HTTP）
- **TCP 443**（HTTPS，上证书后需要）

**3000** 可只对内网或关闭公网访问，外网通过 Nginx 访问即可。

## 4. 服务器安装 Nginx 反代

SSH 登录后：

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

编辑配置（把 `YOUR_DOMAIN` 换成真实域名）：

```bash
sudo cp /opt/scm-academy/deploy/nginx-scm-academy.conf.example /etc/nginx/sites-available/scm-academy
sudo sed -i 's/YOUR_DOMAIN/你的域名/g' /etc/nginx/sites-available/scm-academy
sudo ln -sf /etc/nginx/sites-available/scm-academy /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl reload nginx
```

确认 pm2 仍在跑：`pm2 status`，本机：`curl -I http://127.0.0.1:3000/`。

浏览器先测：**http://你的域名**（应能打开，和 :3000 同一站点）。

## 5. HTTPS（推荐）

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名 -d www.你的域名
```

按提示选重定向到 HTTPS。证书会自动续期。

## 6. 以后更新代码

域名不变，仍用本机 `.\deploy\push-next.ps1`，无需改 Nginx。

## 常见问题

- **域名 ping 不到新 IP**：等 DNS 或检查解析是否写错。
- **HTTP 能开 HTTPS 不能**：安全组 443、certbot 是否成功。
- **打开是 Nginx 默认页**：`sites-enabled` 是否链到 `scm-academy`，`server_name` 是否与访问的域名一致。
