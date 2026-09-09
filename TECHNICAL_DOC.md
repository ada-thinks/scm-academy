# 链关学堂（scm-academy）项目技术文档

> 用途说明：本文档面向「接手的 AI / 新开发者」，用来快速建立项目全貌。可直接作为上下文投喂给大模型，或让 AI 阅读后再开始改动代码。
> 最后校验时间：2026-09（内容与当时代码一致，改动代码后请同步更新）。

---

## 0. 一段话背景

链关学堂是一个**小团队用的供应链闯关学习平台**。核心模式是「喂教材、出课程、闯关学」：

1. 管理员上传一本教材 / 系统操作手册（`.md` / `.txt` / `.pdf` / `.docx`）；
2. 系统把它加工成一门「闯关课」：按章精讲笔记 + 知识脑图 + 业务案例 + 关卡测验；
3. 学员按关卡顺序闯关，答对达到分数线才解锁下一关，靠经验值、星级、成就驱动学习；
4. 有 OpenAI 兼容 Key 时调用大模型生成，**没 Key 也能用内置教学模板离线生成可玩课程**。

内置一门示例课《供应链入门闯关营》，用于新人体验与无 Key 兜底。

---

## 1. 技术栈（注意版本较新，勿用旧版知识硬套）

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | **Next.js 16.3**（App Router，RSC） | 命令行跑的是 `next dev --turbopack`。Next 16 有破坏性变更，**改代码前先读 `node_modules/next/dist/docs/` 对应章节**（项目内 `AGENTS.md` 也这样要求） |
| UI | **React 19**、Tailwind CSS v4 | Tailwind v4 用 `@theme inline` 方式注册主题色，类名即时生成，无 tailwind.config |
| 数据 | **Prisma 6 + SQLite**（文件在 `prisma/dev.db`） | ORM 层，无手写 SQL |
| 认证 | **jose（HS256 JWT）** + httpOnly Cookie | 无 NextAuth，自研轻量会话 |
| 校验 | zod（当前仅部分使用） | 依赖中已装 |
| AI | **openai SDK**（OpenAI 兼容协议） | 可接任意兼容服务（OpenAI / DeepSeek 等），设置存数据库，DB 优先于环境变量 |
| 文档解析 | `mammoth`（.docx）、`unpdf`（.pdf，纯前端 WebAssembly 方案） | 已在 next.config 中声明为 `serverExternalPackages` |
| 密码 | bcryptjs | |
| 语言 | TypeScript 全栈 | |
| Node | 需要 **≥ 20.9**（Next 16 硬性要求，本项目开发机用 v22） | |

---

## 2. 目录结构与文件职责（改代码前先看这张表）

```
scm-academy/
├─ prisma/
│  ├─ schema.prisma          # 全部数据模型（见 §4）
│  ├─ seed.ts                # seed 入口 → 委托 src/lib/seed.ts 的 seedIfNeeded()
│  └─ dev.db                 # SQLite 数据库文件
├─ src/
│  ├─ proxy.ts               # 路由守卫（Next 16 新约定；旧版叫 middleware.ts）见 §7
│  ├─ app/                   # App Router 页面
│  ├─ components/            # 客户端组件（交互面）
│  └─ lib/                   # 服务端业务逻辑（核心，无框架的纯逻辑层）
├─ data/sources/             # 运行时生成：每门课保存的教材原文 {courseId}.txt
├─ samples/                  # 示例素材（库存管理系统操作手册.md）
├─ scripts/                  # 调试/维护脚本（db-status、test-generate）
└─ public/
```

### `src/lib` 各文件职责（服务端核心）

