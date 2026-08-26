# WebTools · 安全随机密码生成器

一个纯前端、无服务器依赖的随机密码生成工具，提供中文和英文页面。所有密码均在浏览器本地生成，不会上传到服务器。

> A client-side secure random password generator with Chinese and English interfaces. Passwords are generated locally and never sent to a server.

## 功能

- 默认生成16位密码
- 支持1至128位自定义长度
- 单次生成1至100个密码
- 可选择大写字母、小写字母、数字和特殊字符
- 可排除容易混淆的字符：`0 o O 1 I i L l`
- 确保每种已选择的字符类型至少出现一次
- 密码强度提示
- 单个复制和一键复制全部密码
- 中文、英文界面
- 响应式布局，支持桌面和移动设备

## 安全实现

密码生成使用浏览器提供的 Web Crypto API：

```javascript
crypto.getRandomValues()
```

实现包含：

- 不使用`Math.random()`
- 使用拒绝采样避免取模偏差
- 使用安全随机的 Fisher–Yates 算法打乱字符顺序
- 每种已勾选的字符类型先生成至少一个字符
- 浏览器不支持安全随机数时直接停止生成，不回退到弱随机算法
- 使用`textContent`显示密码，避免把生成内容作为HTML解析

## 文件结构

```text
WebTools/
├── index.html                 # 英文页面
├── index-zh.html              # 中文页面
├── script.js                  # 密码生成、强度判断、复制和双语文案
├── style.css                  # 页面样式
└── images/
    ├── favicon-16x16.ico
    ├── favicon-32x32.ico
    └── og-image.jpg
```

## 本地使用

直接打开英文页面：

```text
index.html
```

或打开中文页面：

```text
index-zh.html
```

也可以使用任意静态文件服务器：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/
http://127.0.0.1:8000/index-zh.html
```

正式部署建议使用HTTPS，以确保 Web Crypto 和 Clipboard API 在安全上下文中正常工作。剪贴板API不可用时，页面会提供手动复制方式。

## 隐私

- 密码只在当前浏览器内存和页面中生成
- 不调用后端密码生成接口
- 不保存密码
- 不记录密码
- 不发送统计或分析请求

复制密码后，密码可能保留在系统剪贴板中，请在使用后根据需要覆盖或清理剪贴板。

## 浏览器要求

建议使用支持以下API的现代浏览器：

- `crypto.getRandomValues`
- `navigator.clipboard.writeText`
- ES6 JavaScript

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)。
