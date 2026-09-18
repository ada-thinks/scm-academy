#!/usr/bin/env bash
# 服务器初始化：装 Node 22 + pm2。只在服务器上跑一次。
set -euo pipefail

echo "==> 安装 Node 22（NodeSource）"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs git unzip

echo "==> Node 版本"
node -v
npm -v

echo "==> 安装 pm2"
sudo npm i -g pm2

echo "==> 完成。下一步：把代码传到服务器，运行 deploy/deploy.sh"