| 文件 | 职责与关键导出 |
| --- | --- |
| `prisma.ts` | PrismaClient 单例（dev 下复用全局，避免热重载连爆连接数） |
| `types.ts` | 领域类型：`Role`、`QuestionType`、`SessionUser`、`MindNode`、`GeneratedCourse/Chapter/…`。**生成物类型是 AI 管线的契约** |
| `auth.ts` | JWT 签发/校验、Cookie 读写、`requireUser()`（每请求回库校验并取最新 XP）、`requireAdmin()` |
| `actions.ts` | 全部 Server Actions（见 §5 数据流清单） |
| `course-service.ts` | 编排层：上传→生成→落库（`createCourseFromUpload`）、重建课程（`rebuildCourse`）、`unlockNextChapter`、`grantAchievements` |
| `ai.ts` | **AI 生成管线**（见 §6）：`loadAiSettings/hasAi/generateCourseWithAi/generateCourseLocally` |
| `teach.ts` | **本地教学模板**：`GOLD_STYLE`（金标准写作规范 prompt）、`splitSections`（按 Markdown 标题拆章节）、`windowForChapter`（为每章截取正文窗口）、`teachChapter`（离线生成一章完整内容）、`isManual`（关键词探测"系统手册"文体） |
| `seed.ts` | `persistCourse/replaceCourseContent`（生成物→事务落库，同时为所有用户建 Progress）、`seedIfNeeded()`（幂等种子） |
| `sample-course.ts` | `SAMPLE_COURSE` 内置示例课（GeneratedCourse 结构的静态数据） |
| `gamification.ts` | 成就字典 `ACHIEVEMENTS`、`starsFromScore`、`xpFromResult`（见 §5 规则） |
| `parse-document.ts` | `extractText`（md/txt 直读、docx 走 mammoth、pdf 走 unpdf）、`sourceTypeOf`；旧版 `.doc` 明确抛错提示另存为 `.docx` |
| `source-store.ts` | 教材原文落盘 `data/sources/{courseId}.txt`，供"重生成课程"复用 |
| `case-types.ts` | 案例引擎**纯类型/常量**（客户端可安全 import）：`BizType`、`BIZ_OPTIONS`（4 类业务含 emoji/desc）、`CaseEngineParams`、`CaseMeta`、`CasePack` |
| `case-engine.ts` | **实战案例引擎**（见 §6.4）：确定性指标计算 + AI/本地两路叙事，导出 `buildCasePack / normalizePack / normalizeQuestions` |

### `src/components`（客户端组件）

| 组件 | 职责 |
| --- | --- |
| `AppHeader.tsx` | 顶部导航（主色蓝底反白），含 XP 徽章、退出 |
| `AuthPanel.tsx` | 登录/注册表单（landing 页右侧） |
| `UploadStudio.tsx` | 管理员「教材工坊」：上传、AI Key 设置、课程列表 + 一键重生成 |
| `QuizPlayer.tsx` | 闯关答题器（单选/多选/判断→提交） |
| `Mindmap.tsx` | 脑图渲染（读取 `mindmapJson` 树形结构） |
| `Markdown.tsx` | Markdown 渲染器（用于精讲笔记） |
| `CaseEngine.tsx` | 管理员「实战案例引擎」交互主体：参数表单 → 生成 → 卷宗预览 → 挂载到章节 |
| `CaseDossier.tsx` | **案例「卷宗卡」**：封面 + 对话气泡 + 风控签批，解析契约见 §6.4。无服务端依赖，管理员预览与学员 learn 页共用同一份视觉 |

---

## 3. 页面路由表

| 路径 | 文件 | 说明 |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | 落地页：左简介 + 右 `AuthPanel`（登录） |
| `/login` `/register` | `src/app/login|register/page.tsx` | 登录 / 注册 |
| `/(app)` | `(app)/layout.tsx` | **已登录布局**：`requireUser()` 不过则 `redirect("/login")`，统一渲染 `AppHeader` |
| `/(app)/home` | `(app)/home/page.tsx` | 营地：课程地图卡片 + 进度 |
| `/(app)/courses/[id]` | `(app)/courses/[id]/page.tsx` | 关卡地图（章节点、锁定/可闯/已通关状态） |
| `/(app)/courses/[id]/learn/[chapterId]` | `.../learn/[chapterId]/page.tsx` | 精讲笔记（Markdown）＋脑图＋案例 |
| `/(app)/courses/[id]/quiz/[chapterId]` | `.../quiz/[chapterId]/page.tsx` | 闯关（`QuizPlayer`） |
| `/(app)/admin` | `(app)/admin/page.tsx` | 教材工坊（`requireAdmin`，否则回 home），页面声明 `maxDuration=300` 兼容长耗时的 AI 生成 |
| `/(app)/admin/case-engine` | `(app)/admin/case-engine/page.tsx` | 实战案例引擎（`requireAdmin`）：参数表单 → 卷宗预览 → 挂载到章节 |
| `/(app)/leaderboard` | `(app)/leaderboard/page.tsx` | 小队排行榜（按 XP） |

