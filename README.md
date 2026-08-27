# WebTools · 浏览器实用工具

一组纯前端、无服务器依赖的实用工具。密码、文本、文件和计算内容均在浏览器本地处理，不上传输入或结果。

> Privacy-first browser utilities. All processing happens locally on the user's device.

## 工具

| 工具 | 入口 | 核心功能 |
|---|---|---|
| 安全随机密码生成器 | [`/`](index.html)、[`/index-zh.html`](index-zh.html) | Web Crypto、安全随机、批量生成、字符规则 |
| 网页计算器 | [`/calculator/`](calculator/) | 鼠标与键盘、四则运算、连续计算 |
| JSON格式化与校验 | [`/json/`](json/) | 格式化、压缩、语法校验 |
| 文本统计与整理 | [`/text/`](text/) | 字符/单词/中文/行数统计、去重、排序、大小写 |
| Base64与URL编解码 | [`/encode/`](encode/) | Unicode安全Base64、URL组件编解码 |
| Unix时间戳转换 | [`/timestamp/`](timestamp/) | 秒/毫秒自动识别、本地时间、UTC、ISO 8601 |
| UUID v4生成器 | [`/uuid/`](uuid/) | Web Crypto、批量生成、大小写与连字符选项 |
| SHA哈希计算器 | [`/hash/`](hash/) | 文本/文件SHA-256、SHA-384、SHA-512与哈希比较 |
| 二维码生成器 | [`/qr/`](qr/) | 文本、URL、Wi-Fi二维码，本地PNG导出 |
| 单位换算器 | [`/unit/`](unit/) | 长度、质量、温度、面积、体积、数据大小 |
| 颜色与对比度 | [`/color/`](color/) | HEX/RGB/HSL互转、WCAG对比度 |
| 图片压缩与缩放 | [`/image/`](image/) | 本地调整尺寸，导出PNG/JPEG/WebP |
| 工具中心 | [`/tools/`](tools/) | 所有工具的统一导航入口 |

## 安全与隐私

- 不调用后端计算接口
- 不上传文本、密码、JSON、Token或文件
- 不使用Local Storage、Session Storage或IndexedDB保存输入
- 密码和UUID使用`crypto.getRandomValues()`
- SHA哈希使用`crypto.subtle.digest()`
- JSON工具使用`JSON.parse()`，不使用`eval()`
- Base64工具通过`TextEncoder`/`TextDecoder`正确处理Unicode
- 文件哈希限制为32 MiB，因为Web Crypto需要在内存中处理完整缓冲区
- 二维码使用仓库内固定版本的`qrcode-generator 1.4.4`，不加载CDN或远程API
- 图片压缩通过File API与Canvas在本地处理，源文件和结果均不上传

复制结果后，内容可能保留在系统剪贴板中，请根据需要覆盖或清理剪贴板。

## 文件结构

```text
WebTools/
├── index.html                  # 英文密码生成器
├── index-zh.html               # 中文密码生成器
├── script.js                   # 密码生成逻辑
├── style.css                   # 密码生成器样式
├── tools/                      # 工具中心
├── shared/tools.css            # 新工具共享响应式样式
├── calculator/                 # 网页计算器
├── json/                       # JSON格式化与校验
├── text/                       # 文本统计与整理
├── encode/                     # Base64与URL编解码
├── timestamp/                  # Unix时间戳转换
├── uuid/                       # UUID v4生成
├── hash/                       # SHA文本与文件哈希
├── qr/                         # 文本、URL和Wi-Fi二维码
├── unit/                       # 六类单位换算
├── color/                      # 颜色格式与WCAG对比度
├── image/                      # 图片压缩、缩放与格式转换
├── tests/                      # 新工具核心逻辑测试
└── package.json                # 测试与语法检查命令
```

## 本地运行

可以直接打开HTML，也可以启动静态文件服务器：

```bash
python3 -m http.server 8000
```

访问工具中心：

```text
http://127.0.0.1:8000/tools/
```

正式部署建议使用HTTPS，以确保Web Crypto、Clipboard和File API在安全上下文中正常工作。

## Cloudflare Workers静态资产部署

当前项目使用Workers Builds连接GitHub，并通过Workers Static Assets部署。仓库根目录的`wrangler.json`是部署配置来源；无需Worker脚本或运行时密钥。

| 配置项 | 值 |
|---|---|
| Production branch | `main` |
| Build command | `exit 0`（纯静态站无构建步骤） |
| Deploy command | `npx wrangler deploy` |
| Root directory | 仓库根目录（留空） |
| Environment variables | 不需要 |

部署后的检查与切流顺序：

1. 先使用Worker提供的`*.workers.dev`地址验证全部工具、未知路径404、响应头及移动端布局。
2. 在Worker的 **Settings > Domains & Routes** 中添加`www.utilcover.com`，不要只手工创建DNS记录。
3. 确认证书Active后，再将`utilcover.com`通过Cloudflare **Single Redirect**永久重定向到`https://www.utilcover.com`；静态资产的`_redirects`不支持域名级重定向。
4. 如域名存在CAA限制，先确保允许Cloudflare文档列出的签发机构。
5. 不为当前未指纹化的JS/CSS添加长期自定义缓存规则；Workers Static Assets已有ETag和部署缓存失效机制。
6. 验证未知路径返回自定义404，而不是以200状态回退到首页。

`wrangler.json`配置`404-page`行为；`.assetsignore`阻止测试、Git元数据和部署配置成为公开资源；`_headers`提供CSP、点击劫持防护和权限策略；`robots.txt`与`sitemap.xml`使用规范主机`www.utilcover.com`。

如果另行创建传统Cloudflare Pages Git Integration项目，则不需要`wrangler.json`：Framework preset选`None`，Build command留空，Build output directory设为`.`。不要混用Pages的`wrangler pages deploy`与Workers Builds的`wrangler deploy`。

## 测试

需要Node.js 18或更高版本：

```bash
npm test
npm run check:js
```

测试覆盖密码之外的所有工具核心转换逻辑，并保留现有计算器回归测试。

## 浏览器要求

建议使用支持以下能力的现代浏览器：

- `crypto.getRandomValues`
- `crypto.subtle.digest`
- `TextEncoder`与`TextDecoder`
- `navigator.clipboard.writeText`
- File API
- Canvas API与`canvas.toBlob()`
- ES2020 JavaScript
- CSS Grid

## 许可证

本项目使用[GNU General Public License v3.0](LICENSE)。
