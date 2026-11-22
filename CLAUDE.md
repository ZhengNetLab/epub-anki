# epub-anki

一个本地 EPUB 阅读器。v1 在"能读书"之外只有两个附加功能：

1. **AI 查词**：选中词语 → 调用 AI 给出该词在当前句子语境中的释义。
2. **制卡导出**：把词语（正面）+ 释义（背面）加入卡片列表，导出为 Anki 可直接导入的 TSV 文件。

## 技术栈

- 前端：Vite + TypeScript，原生 DOM，不用框架。
- EPUB 渲染：[foliate-js](https://github.com/johnfactotum/foliate-js)（MIT，npm 包 `foliate-js`）。
  通过 `<foliate-view>` 自定义元素使用；类型声明在 `src/foliate.d.ts`，只声明用到的部分。
- AI：DeepSeek API（OpenAI 兼容接口），key 放在 `.env` 的 `DEEPSEEK_API_KEY`。
  **key 只能在服务端读取**，前端通过 `/api/lookup` 调用，绝不把 key 打包进前端代码。
  （计划用 Vite dev server 中间件或一个很小的 Node 服务实现，阶段 3 再定。）

## 功能约定

- 查词请求带上：选中的词 + 所在句子 + 书的语言。返回：简明释义（中文）、词性、语境例句。
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
- 卡片列表暂存在 localStorage，导出后不自动清空。

## 开发阶段

1. [x] 打开本地 EPUB，翻页、目录、进度
2. [x] 在书页 iframe 中监听选区，弹出"查词"浮动菜单
   （`src/selection.ts` 取词+所在句子；`src/lookup-ui.ts` 浮动按钮和释义面板，阶段 3 替换面板正文）
3. [ ] `/api/lookup` 接入 DeepSeek，显示释义
4. [ ] "加入卡片" + 侧边卡片列表（可编辑/删除）
5. [ ] 导出 TSV，并在 Anki 中实际导入验证

v1 不做：书库管理、同步、标注高亮、多格式支持之外的设置、AnkiConnect、.apkg。

## 命令

- `npm run dev`：开发服务器
- `npm run typecheck`：类型检查
- `npm run build`：构建

## 注意

- 书页内容在 foliate-js 渲染的 iframe 里（且在 closed shadow root 内），
  不能从外层 `document` 直接拿到选区，要在 `view` 的 `load` 事件里拿到 `doc` 再挂监听。
- `.env` 和 `*.epub` 已在 `.gitignore` 中，不要提交。