### 鉴权双保险

- **`src/proxy.ts`（路由层）**：校验 `scm_session` Cookie 里的 JWT；未登录访问非公开页 `redirect("/login")`，已登录访问 `/login|/register` 则回 `/home`。公开页白名单：`/`、`/login`、`/register`。
- **`(app)/layout.tsx`（数据层）**：`requireUser()` 每次回库校验并拿最新数据。

---

## 4. 数据模型（Prisma，SQLite）

实体关系概览（箭头 = 1:N）：

```
User ──< Course(createdBy) ──< Chapter ──< CaseStudy
  │                          │  └─< Question
  │                          └─< Progress(章节解锁/通关，userId+chapterId 唯一)
  │                          └─< Attempt(每次答题记录)
  │
  ├─< Progress          UserAchievement >── Achievement(成就字典,code 主键)
  └─< UserAchievement   AppSetting(key/value 键值表)
```

要点说明：

- **User**：`role ∈ admin|learner`；**首个注册用户自动成为 admin**（registerAction 里 `count===0` 判断）；`xp` 累计在用户上。
- **Course**：`sourceType ∈ sample|pdf|md|docx`（记录教材来源），`sourceText` 字段已弃用——原文实际落盘在 `data/sources/`，靠 `source-store.ts` 读写；`createdById` 可为空（内置示例课）。
- **Chapter**：顺序由 `order` 决定，`@@unique([courseId, order])`；`notesMd` 精讲（Markdown）、`mindmapJson`（MindNode 树 JSON）、`passScore` 关卡及格分（当前统一 60）。
- **Progress**：**章节状态机** `locked → unlocked → passed`，带 `bestScore/stars/attempts/passedAt`，`@@unique([userId, chapterId])`。课程维度的统计（如剩几关没通）从各 chapter 的 Progress 聚合得出。
- **Question**：`type ∈ single|multi|judge`；`optionsJson` 为 string[]；`answerJson` 为**正确选项下标数组 number[]**（多选/单选统一为数组，判断题为 2 个选项 `["正确","错误"]`）。
- **CaseStudy**：实战案例存 `title/scene/analysis/metaJson`。`scene` 是"迷你剧本"（渲染解析契约见 §6.4）；`metaJson` 由挂载方随 pack 写入 `{emoji, bizType, chips[]}`，学员端卷宗卡据此展示封面 emoji 与业务芯片；老数据为空时组件按关键词兜底。
- **Achievement / UserAchievement**：静态成就字典 + 用户解锁记录（`@@unique([userId, code])`）。

---

## 5. 核心流程与业务规则

### 5.1 上传 → 生成课程（服务端编排）

`uploadCourseAction`（admin）→ `course-service.createCourseFromUpload`：

1. `parse-document.extractText` 抽取教材纯文本（失败有面向用户的中文错误分类）；
2. `buildCourse(text, filename, forceLocal?)`：读 AI 设置，**有 Key 且未强制本地**则走 AI 两阶段生成，任一步抛错则自动降级为本地模板并给描述加"（大模型调用失败…）"提示；无 Key 直接本地生成；
3. `seed.persistCourse` 用 `$transaction` 一次写入 Course + Chapter + CaseStudy + Question，**并为现存每个用户初始化每章 Progress**（第 1 关 unlocked，其余 locked）；
4. `source-store.saveSource` 保存原文 → 后续可 `rebuildCourse`（删除旧章节重建，保留原文本，即"一键重生成"）。

Server Actions 全清单（都在 `actions.ts`）：`loginAction`、`registerAction`、`logoutAction`、`uploadCourseAction`、`rebuildCourseAction`、`saveAiSettingsAction`、`submitQuizAction`、`generateCaseAction`、`attachCasePackAction`。成功路径用 `revalidatePath` 刷页面，错误以 `{ error: string }` 返回给客户端表单展示。

### 5.2 闯关判定（submitQuizAction）

