# epub-anki

一个纯前端的 EPUB 阅读器（PWA，可装到安卓 / iPhone 主屏幕），没有自己的服务器。
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
  - 设置里"选词后自动查词"（`autoLookup`，默认关）：开启时 `LookupUI.onSelection` 直接打开释义面板并查询，
    不显示"查词"按钮；同一选区的重复报告不会再查一次（只调用一次 API）。
  - OpenAI 默认 `gpt-6-luna`（最便宜，约 $0.08/千次查词，中位数约 1.8s；gpt-4.1-mini 快 0.45s 但贵 3.5 倍且已弃用）。
    推理模型（gpt-5+）发 `reasoning_effort: none`，gpt-4* 不发该参数；统一用 `max_completion_tokens`。
  - DeepSeek 默认 `deepseek-flash`，`reasoning_effort: low`。
  - OpenAI 的错误响应（如无效 key 的 401）不带 CORS 头，浏览器里只能看到"请求失败"，读不到状态码。
  - 模型名经常变：换模型前先查 `GET {baseUrl}/models`，再用 `scripts/bench-lookup.ts` 实测延迟。
- PWA：`vite-plugin-pwa`（配置在 `vite.config.ts`），预缓存全部构建产物（含 foliate-js 的懒加载分块）。
  图标在 `public/`（Pillow + 微软雅黑生成的蓝底白"词"）。
- **CSP（内容安全策略）**：`vite.config.ts` 里的 `csp()` 插件把 `<meta http-equiv="Content-Security-Policy">`
  注入 index.html（GitHub Pages 不能设响应头）。书页是 foliate-js 用 blob: URL 加载的同源 iframe，blob: 文档继承
  这条策略，所以书里的脚本（内联、onerror 等事件属性、data: 脚本、SVG 脚本、javascript: 链接）全部被拦截，
  无法读取 localStorage 里的 API key。允许书自带的 blob:/data: 样式、图片、字体；网络只允许本站和
  `PROVIDERS` 里各家 API 的域名（新增服务商会自动加入）；外部图片（跟踪像素）也被拦。开发模式额外允许 ws:（热更新）。
  测试书 `books/hostile.epub`：未加 CSP 时 4 种手法能读到 key，加了之后全部拦截、正文照常显示。
- 部署：`.github/workflows/deploy.yml` 推送 main 后构建并发布到 GitHub Pages，
  `BASE_PATH=/<仓库名>/`（本地构建默认 `/`）。Pages 需在仓库设置里选 Source: GitHub Actions。

## 书库

- 首页是书库（`src/library-ui.ts`）：封面网格（手机每行 3 本）、书名、作者、阅读进度；按最近打开排序。
  "添加"支持多选；同一文件重复添加会被识别（按文件 SHA-256 去重）。⋯ 按钮删除（自定义确认对话框，卡片保留）。
- 书存在 IndexedDB（`src/library-db.ts`，库名 `epub-anki`）：`books` 存元数据（封面 `coverData`/`coverType`、`cfi`、`progress`），
  `files` 存 EPUB 文件本体，分开存以便列书库时不读大文件。**二进制一律存 ArrayBuffer，不存 Blob/File**：
  WebKit（iPhone Safari）往 IndexedDB 存 Blob 会失败（事务报错且 error 为 null，Playwright 的 WebKit 实测复现）。
  旧版本存的 Blob 记录（`cover` 字段、`files` 里的 File）仍可读，见 `coverBlob()` / `getFile()`。添加时用 foliate-js 的 `makeBook` 解析书名/作者/封面，
  并请求 `navigator.storage.persist()`。
- 阅读进度：`openBook(file, { lastLocation, onLocation })`，每次翻页把 CFI 和全书进度写回 IndexedDB。
  不经书库打开的书（`?book=` 开发参数）仍用旧的 localStorage 位置记忆。
- 打开书时 `history.pushState`，安卓返回手势/‹ 按钮回到书库，不会直接退出应用。
- 桌面拖入文件：加入书库；只拖一个文件时直接打开。

## 阅读设置

- "Aa" 按钮（仅阅读时显示）打开阅读设置面板（`src/reading-ui.ts`），手机上是底部弹出面板，背后透明遮罩：
  改动实时预览，点书页只关闭面板不翻页。
- 偏好在 `src/reading-prefs.ts`（localStorage `epub-anki:reading`）：主题（跟随系统/白色/纸张/护眼/夜间/纯黑）、
  字号（px，12–32，默认 24）、字体（原书/衬线/无衬线）、行距、页边距（paginator `gap` 4%/7%/11%）、
  翻页（paginator `flow` paginated/scrolled）、两端对齐（含自动断词）。所有书共用。
