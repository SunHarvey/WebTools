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
- ES2020 JavaScript
- CSS Grid

## 许可证

本项目使用[GNU General Public License v3.0](LICENSE)。