1. 校验已登录、章节存在、Progress 非 locked；
2. 每题答案数组排序后与 `answerJson` 比对，`score = round(答对/总题 * 100)`；
3. `passed = score >= passScore(60)`；写一条 `Attempt`；
4. **经验规则**（`gamification.xpFromResult`）：未过 +8；通过 `25 + floor(score/5)`，满分再 +15，**首通再 +10**；
5. **星级**（`starsFromScore`）：`score≥90→3星、≥75→2星、≥60→1星`，否则 0；
6. 更新 Progress：`attempts+1、bestScore/stars 取历史最大、passed 则置 passed 并记 passedAt`；
7. 通过 → `unlockNextChapter`（把下一章 locked→unlocked）；
8. 成就结算（`course-service.grantAchievements`，天然防重复领取）：首通 `first_pass`、满分 `perfect`、3星 `three_star`、整门课全通 `course_clear`、XP≥200 `xp_200`；成就的 xpReward 会增量加回用户。

### 5.3 注册

注册页**对外公开**。注册成功后：为新用户按当前全部 Chapter 初始化 Progress（第 1 关 unlocked）；`count===0` 时该用户自动成为 admin。

### 5.4 种子（幂等，`seedIfNeeded`）

登录/注册 Action 前会自动触发一次（`seedPromise` 单飞防抖）。内容：
- Upsert 5 条成就字典；
- Upsert 演示账号：`admin`（林小链，`admin123`）、`zhang`（张采购，80 XP）、`wang`（王仓管，40 XP），学员密码统一 `learn123`；
- 若库中还没有 `sourceType=sample` 的课，用 `SAMPLE_COURSE` 建《供应链入门闯关营》。

---

## 6. AI 生成管线（重点）

入口：`ai.ts`。

### 6.1 设置解析（DB 优先，env 兜底）

`loadAiSettings()` 读 `AppSetting` 表（管理员在教材工坊填写），缺省回退环境变量：
`OPENAI_API_KEY`、`OPENAI_BASE_URL`（默认 `https://api.openai.com/v1`）、`OPENAI_MODEL`（默认 `gpt-4o-mini`）。
Key 非空即视为"有 AI"（`hasAi`）。用 OpenAI SDK，`baseURL` 兼容任意厂商（如 DeepSeek `https://api.deepseek.com` + `deepseek-chat`）。

### 6.2 有 AI：两阶段结构化生成（`generateCourseWithAi`）

设计要点是**把超长教材拆成可消费的小任务、强约束输出 JSON、并做容错**：