- 主题作用于整个应用：`<html data-theme>` + `style.css` 里每个主题一套 CSS 变量（`--page` 是书页底色），
  同时改 `<meta name="theme-color">`（安卓状态栏颜色）。`THEMES`（JS）与 CSS 变量的颜色要保持一致。
- 书页 CSS 由 `bookCss()` 生成，经 `renderer.setStyles()` 注入：书页 html/body 背景**透明**，底色由 `#viewer`
  的 `--page` 提供——foliate-js 只在章节加载时取一次背景色，若书页自己画背景，切换主题后会残留旧颜色。
  iframe 的 `color-scheme` 必须与外层一致，否则 Chrome 会给 iframe 画不透明背景。
  为了主题生效，书内元素的文字颜色/背景色被强制为继承/透明；夜间主题图片略微调暗。
- 书的 CSS 常用 `.class p { ... !important }`（Calibre）且用 `<div>` 当段落（中文书常见），所以覆盖规则：
  行距/字体作用于 body 下**所有元素**，选择器末尾加 `:not(#__epub_anki__)`（永不匹配的 ID，提高到 ID 级优先级），
  才能压过书里基于 class 的 `!important`。只有内联 `!important` 仍会赢。
  测试用 `books/realistic.epub`（Calibre 风格 class + `!important`、div 段落、带行距的 span、内联样式）。
- 字号：`html { font-size }` = 设置值，`body { font-size: 1rem }` 强制正文跟随；书里写死 px/pt 的个别元素不会变。
  默认 24px（v2 起；旧版保存的 18 会一次性迁移为 24，`localStorage` 里带 `v` 版本号）。
- 安卓多数机型没有中文衬线字体，"衬线"对中文正文可能看不出区别（西文会变）。
- 滚动模式下，touch-select 对长按前的小幅移动只 `stopImmediatePropagation` 不 `preventDefault`，
  否则 Chrome 会禁止本次手势的原生滚动。

## 功能约定

- 查词请求带上：选中的词 + 所在句子 + 书的语言。返回 `LookupResult`：
  原形、音标、词性、语境中文释义、补充说明、整句翻译。前端按 服务商+模型+词+句子 缓存（本次会话内）。
- 卡片：**正面 = 词典原形**（查词结果的 `lemma`，如 sieht → aussehen、gave…up → give up），可编辑；
  选中时的原文另存 `selected`，用于在例句里加粗和判断重复（旧卡片无 `selected`，用 `word`，见 `selectedText()`）。
  背面 = 释义（HTML，可含原句，原句里加粗的是选中的原文）。
- 提示词（`src/ai.ts`）明确要求：可分动词/短语动词若句中有分离的前缀或小品词，lemma 给完整词条；
  否则只还原屈折变化。改提示词或换模型后跑 `node scripts/check-lemmas.ts` 回归（12 个德/英例句）。
- **卡片按书分开**：每张卡片带 `bookId`（书库 id）；`bookKey(card)` = `bookId`，没有时用 `title:<书名>`。
  - 阅读时 卡片 抽屉只显示本书卡片（`cardsUI.setScope({ key, title })`），"导出到 Anki"只导出本书。
  - 书库里 setScope(null)：全部卡片按书分组，每组有自己的"导出"，顶部"全部导出"。
  - 旧卡片只有书名：书库每次列出时 `cards.linkLegacy(books)` 按书名补上 `bookId`。
  - "清空"按钮跟随范围：阅读时清空本书，书库里清空全部。先弹确认框（`confirmDialog()`，`src/dom.ts`），
    清空后底部提示可"撤销"（`cards.clear()` 返回快照，`restoreAll()` 还原并保留之后新加的卡片）。
