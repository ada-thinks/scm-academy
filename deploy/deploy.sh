#!/usr/bin/env bash
# 服务器部署：装依赖 -> 建库 -> 构建 -> pm2 启动。在项目根目录运行。
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "未安装 Node，请先运行 deploy/setup-server.sh" >&2
  exit 1
fi
echo "==> Node $(node -v)"

# 1. 生成 .env（首次）
if [ ! -f .env ]; then
  cp deploy/env.production .env
  SECRET=$(openssl rand -base64 32)
  sed -i "s|__AUTH_SECRET__|$SECRET|" .env
  echo "==> 已生成 .env（AUTH_SECRET 已随机）。OPENAI_API_KEY 可稍后登录 admin 在页面填。"
fi

# 2. 依赖 + 建库 + 构建
# 若 lock 里是公司内网 Nexus 地址，公网服务器无法解析，改回 npm 官方源
if grep -q 'nexus.linklogis.cn' package-lock.json 2>/dev/null; then
  echo "==> package-lock 含内网 Nexus 地址，已切换为 registry.npmjs.org"
  sed -i 's|http://nexus.linklogis.cn/repository/lls-npm/|https://registry.npmjs.org/|g' package-lock.json
fi

echo "==> 安装依赖"
npm ci --registry=https://registry.npmjs.org

echo "==> 生成 Prisma Client + 同步数据库"
npx prisma generate
npx prisma db push

if [ ! -f .next/BUILD_ID ]; then
  echo "未找到 .next/BUILD_ID。请在 Windows 本地执行:" >&2
  echo "  .\\deploy\\build-local.ps1" >&2
  echo "  .\\deploy\\push-next.ps1" >&2
  echo "首次部署请先 .\\deploy\\push-and-deploy.ps1（会带上 .next）" >&2
  exit 1
fi
echo "==> 使用已上传的 .next，不在服务器上构建"

# 3. 启动
if ! command -v pm2 >/dev/null 2>&1; then
  echo "未安装 pm2，请先运行 deploy/setup-server.sh" >&2
  exit 1
fi
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "==> 部署完成。访问 http://<服务器公网IP>:3000"
pm2 status
