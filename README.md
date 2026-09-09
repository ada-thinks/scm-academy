# 链关学堂

小团队用的供应链闯关学习平台：上传教材或系统手册，生成精讲、脑图、案例和关卡测验。

## 能做什么

- 小团队账号：管理员发课，学员闯关、看进度和排行榜
- 上传 `.md` / `.txt` / `.pdf` / `.docx`
- 生成课程大纲、笔记、知识脑图、业务案例
- 按章闯关（单选 / 多选 / 判断），过关才开下一关
- 经验、三星、成就
- 有 OpenAI 兼容 API Key 时用大模型生成；没有 Key 时也能玩内置课，并按教材结构本地拆关

## 启动

> 本项目用 Next.js 16，需要 Node.js ≥ 20.9。仓库用 `.nvmrc`（`22.23.2`）固定了版本；若装了 nvm，进项目目录先 `nvm use 22.23.2`（或用 fnm/volta 等会自动读取 `.nvmrc` 的工具）即可。

```bash
cd scm-academy
nvm use 22.23.2   # 切到项目固定版本（对应 .nvmrc）
npm install
npx prisma generate
npx prisma db push
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)

演示账号：

- 管理员 `admin` / `admin123`
- 学员 `zhang` 或 `wang` / `learn123`

## 接大模型

在「教材工坊」填写，或改 `.env`：

```
OPENAI_API_KEY=你的key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

DeepSeek 示例：`OPENAI_BASE_URL=https://api.deepseek.com`，模型填 `deepseek-chat`。

## 建议怎么用

1. 先用内置《供应链入门闯关营》走一遍「看教材 → 闯关」
2. 管理员上传一本教材或系统手册
3. 没有 Key 会得到可玩的草稿关；有 Key 会生成更完整的精讲和题目
