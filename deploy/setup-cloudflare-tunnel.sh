#!/usr/bin/env bash
# Cloudflare Quick Tunnel（方案 B）：免备案 HTTPS 公网访问
# 在服务器执行: cd /opt/scm-academy && bash deploy/setup-cloudflare-tunnel.sh
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3000}"
INSTALL_DIR="/usr/local/bin"

echo "==> 检查本机应用 $APP_URL"
if ! curl -sf -o /dev/null --max-time 3 "$APP_URL"; then
  echo "WARN: $APP_URL 无响应，请先: cd /opt/scm-academy && pm2 status" >&2
fi

install_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    return 0
  fi
  echo "==> 安装 cloudflared（优先 apt 源，避免 GitHub 超时）"
  if [ ! -f /usr/share/keyrings/cloudflare-main.gpg ]; then
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  fi
  if [ ! -f /etc/apt/sources.list.d/cloudflared.list ]; then
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  fi
  sudo apt-get update -qq
  if sudo apt-get install -y cloudflared; then
    return 0
  fi
  echo "==> apt 失败，尝试下载 deb 包"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) deb="cloudflared-linux-amd64.deb" ;;
    aarch64) deb="cloudflared-linux-arm64.deb" ;;
    *) echo "不支持的架构: $arch" >&2; exit 1 ;;
  esac
  tmp="/tmp/$deb"
  for url in \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/$deb" \
    "https://ghproxy.net/https://github.com/cloudflare/cloudflared/releases/latest/download/$deb"; do
    if curl -fsSL --connect-timeout 30 "$url" -o "$tmp"; then
      sudo dpkg -i "$tmp"
      rm -f "$tmp"
      return 0
    fi
  done
  echo "cloudflared 安装失败，请检查服务器出网或手动安装" >&2
  exit 1
}
install_cloudflared

cloudflared -v

echo ""
echo "==> 安装 systemd 服务（开机/崩溃后自动拉起隧道）"
sudo tee /etc/systemd/system/cloudflared-quick.service >/dev/null <<EOF
[Unit]
Description=Cloudflare Quick Tunnel to scm-academy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(command -v cloudflared) tunnel --url ${APP_URL}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cloudflared-quick.service
sudo systemctl restart cloudflared-quick.service

sleep 3
echo ""
echo "==> 从日志里找公网 HTTPS 地址（含 trycloudflare.com）:"
sudo journalctl -u cloudflared-quick.service -n 40 --no-pager | grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1 || true

echo ""
echo "若上面没有链接，执行:"
echo "  sudo journalctl -u cloudflared-quick.service -f"
echo "  （看到 https://....trycloudflare.com 后 Ctrl+C）"
echo ""
echo "停止隧道: sudo systemctl stop cloudflared-quick.service"
echo "再次查看链接: sudo journalctl -u cloudflared-quick.service | grep trycloudflare.com | tail -1"
