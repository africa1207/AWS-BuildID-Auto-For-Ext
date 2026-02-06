<div align="center">

# 🚀 AWS Auto Registration - Chrome Extension
> fork自：https://github.com/Specia1z/AWS-BuildID-Auto-For-Ext

## 新增：自动获取gmail验证码
主要流程：
- 先按照 https://developers.google.com/workspace/gmail/api/quickstart/js?hl=zh-cn 中"启用 API"、"配置 OAuth 权限请求页面"、"为 Web 应用授权凭据"这三部分，其中"为 Web 应用授权凭据"创建应用类型选择Chrome Extension，Item id填写浏览器加载本扩展后的扩展id，在 `chrome://extensions/` 获取。最后创建应用复制生成的 Client ID，填写到manifest.json中的oauth2.client_id
- 接着在 https://console.cloud.google.com/auth/audience 中找到Test users，添加你的邮件地址
- 重新加载扩展，等几分钟即可开始注册

### ⚡ 一键自动化注册 AWS Builder ID 的浏览器扩展

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)](https://www.javascript.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

[功能特性](#-功能特性) • [安装指南](#-安装指南) • [使用说明](#-使用说明) • [技术架构](#-技术架构) • [常见问题](#-常见问题)

</div>

---

> ⚠️ **重要提示**：目前插件的**并发多窗口功能不稳定**，建议将并发窗口数设置为 **1**。使用 Gmail 别名模式时需要手动填写验证码。

---

## ✨ 功能特性

### 🎯 核心功能

- **🤖 半自动注册** - 自动填写表单，验证码需手动输入
- **🔄 批量注册** - 支持自定义注册数量（1-100），一键批量创建账号
- **📧 Gmail 无限别名** - 利用 Gmail 特性生成无限邮箱变体（+号/点号/大小写）
- **🕵️ 无痕模式** - 自动创建无痕窗口，隔离会话，防止数据污染
- **🔐 Token 管理** - 自动获取并保存 OIDC Access Token 和 Refresh Token

### 🛡️ 高级功能

- **✅ Token 验证** - 批量验证 Token 状态，识别封禁、过期、无效账号
- **🎨 状态可视化** - 实时显示注册进度、会话状态、Token 状态
- **📊 智能导出** - 支持 JSON/CSV 格式，自动过滤无效 Token
- **💾 历史记录** - 自动保存注册历史，支持查看、复制、导出
- **🚀 Kiro IDE 同步** - 一键同步 Token 至 Kiro IDE，支持 Windows / macOS / Linux

---

## 📧 Gmail 无限别名

本插件利用 Gmail 的特性，从一个 Gmail 地址生成无限邮箱变体：

| 变体类型 | 示例 | 说明 |
|---------|------|------|
| **+ 号别名** | `user+abc123@gmail.com` | 最可靠，推荐方式 |
| **点号插入** | `u.ser@gmail.com` | Gmail 忽略用户名中的点 |
| **大小写变体** | `UsEr@gmail.com` | Gmail 不区分大小写 |
| **混合变体** | `U.sEr+abc@gmail.com` | 组合以上所有方式 |

> 所有变体都会收到同一个 Gmail 收件箱的邮件

---

## 📦 安装指南

### 方式一：从源码安装（推荐）

1️⃣ **克隆仓库**
```bash
git clone https://github.com/Specia1z/AWS-BuildID-Auto-For-Ext.git
cd AWS-BuildID-Auto-For-Ext
```

2️⃣ **加载扩展**
- 打开 Chrome 浏览器
- 访问 `chrome://extensions/`
- 开启右上角「开发者模式」
- 点击「加载已解压的扩展程序」
- 选择项目根目录

3️⃣ **启用无痕模式**
- 在扩展卡片上，点击「详细信息」
- 找到「在无痕模式下启用」，**必须开启**
- 刷新扩展（点击刷新图标 🔄）

### 方式二：安装打包文件

1. 下载 [Releases](https://github.com/Specia1z/AWS-BuildID-Auto-For-Ext/releases) 中的 `extension.crx` 或 `extension.zip`
2. 解压后按照「方式一」的步骤 2-3 加载

---

## 📖 使用说明

### 快速开始

1. **配置 Gmail 地址**：在插件弹窗中输入你的 Gmail 地址并保存
2. **设置参数**：
   - 注册数量：1-100（建议 ≤ 10）
   - 并发窗口：建议设为 **1**（需要手动输入验证码）
3. **点击「开始注册」**
4. **手动填写验证码**：
   - 打开 Gmail 收件箱，找到 AWS 验证码邮件
   - 在注册页面手动输入验证码
5. **等待完成**，查看注册结果

### 功能详解

#### 📧 Gmail 配置

在插件弹窗顶部配置你的 Gmail 地址：

```
输入: example@gmail.com
保存后自动生成变体: example+240204abc@gmail.com, e.xample@gmail.com 等
```

#### ✅ Token 验证

注册完成后，点击「验证」按钮批量检测所有 Token 状态：

| 状态 | 含义 | 颜色 |
|------|------|------|
| **有效** | Token 正常可用 | 🟢 绿色 |
| **封禁** | 账号被临时封禁 | 🟡 黄色 |
| **过期** | Token 已过期 | 🟠 橙色 |
| **无效** | 账号无效或被删除 | 🔴 红色 |
| **错误** | 网络或服务器错误 | ⚫ 灰色 |
| **未验证** | 尚未验证 | ⚪ 浅灰 |

#### 📊 导出账号

- **JSON 导出**：仅导出有效和未验证的 Token（自动过滤封禁/过期/无效）
- **CSV 导出**：导出完整信息，包含 `token_status` 列

#### 🚀 同步至 Kiro IDE

一键将 Token 同步至 Kiro IDE，**智能检测操作系统**，自动生成对应命令。

**支持的系统：**

| 系统 | 终端 | 配置文件路径 |
|------|------|-------------|
| Windows | PowerShell | `%USERPROFILE%\.aws\sso\cache\` |
| macOS | Terminal | `~/.aws/sso/cache/` |
| Linux | Terminal | `~/.aws/sso/cache/` |

**使用步骤：**

1. 在历史记录中找到成功注册且有 Token 的记录
2. 点击该记录旁边的 **「Kiro」** 按钮
3. 插件会自动检测你的操作系统，生成对应的命令并复制到剪贴板
4. 打开对应的终端（Windows 用 PowerShell，macOS/Linux 用 Terminal）
5. 粘贴并执行命令
6. 重启 Kiro IDE 即可使用同步的账号

---

## 🏗️ 技术架构

### 技术栈

<div align="center">

| 层级 | 技术 | 说明 |
|:----:|:----:|:-----|
| **核心** | ![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome) | Chrome Extension API |
| **语言** | ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black) | ES6+ Modules |
| **UI** | ![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white) | 原生 HTML/CSS |
| **认证** | ![OAuth 2.0](https://img.shields.io/badge/OAuth-2.0-blue?logo=oauth) | AWS OIDC Device Flow |

</div>

### 项目结构

```
extension/
├── manifest.json              # 扩展配置（Manifest V3）
├── background/
│   └── service-worker.js     # 后台服务（会话管理、API 调用）
├── content/
│   └── content.js            # 内容脚本（页面自动化）
├── popup/
│   ├── popup.html            # 弹窗界面
│   ├── popup.css             # 弹窗样式
│   └── popup.js              # 弹窗逻辑
├── lib/
│   ├── mail-api.js           # Gmail 无限别名生成器
│   ├── oidc-api.js           # AWS OIDC 认证 API + Token 验证
│   └── utils.js              # 工具函数（密码/姓名生成）
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 核心流程

```mermaid
graph TD
    A[用户点击开始] --> B[创建会话]
    B --> C[生成 Gmail 别名]
    C --> D[获取 OIDC 授权链接]
    D --> E[打开无痕窗口]
    E --> F[Content Script 自动填表]
    F --> G[用户手动填写验证码]
    G --> H[Service Worker 轮询 Token]
    H --> I{Token 获取成功?}
    I -->|是| J[保存账号信息]
    I -->|否| K[记录失败]
    J --> L[验证 Token 状态]
    L --> M[导出结果]
```

---

## ⚠️ 注意事项

- ✅ **必须启用无痕模式权限**，否则无法创建无痕窗口
- ✅ **必须配置 Gmail 地址**，用于生成邮箱别名
- ⚠️ 验证码需要从 Gmail 收件箱手动获取并填写
- ⚠️ 建议并发窗口设为 1，方便手动输入验证码
- ⚠️ Token 默认状态为「未验证」，需手动点击「验证」按钮
- 📱 仅支持 Chrome 浏览器（基于 Manifest V3）

---

## 🐛 常见问题

<details>
<summary><b>❓ 提示"创建无痕窗口失败"</b></summary>

**原因**：未启用无痕模式权限

**解决方案**：
1. 访问 `chrome://extensions/`
2. 找到本扩展，点击「详细信息」
3. 开启「在无痕模式下启用」
4. 刷新扩展（点击刷新图标 🔄）
</details>

<details>
<summary><b>❓ 提示"未配置 Gmail 地址"</b></summary>

**原因**：未在插件中配置 Gmail 地址

**解决方案**：
1. 点击插件图标打开弹窗
2. 在「邮箱配置」区域输入你的 Gmail 地址
3. 点击「保存」按钮
</details>

<details>
<summary><b>❓ 收不到验证码邮件</b></summary>

**原因**：Gmail 别名可能被识别为垃圾邮件

**解决方案**：
1. 检查 Gmail 的「垃圾邮件」文件夹
2. 检查「所有邮件」确保邮件未被过滤
3. 确认 Gmail 地址输入正确
</details>

<details>
<summary><b>❓ Kiro 同步后 IDE 仍提示未登录</b></summary>

**原因**：配置文件未正确写入或 Kiro 未重启

**解决方案**：
1. 确认在正确的终端中执行命令（Windows 用 PowerShell，macOS/Linux 用 Terminal）
2. 检查 `~/.aws/sso/cache/` 目录是否存在配置文件
3. 完全退出并重启 Kiro IDE
4. 如果仍有问题，尝试删除旧的配置文件后重新同步
</details>

<details>
<summary><b>❓ Windows 执行命令报错</b></summary>

**原因**：可能使用了 CMD 而非 PowerShell

**解决方案**：
1. 确保使用 **PowerShell** 执行命令（不是 CMD）
2. 右键点击开始菜单，选择「Windows PowerShell」或「终端」
3. 粘贴命令并按回车执行
</details>

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star！**

Made with ❤️ by [Specia1z](https://github.com/Specia1z)

</div>