- 导出（`src/export.ts`，文件 `anki-<书名>-YYYYMMDD-HHMM.tsv`，全部导出为 `anki-cards-…tsv`，UTF-8 无 BOM）：
  ```
  #separator:tab
  #html:true
  #notetype:Basic
  #tags column:3
  #deck column:4
  #guid column:5
  正面<TAB>背面HTML<TAB>epub-anki 书名标签<TAB>EPUB生词::书名<TAB>ea-<hash>
  ```
  **GUID = hash(牌组名 + 正面小写)**（`cardGuid()`）：Anki 导入时先按 GUID 匹配，所以不同书的同一正面是两条笔记，
  同一本书重新导出会更新已有笔记（不新增）。Anki 自带的重复判断是按正面跨所有牌组比较，且**没有文件头能改成只在本牌组内比较**
  （`#match scope:` 不被识别，已用 anki 26.09.4 验证），所以必须用 GUID。
  代价：用旧版（无 GUID）导出并已导入 Anki 的卡片，用新版再导入一次会在同一牌组多出一份，需在 Anki 里手动删一次。
  每行自带牌组（`deckName()`）：每本书一个子牌组 `EPUB生词::书名`，同一个文件可含多本书。
  牌组列是纯文本（不做 HTML 转义，`&` 原样保留）；书名里的 `::` 替换为 `:`，避免多出一层子牌组。
  扩展名用 `.tsv`：AnkiMobile 不接受 `.txt` 文本导入。
  所有字段 HTML 转义；换行转 `<br>`，制表符转空格；正面开头的 `#` 转 `&#35;`；
  背面 HTML 的属性用单引号（字段里不出现裸双引号）。卡片按加入时间从旧到新输出。
  已用官方 `anki` Python 包（26.09.4）的 `import_csv` 实测：自动识别全部设置（含牌组列），
  每本书进各自子牌组，重复导入不会产生重复笔记。
- **重复规则：同一本书里正面相同即重复（不论背面），不同书互不影响。**（`cards.findFront(bookKey, front)`，正面比较忽略大小写和多余空格）
  查词面板里若本书已有同样正面，按钮显示"✓ 本书已有「…」"并禁用；编辑卡片把正面改成本书已有的也会被拒绝。
  此规则之前留下的重复卡片在抽屉里标"重复"，导出时只保留最早的一张。
- 卡片列表存在 localStorage（键 `epub-anki:cards`），导出后不自动清空。
  `Card` = `LookupResult` 全部字段 + 正面 `word`、选中原文 `selected`、原句 `sentence`、`offset`、书名 `book`、`bookId`。
  可编辑字段：正面、释义、补充说明。
- 桌面选词：`watchSelection` 在 pointerup 后 10ms 报告选区；之后异步到达的 selectionchange 不得取消这次
  快速报告（否则"查词"按钮要等 300ms 才出现）。`LookupUI.onSelection` 对同一选区的重复报告不关闭已打开的面板。

## 手机（安卓）适配

- **触屏不用原生选区**（`src/touch-select.ts`）：原生选区会让安卓 Chrome 弹出自带菜单（复制/分享/网页搜索）
  和 Google "Touch to Search" 搜索条。所以触屏（`pointer: coarse`）时书页设 `user-select: none`，
  自己实现：长按 450ms 选中手指下的词（`caretPositionFromPoint` + `Intl.Segmenter` 分词），按住拖动扩展成短语，
  用 CSS Custom Highlight API（`::highlight(epub-lookup)`）画高亮；书页 `contextmenu` 一律阻止。
  桌面（鼠标）仍用原生选区（`src/selection.ts`）。
- 触屏事件在 iframe 的 window 捕获阶段处理：长按等待中/选择中的 `touchmove` 和选择结束的 `touchend`
  都 `stopImmediatePropagation`，不让 foliate-js 收到。否则 foliate-js 会滑动翻页，或在 touchend 时 snap，
  snap 触发 relocate，进而关闭刚弹出的查词按钮。超过 10px 的移动视为滑动，交还 foliate-js 翻页。
- 关闭查词 UI 时通过 `LookupUI.onHide` 清除自定义高亮。触屏"查词"按钮在词上方 14px。
- 窄屏（≤600px）查词面板是底部弹出的半屏面板（`.lookup-panel.sheet`）。
- 触屏点屏幕左/右 30% 翻页（`src/reader.ts`）；若这次点击是在关闭选区/查词面板，则不翻页。
  foliate-js 自带滑动翻页。触屏隐藏左右箭头按钮。
- 文件选择框不加 `accept` 过滤：安卓部分文件选择器会把 .epub 置灰。
- `crypto.randomUUID` 只在 HTTPS/localhost 可用，`src/cards.ts` 有回退，便于局域网 http 测试。
- 模拟器里测不了真实长按；用临时把 `attachShadow` 改成 open 的方式拿到书页 iframe，派发合成触屏事件测试。

## iPhone（iOS Safari）适配

