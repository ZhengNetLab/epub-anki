# epub-anki

一个本地 EPUB 阅读器。v1 在"能读书"之外只有两个附加功能：

1. **AI 查词**：选中词语 → 调用 AI 给出该词在当前句子语境中的释义。
2. **制卡导出**：把词语（正面）+ 释义（背面）加入卡片列表，导出为 Anki 可直接导入的 TSV 文件。

## 技术栈

- 前端：Vite + TypeScript，原生 DOM，不用框架。
- EPUB 渲染：[foliate-js](https://github.com/johnfactotum/foliate-js)（MIT，npm 包 `foliate-js`）。
  通过 `<foliate-view>` 自定义元素使用；类型声明在 `src/foliate.d.ts`，只声明用到的部分。
- AI：OpenAI 或 DeepSeek，均走 OpenAI 兼容的 `/chat/completions` + JSON 输出模式，配置在 `server/providers.ts`。
  - 选择：`AI_PROVIDER=openai|deepseek`；未设置时有 `OPENAI_API_KEY` 就用 OpenAI，否则 DeepSeek。
  - OpenAI 默认 `gpt-6-luna`（最便宜，约 $0.08/千次查词，中位数约 1.8s；gpt-4.1-mini 快 0.45s 但贵 3.5 倍且已弃用）。推理模型（gpt-5+）发 `reasoning_effort: none`，
    gpt-4* 不发该参数；统一用 `max_completion_tokens`（不是 `max_tokens`）。
  - DeepSeek 默认 `deepseek-flash`，`reasoning_effort: low`。
  - **key 只能在服务端读取**：`server/lookup.ts` 由 `vite.config.ts` 里的插件挂到 dev/preview 服务器的
    `POST /api/lookup`，前端绝不接触 key。接口要求 `application/json` 且同源，防止其他网页盗刷。
  - 请求/返回类型在 `src/lookup-types.ts`（前后端共用）。
  - 模型名经常变：换模型前先查 `GET {baseUrl}/models`，再用
    `node scripts/bench-lookup.ts openai:<model> deepseek:<model>` 实测延迟。

## 功能约定

- 查词请求带上：选中的词 + 所在句子 + 书的语言。返回 `LookupResult`：
  原形、音标、词性、语境中文释义、补充说明、整句翻译。前端按 词+句子 缓存（本次会话内）。
- 卡片：正面 = 词语；背面 = 释义（HTML，可含原句）。
- 导出格式（Anki 2.1.55+ 文件头）：
  ```
  #separator:tab
  #html:true
  #notetype:Basic
  #deck:EPUB生词
  词语<TAB>释义HTML
  ```
  字段内的制表符和换行必须转义（换行转 `<br>`，制表符转空格）。
- 卡片列表暂存在 localStorage（键 `epub-anki:cards`），导出后不自动清空。
  `Card` = `LookupResult` 全部字段 + 正面 `word`、原句 `sentence`、`offset`、书名 `book`。
  可编辑字段：正面、释义、补充说明。同一 词+句子 不重复加入。

## 开发阶段

1. [x] 打开本地 EPUB，翻页、目录、进度
2. [x] 在书页 iframe 中监听选区，弹出"查词"浮动菜单
   （`src/selection.ts` 取词+所在句子；`src/lookup-ui.ts` 浮动按钮和释义面板，阶段 3 替换面板正文）
3. [x] `/api/lookup` 接入 DeepSeek，显示释义（含加载中、出错重试）
4. [x] "加入卡片" + 侧边卡片列表（可编辑/删除，删除可撤销）
   （`src/cards.ts` 卡片存储，`src/cards-ui.ts` 右侧抽屉；共用 DOM 工具在 `src/dom.ts`）
5. [ ] 导出 TSV，并在 Anki 中实际导入验证

v1 不做：书库管理、同步、标注高亮、多格式支持之外的设置、AnkiConnect、.apkg。

## 命令

- `npm run dev`：开发服务器
- `npm run typecheck`：类型检查
- `npm run build`：构建
- `node scripts/bench-lookup.ts [provider:model ...]`：实测各模型查词延迟（会真实调用 API）

## 注意

- 书页内容在 foliate-js 渲染的 iframe 里（且在 closed shadow root 内），
  不能从外层 `document` 直接拿到选区，要在 `view` 的 `load` 事件里拿到 `doc` 再挂监听。
- `.env` 和 `*.epub` 已在 `.gitignore` 中，不要提交。
