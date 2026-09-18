# 方案 B：Cloudflare Quick Tunnel（免备案 HTTPS）

家里、学校、手机流量都能访问，只要隧道在跑。

## 前提

- 应用已启动：`pm2 status` → `scm-academy` 为 **online**
- 本机可访问：`curl -I http://127.0.0.1:3000/`

## 一键安装（SSH 登录服务器）

```bash
cd /opt/scm-academy
bash deploy/setup-cloudflare-tunnel.sh
```

脚本会安装 `cloudflared` 并启用 **systemd 服务** `cloudflared-quick`。

## 拿到公网链接

```bash
sudo journalctl -u cloudflared-quick.service | grep trycloudflare.com | tail -1
```

或实时看日志直到出现 `https://xxxx.trycloudflare.com`：

```bash
sudo journalctl -u cloudflared-quick.service -f
```

把该 **https** 链接发给评委即可（不要带 `:3000`）。

## 常用命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `sudo systemctl status cloudflared-quick` |
| 重启隧道 | `sudo systemctl restart cloudflared-quick` |
| 停止隧道 | `sudo systemctl stop cloudflared-quick` |
| 重启后链接可能变 | 再执行一次 `journalctl ... grep trycloudflare` |

## 注意

- **重启隧道或服务器** 后，Quick Tunnel 的网址**可能会变**，需重新查日志。
- 隧道只负责 HTTPS 入口，**Next 仍由 pm2 监听 3000**。
- 比赛结束：`sudo systemctl disable --now cloudflared-quick.service`

## 本机没有最新脚本时

在 Windows PowerShell：

```powershell
scp -i $env:USERPROFILE\.ssh\scm_academy_deploy D:\lls\project\scm-academy\deploy\setup-cloudflare-tunnel.sh root@47.106.215.66:/opt/scm-academy/deploy/
```

再在服务器执行上面的 `bash deploy/setup-cloudflare-tunnel.sh`。
