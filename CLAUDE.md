# epub-anki

一个纯前端的 EPUB 阅读器（PWA，可装到安卓主屏幕），没有自己的服务器。
在"能读书"之外只有两个附加功能：

1. **AI 查词**：选中词语 → 浏览器直接调用 AI（用户自己的 key）给出该词在当前句子语境中的释义。
2. **制卡导出**：把词语（正面）+ 释义（背面）加入卡片列表，导出为 Anki 可直接导入的 TSV 文件。

联网只用于调用 AI；网页本身由 service worker 缓存，离线可打开。

## 技术栈

- 前端：Vite + TypeScript，原生 DOM，不用框架。
- EPUB 渲染：[foliate-js](https://github.com/johnfactotum/foliate-js)（MIT，npm 包 `foliate-js`）。
  通过 `<foliate-view>` 自定义元素使用；类型声明在 `src/foliate.d.ts`，只声明用到的部分。
- AI（`src/ai.ts` 请求与解析，`src/providers.ts` 服务商配置）：OpenAI 或 DeepSeek，
  均走 OpenAI 兼容的 `/chat/completions` + JSON 输出模式，**由浏览器直接请求**（两家都允许 CORS）。
  - key、服务商、模型由用户在设置面板（`src/settings-ui.ts`）填写，存在本机 localStorage（`epub-anki:settings`）。
  - OpenAI 默认 `gpt-6-luna`（最便宜，约 $0.08/千次查词，中位数约 1.8s；gpt-4.1-mini 快 0.45s 但贵 3.5 倍且已弃用）。
    推理模型（gpt-5+）发 `reasoning_effort: none`，gpt-4* 不发该参数；统一用 `max_completion_tokens`。
  - DeepSeek 默认 `deepseek-flash`，`reasoning_effort: low`。
  - OpenAI 的错误响应（如无效 key 的 401）不带 CORS 头，浏览器里只能看到"请求失败"，读不到状态码。
  - 模型名经常变：换模型前先查 `GET {baseUrl}/models`，再用 `scripts/bench-lookup.ts` 实测延迟。
- PWA：`vite-plugin-pwa`（配置在 `vite.config.ts`），预缓存全部构建产物（含 foliate-js 的懒加载分块）。
  图标在 `public/`（Pillow + 微软雅黑生成的蓝底白"词"）。
- 部署：`.github/workflows/deploy.yml` 推送 main 后构建并发布到 GitHub Pages，
  `BASE_PATH=/<仓库名>/`（本地构建默认 `/`）。Pages 需在仓库设置里选 Source: GitHub Actions。

## 功能约定

- 查词请求带上：选中的词 + 所在句子 + 书的语言。返回 `LookupResult`：
  原形、音标、词性、语境中文释义、补充说明、整句翻译。前端按 服务商+模型+词+句子 缓存（本次会话内）。
- 卡片：正面 = 词语；背面 = 释义（HTML，可含原句）。
- 导出（`src/export.ts`，抽屉里"导出到 Anki"按钮，文件 `anki-cards-YYYYMMDD-HHMM.tsv`，UTF-8 无 BOM）：
  ```
  #separator:tab
  #html:true
  #notetype:Basic
  #deck:EPUB生词
  #tags column:3
  正面<TAB>背面HTML<TAB>epub-anki 书名标签
  ```
  扩展名用 `.tsv`：AnkiMobile 不接受 `.txt` 文本导入。
  所有字段 HTML 转义；换行转 `<br>`，制表符转空格；正面开头的 `#` 转 `&#35;`；
  背面 HTML 的属性用单引号（字段里不出现裸双引号）。卡片按加入时间从旧到新输出。
  已用官方 `anki` Python 包（26.09.4）的 `import_csv` 实测：自动识别全部设置，重复导入不会产生重复笔记。
- 卡片列表存在 localStorage（键 `epub-anki:cards`），导出后不自动清空。
  `Card` = `LookupResult` 全部字段 + 正面 `word`、原句 `sentence`、`offset`、书名 `book`。
  可编辑字段：正面、释义、补充说明。同一 词+句子 不重复加入。

## 手机（安卓）适配

- 触屏长按选词以 `pointercancel` 结束而不是 `pointerup`：`src/selection.ts` 只对鼠标/笔等 `pointerup`，
  触屏靠 `selectionchange` 去抖。
- 触屏时"查词"按钮放在选区下方 30px（系统复制菜单在上方、拖动手柄在下方）。
- 窄屏（≤600px）查词面板是底部弹出的半屏面板（`.lookup-panel.sheet`）。
- 触屏点屏幕左/右 30% 翻页（`src/reader.ts`）；若这次点击是在关闭选区/查词面板，则不翻页。
  foliate-js 自带滑动翻页。触屏隐藏左右箭头按钮。
- 文件选择框不加 `accept` 过滤：安卓部分文件选择器会把 .epub 置灰。
- `crypto.randomUUID` 只在 HTTPS/localhost 可用，`src/cards.ts` 有回退，便于局域网 http 测试。
- 模拟器里测不了真实长按；用临时把 `attachShadow` 改成 open 的方式拿到书页 iframe，派发合成触屏事件测试。

## 已知待办

- **CSP 尚未添加（用户决定暂缓）**：foliate-js 文档要求必须用 CSP 屏蔽书内脚本，否则恶意 EPUB 里的脚本
  能读取 localStorage 中的 API key。计划：`script-src 'self'`，`connect-src 'self' https://api.openai.com https://api.deepseek.com`。
- iOS 未适配（Safari 7 天清理非主屏幕网站存储、选词菜单差异等）。
- 每次需重新从文件选择 EPUB（未把书存进 IndexedDB）；未支持从文件管理器"用此应用打开"。

## 开发阶段

1. [x] 打开本地 EPUB，翻页、目录、进度
2. [x] 在书页 iframe 中监听选区，弹出"查词"浮动菜单
   （`src/selection.ts` 取词+所在句子；`src/lookup-ui.ts` 浮动按钮和释义面板）
3. [x] AI 查词，显示释义（含加载中、出错重试）
4. [x] "加入卡片" + 侧边卡片列表（可编辑/删除，删除可撤销）
   （`src/cards.ts` 卡片存储，`src/cards-ui.ts` 右侧抽屉；共用 DOM 工具在 `src/dom.ts`）
5. [x] 导出 TSV，并在 Anki 中实际导入验证
6. [x] 纯前端化 + 安卓 PWA（设置面板、浏览器直连 AI、触屏适配、离线缓存、GitHub Pages 工作流）

## 命令

- `npm run dev`：开发服务器（`npm run dev -- --host` 可让同一 Wi-Fi 的手机访问，但非 HTTPS 无法安装 PWA）
- `npm run typecheck`：类型检查
- `npm run build`：构建；`npx vite preview` 预览构建结果（可测 service worker）
- `node scripts/bench-lookup.ts [provider:model ...]`：实测各模型查词延迟（从 `.env` 读 key，会真实调用 API）

## 注意

- 书页内容在 foliate-js 渲染的 iframe 里（且在 closed shadow root 内），
  不能从外层 `document` 直接拿到选区，要在 `view` 的 `load` 事件里拿到 `doc` 再挂监听。
- `.env`（仅测速脚本用）和 `*.epub` 已在 `.gitignore` 中，不要提交。
