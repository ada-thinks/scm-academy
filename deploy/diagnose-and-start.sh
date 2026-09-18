#!/usr/bin/env bash
# 在服务器上运行：cd /opt/scm-academy && bash deploy/diagnose-and-start.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

echo "==> 目录: $APP_DIR"
echo "==> Node: $(node -v 2>/dev/null || echo MISSING)"

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: 没有 .next/BUILD_ID。请在 Windows 执行: .\\deploy\\push-next.ps1" >&2
  exit 1
fi

if grep -q 'nexus.linklogis.cn' package-lock.json 2>/dev/null; then
  sed -i 's|http://nexus.linklogis.cn/repository/lls-npm/|https://registry.npmjs.org/|g' package-lock.json
fi

if [ ! -d node_modules ]; then
  echo "==> 安装依赖"
  npm ci --registry=https://registry.npmjs.org
fi

if [ ! -f .env ]; then
  cp deploy/env.production .env
  sed -i "s|__AUTH_SECRET__|$(openssl rand -base64 32)|" .env
fi

npx prisma generate
npx prisma db push

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 3000/tcp || true
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> 安装 pm2"
  npm i -g pm2
fi

pm2 delete scm-academy 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "==> 本机探测"
sleep 2
curl -sI --max-time 5 http://127.0.0.1:3000/ | head -5 || echo "本机 3000 无响应，看 pm2 logs"

echo ""
echo "==> 监听端口"
ss -tlnp | grep 3000 || true
pm2 status

echo ""
echo "若本机 curl 有 HTTP/1.1 200/307，但外网打不开："
echo "  请到阿里云 ECS -> 安全组 -> 入方向 放行 TCP 3000（来源 0.0.0.0/0）"
