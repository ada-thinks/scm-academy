#!/usr/bin/env bash
# 本地打包：把代码 + 数据库 + data/ 打成一个 tar.gz，用于上传服务器。
# 在项目根目录运行（Windows 用 Git Bash）。
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="scm-academy-deploy.tar.gz"

tar -czf "$OUT" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='*.err' \
  --exclude='.devserver*' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='scm-academy-deploy.tar.gz' \
  .

echo "==> 已打包：$OUT"
echo "==> 上传命令：scp $OUT root@<服务器IP>:/root/"