- **阶段 1（1 次调用）**：先让模型只产出"关卡大纲"：`{ title, description, coverEmoji, chapters:[{title, summary, keywords}] }`，明确"先只拆大纲，不要写正文，只输出 JSON"；
- **阶段 2（每章 1 次调用）**：用 `teach.windowForChapter` 从原文截出该章相关的正文窗口（`keyword` 命中窗口），模型只写这一章：`notesMd / mindmap / cases / questions`，同样"只输出 JSON"；
- **提示词约束**（`GOLD_STYLE`，这是内容质量的关键，改动需谨慎）：notesMd 只讲概念/主路径/字段/判断，**禁止写真实案例、故事场景、岗位互撕**；案例只允许出现在 cases 字段；每题必须有 stem。`isManual` 用关键词（操作/菜单/字段/审核/ASN/SKU/MOQ 等）区分"系统手册"文体，写作侧重随之切换；
- **容错**：`chatJson` 统一调用 + `parseModelJson` 剥 ```json 围栏、多级 fallback 解析 JSON；`normalizeQuestions` 丢弃缺 stem 的题，并保证题目/案例数量用本地模板兜底补足；
- `ai.ts` 顶层还封装 `polishChapter` 等修复器，防止个别章节内容残缺污染整门课。

### 6.3 无 AI / 兜底：本地教学模板（`generateCourseLocally` → `teachChapter`）

`splitSections` 按 Markdown 标题把教材切成节，最多取 6 节做关卡；每节用 `teachChapter` 产出 完整 GeneratedChapter（概念型笔记/手册型两种文体）。所以**即使完全不配 Key，上传也能得到结构完整、可闯关的草稿课**。

生成物契约见 `types.ts` 的 `GeneratedCourse`，持久化用事务整体落库——所有入口共用同一套结构，改字段需同步改：types → ai/teach 产出 → seed.persistCourse。

### 6.4 实战案例引擎与「卷宗卡」渲染契约（动案例前必读）

入口：`actions.generateCaseAction / attachCasePackAction`（admin）→ `case-engine.buildCasePack`（+`case-types.ts` 的 `BIZ_OPTIONS` 选业务类型）。两路生成：

- **有 Key**：`scene/analysis` 与 2 道风控题（1 multi + 1 judge）走大模型（`buildWithAi`）；**第 1 道计算题永远由引擎本地算**（`buildCalcQuestion`），题干里的利息/服务费/综合成本引用引擎数值、模型禁止重算——演示时数字 100% 正确。
- **无 Key / AI 内容残缺**：整包走本地参数化模板 `buildLocalCase`，数字来自 `computeMetrics`，叙事同样成结构。
- AI 内容过短或缺失 → 自动整体降级本地模板，**不会挂载出残缺案例**。

**scene 文案契约（`CaseDossier` 气泡渲染依赖它）**：
- `scene` 是"迷你剧本"：段落间空行分隔；**对话每句独占一行、行首为「角色名：」**（角色名 ≤ 12 字，职务写全，如 资金方风控老周 / 融资方财务总监 / 买方采购总监）；
- **旁白行不得以"短前缀+冒号"开头**，否则会被误判成对话；
- 契约在两处生成器写死：`localScene`（本地模板）与 `buildWithAi` 的提示词第 1 条。**改文案生成时必须维持该格式**，否则新案例在卷宗卡里丢气泡、变纯旁白。

**渲染契约（`src/components/CaseDossier.tsx`）**：
- 逐行匹配 `/^角色名(≤12 字符)：/` → 渲染为带头像 emoji 的角色气泡（按 资金方/融资方/买方/采购/财务/监管…关键词映射 🕵️💼🛍️📣📦🏭⚖️）；其余行合并为 🎬 旁白；
- 防误判黑名单 `NOT_SPEAKER`：以 发现/显示/如下/结论/总述 等结尾的冒号前缀一律按旁白（老模板「资金方评审发现：…」靠此兜底）；无对话格式的旧数据/样例课自动整体降级旁白，不报错；
- 封面 emoji：优先 `meta.emoji` → 按文案业务关键词猜测（保理→🧾、信用证→🌐、订单→📦、存货质押→🏭…）→ 默认 📁。

**元数据（`CaseStudy.metaJson`，挂载时写入）**：`{ emoji, bizType, chips:[{label,value}] }`。
- `metaFromParams(params)` 两路共用，产出业务 emoji + 金额/账期/日费率/服务费/评级芯片，随 `pack.meta` 返回；
- `attachCasePackAction` 把 `pack.meta` 落进 `metaJson`；**`normalizePack` 必须保留 meta**（挂库前的净化会丢弃未声明的字段）；
- 学员 learn 页解析 `metaJson` 传同款封面/芯片 → **管理员预览 = 学员所见**。改模型需同步：schema.prisma → `prisma db push` → types → 两路生成器 → `CaseDossier`/learn 页。

---

## 7. 工程注意与"坑"（给 AI 的重要提醒）

1. **Next.js 16 / React 19 / Tailwind v4 都是大版本，行为与旧教程不同**；`AGENTS.md` 强制要求先看 `node_modules/next/dist/docs/`。Turbopack 是默认 dev 运行方式。
2. **Tailwind v4 无配置文件，主题色靠 `globals.css` 的 `@theme inline { --color-x }` 注册**。CSS 变量层有"旧别名"（`--sea-deep`、`--gold`…）与"新规范色"（`--primary`、`--neutral-*`…）。**只定义 `:root` 变量而不在 `@theme inline` 注册，`bg-sea-deep` 这类类名不会生成**——历史上 AppHeader 深蓝背景失效就是这个原因。改色必须两处同步（`src/app/globals.css` 第 3~64 行）。
3. **服务端/客户端边界**：业务逻辑全部在 `src/lib`（服务端），UI 交互在 `src/components`（`"use client"` 组件，如表单、QuizPlayer）。RSC 页面直接 `await prisma...` 取数。
4. 数据库是单文件 SQLite，所有写操作走 Prisma 事务（30s 超时）；AI 生成可能较慢，admin 页声明了 `maxDuration = 300`，且 Server Action 上传体上限在 next.config 设了 **20mb**。
5. 运行环境要求 Node ≥ 20.9；开发机若 PATH 里同时存在旧版 Node（如 `C:\nvm4w\nodejs` 的 v18），新终端需确认 `node -v` 是否 ≥ 20。
6. Turbopack 偶发 `.next` 残留导致启动 500（junction 错误）——清理 `.next` 目录即可恢复。

---

## 8. 运行与环境

```bash
npm install
npx prisma generate && npx prisma db push   # 首次同步 SQLite
npm run db:seed                              # 可选，幂等种子
npm run dev                                  # Next 16 + Turbopack，默认 http://localhost:3000
npm run build / start                        # 生产
npm run lint                                 # ESLint 9
```

常用脚本：`scripts/db-status.ts`（看库内统计）、`scripts/test-generate.ts`（离线试生成）。

**演示账号**
- 管理员 `admin` / `admin123`
- 学员 `zhang` 或 `wang` / `learn123`（新注册用户默认 learner）

**环境变量（可选）**：`AUTH_SECRET`（JWT 签名密钥，默认 dev-secret）、`DATABASE_URL`、`OPENAI_API_KEY/OPENAI_BASE_URL/OPENAI_MODEL`。AI 设置也可在页面「教材工坊」填写（存 DB，优先级高于 env）。

---

## 9. UI 设计语言

- 整体为「供应链 × 航行/闯关」叙事风格，页面标题用衬线展示字体 `.display`（CSS class，走 `--font-display`），中文正文用系统无衬线。
- **颜色规范当前为主色蓝**（最近从旧的"海蓝"主题重构而来，见 `globals.css`）：
  - 主色 `--primary: #2664FD`，深一档 `--primary-deep: #1846D1`（大标题/表头/渐变起始），hover `#4D85FD`，浅色底 `#E8F2FF`（页面顶部氛围光晕）；
  - 导航栏 = 主色实底 + 反白文字 + `hover:bg-white/15` 胶囊高亮；标题与正文用中性色 `#333/#666`；金色高亮只在新版首页 hero 类场景保留。
  - 中性色体系 `--neutral-*`、功能色 `--success/--warning/--error` 已就位，**新增页面建议直接使用新规范色（primary / neutral-*），不要再新增旧的 sea/gold 别名用法**。