- 平台判断在 `src/platform.ts`：`isTouchDevice()`、`isIOS()`（含 iPadOS 伪装成 Mac 的情况）、`isStandalone()`。
- 书库顶部的"添加到主屏幕"提示（`#ios-install`）：仅 iOS 且未从主屏幕打开时显示，可关闭（`epub-anki:ios-install-dismissed`）。
  原因：Safari 对 7 天没访问的网站会清除其存储（书库、卡片），主屏幕应用不受此限。
- index.html 有 `apple-mobile-web-app-*` 元标签（主屏幕名称"EPUB查词"、状态栏样式）和 `apple-touch-icon`。
- 导出：iOS 上用系统分享面板（`saveText()` → `navigator.share({ files })`，可直接存到"文件"或发给 AnkiMobile），
  先试 `text/tab-separated-values` 再试 `text/plain`；用户取消不回退；其他平台仍是下载。
- 触屏翻页：点击事件的 `pointerType` 在 WebKit 上可能是 "mouse"，所以触屏设备上任何点击都按"点按"处理（`src/reader.ts`）。
- 输入框在触屏设备上字号 16px（iOS 会放大聚焦的 <16px 输入框）；`text-size-adjust: 100%`；`overscroll-behavior: none`。
- 图标用内联 SVG（⚙/☰ 在 iOS 上会显示成彩色 emoji）。衬线字体栈把西文衬线放在中文衬线前（否则西文会用宋体里的西文字形）。
- 测试：Playwright 的 WebKit 引擎 + iPhone 15 设备模拟（在 Windows 上可跑）。该 WebKit 版本不能构造 TouchEvent 的
  touches 列表，长按测试用"带 touches 坐标属性的普通 Event"代替；生产构建里 service worker 会让 page.route 拦不到请求，
  需要时用 `serviceWorkers: 'block'`。真机才能验证的：添加到主屏幕、分享面板、状态栏、真实长按手感。

## 已知待办

- 未支持从文件管理器"用此应用打开"/分享到本应用（可用 Web Share Target / file_handlers）。

## 开发阶段

1. [x] 打开本地 EPUB，翻页、目录、进度
2. [x] 在书页 iframe 中监听选区，弹出"查词"浮动菜单
   （`src/selection.ts` 取词+所在句子；`src/lookup-ui.ts` 浮动按钮和释义面板）
3. [x] AI 查词，显示释义（含加载中、出错重试）
4. [x] "加入卡片" + 侧边卡片列表（可编辑/删除，删除可撤销）
   （`src/cards.ts` 卡片存储，`src/cards-ui.ts` 右侧抽屉；共用 DOM 工具在 `src/dom.ts`）
5. [x] 导出 TSV，并在 Anki 中实际导入验证
6. [x] 纯前端化 + 安卓 PWA（设置面板、浏览器直连 AI、触屏适配、离线缓存、GitHub Pages 工作流）
7. [x] 触屏自定义长按选词（去掉 Chrome 菜单）
8. [x] 书库首页（IndexedDB 存书、进度、返回手势）
9. [x] 阅读设置（主题/纸张颜色/夜间、字号、字体、行距、页边距、翻页方式、两端对齐）
10. [x] 卡片按书分开，每本书导出到各自的 Anki 子牌组（EPUB生词::书名）
11. [x] 卡片清空（确认 + 撤销）；设置里可选"选词后自动查词"
12. [x] 卡片正面用词典原形（含可分动词 sieht…aus → aussehen）
13. [x] 重复 = 同一本书内正面相同；导出带 GUID，Anki 里各书互不影响、重导出只更新
14. [x] CSP：拦截书内脚本，保护 API key
15. [x] iPhone 适配（存储改 ArrayBuffer、触屏翻页、输入框防缩放、主屏幕提示、分享面板导出、SVG 图标）

## 命令

- `npm run dev`：开发服务器（`npm run dev -- --host` 可让同一 Wi-Fi 的手机访问，但非 HTTPS 无法安装 PWA）
- `npm run typecheck`：类型检查
- `npm run build`：构建；`npx vite preview` 预览构建结果（可测 service worker）
- `node scripts/bench-lookup.ts [provider:model ...]`：实测各模型查词延迟（从 `.env` 读 key，会真实调用 API）
- `node scripts/check-lemmas.ts [provider:model]`：检查卡片正面原形是否正确（可分动词、短语动词等）

## 注意

- 书页内容在 foliate-js 渲染的 iframe 里（且在 closed shadow root 内），
  不能从外层 `document` 直接拿到选区，要在 `view` 的 `load` 事件里拿到 `doc` 再挂监听。
- `.env`（仅测速脚本用）和 `*.epub` 已在 `.gitignore` 中，不要提交。
