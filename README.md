# WebTools · 浏览器实用工具

一组纯前端、无服务器依赖的实用工具。所有计算和密码生成均在浏览器本地完成，不上传用户输入或生成结果。

> A collection of client-side browser utilities. All calculations and password generation run locally in the browser.

## 工具

### 安全随机密码生成器

入口：

- [英文页面](index.html)
- [中文页面](index-zh.html)

功能：

- 默认生成16位密码
- 支持1至128位自定义长度
- 单次生成1至100个密码
- 可选择大写字母、小写字母、数字和特殊字符
- 可排除容易混淆的字符：`0 o O 1 I i L l`
- 确保每种已选择的字符类型至少出现一次
- 密码强度提示、单个复制和一键复制
- 中文、英文界面

安全实现：

- 使用`crypto.getRandomValues()`，不使用`Math.random()`
- 使用拒绝采样避免取模偏差
- 使用安全随机的 Fisher–Yates 算法打乱字符顺序
- 浏览器不支持安全随机数时停止生成，不回退到弱随机算法
- 使用`textContent`显示密码，不将生成内容解析为HTML

### 网页计算器

入口：[calculator/](calculator/)

功能：

- iPhone风格深色响应式界面
- 支持鼠标点击和键盘输入
- 加、减、乘、除及连续运算
- 小数、正负号、退格、清空和除零错误处理
- `Enter`或`=`计算
- `Backspace`退格
- `Escape`、`Delete`或`C`清空
- 对常见小数运算抑制浮点显示噪声
- 不使用`eval()`或动态代码执行

## 文件结构

```text
WebTools/
├── index.html                         # 密码生成器英文页面
├── index-zh.html                      # 密码生成器中文页面
├── script.js                          # 密码生成逻辑
├── style.css                          # 密码生成器样式
├── images/                            # 密码生成器图片资源
└── calculator/
    ├── index.html                     # 计算器页面
    ├── calculator.js                  # 计算引擎及键盘/鼠标控制
    ├── calculator.css                 # iPhone风格响应式样式
    └── tests/calculator.test.cjs      # 计算引擎测试
```

## 本地运行

可以直接打开对应HTML文件，也可以启动任意静态文件服务器：

```bash
python3 -m http.server 8000
```

访问：

```text
http://127.0.0.1:8000/
http://127.0.0.1:8000/index-zh.html
http://127.0.0.1:8000/calculator/
```

计算器测试：

```bash
node --test calculator/tests/calculator.test.cjs
```

正式部署建议使用HTTPS，以确保 Web Crypto 和 Clipboard API 在安全上下文中正常工作。

## 隐私

- 不调用后端计算或密码生成接口
- 不保存密码或计算内容
- 不记录用户输入
- 不使用Local Storage、Session Storage或IndexedDB
- 不发送统计或分析请求

复制密码后，密码可能保留在系统剪贴板中，请在使用后根据需要覆盖或清理剪贴板。

## 浏览器要求

建议使用支持以下能力的现代浏览器：

- `crypto.getRandomValues`
- `navigator.clipboard.writeText`
- ES6 JavaScript
- CSS Grid

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)。