- 卡片风格：白底、1px `neutral-border`、柔和主色投影（`.card` class）。
- 案例展示统一用 `CaseDossier` 卷宗卡（封面 + 角色气泡 + 风控签批），管理端预览与学员端同款；剧情文案格式契约见 §6.4。

---

## 10. 给"接手 AI"的常用任务指北

- **改导航栏/页面布局** → `src/components/AppHeader.tsx`、`(app)/layout.tsx`；颜色动 `globals.css`（注意 §7.2 两处同步）。
- **改题型/判分/经验数值** → `gamification.ts` + `actions.ts:submitQuizAction`。
- **改 AI 提示词/输出结构** → `teach.ts`（GOLD_STYLE）与 `ai.ts`；**改字段结构必须同时改 `types.ts`、`seed.ts` 的 persistCourse、prisma schema 并 `db push`**。
- **新增一门课的玩法/页面** → 参照 `(app)/courses/[id]/page.tsx`（地图）与 `QuizPlayer` 的 RSC+Action 模式，先确认是否要动 Progress 状态机。
- **改实战案例的剧情/公式** → `src/lib/case-engine.ts`（`localScene`、`buildCalcQuestion`、`buildWithAi` 提示词）与 `case-types.ts`；改 scene 写法必须维持 §6.4 的剧本契约。
- **改案例的展示样式** → `src/components/CaseDossier.tsx`（预览与学员 learn 页共用一份），学员端参数在 learn 页从 `CaseStudy.metaJson` 读；不要在客户端/服务端各写一套案例卡。
- **删库重来**：删 `prisma/dev.db` → `npx prisma db push` → 重启（登录时自动 seed）。
