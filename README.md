# 一键安装 CC Switch + Claude Desktop + Codex — Windows / macOS 安装向导

> 面向 API 中转站用户的一键配置工具，支持 **Windows 10 / 11（x64 / ARM64）** 与 **macOS Apple Silicon（M1 / M2 / M3 / M4）**。双击运行，自动完成 CC Switch、Claude Desktop 和 Codex 的下载、安装与 API 密钥配置，无需任何手动操作。

---

## 目录

- [项目简介](#项目简介)
- [下载](#下载)
- [支持矩阵](#支持矩阵)
- [Windows 使用方法](#windows-使用方法)
- [macOS 使用方法](#macos-使用方法)
- [SHA-256 校验](#sha-256-校验)
- [签名与公证说明](#签名与公证说明)
- [运行中被阻止的解决方法](#运行中被阻止的解决方法)
- [上游来源](#上游来源)
- [当前 Release](#当前-release)
- [已知限制](#已知限制)

---

## 项目简介

本工具是一个独立可执行的安装向导，帮助 API 中转站的用户在 **Windows 10 / Windows 11** 或 **macOS Apple Silicon** 上从零开始，一键完成以下操作：

1. 自动检测当前系统架构（Windows x64 / ARM64、macOS Apple Silicon M1–M4）
2. 下载并安装 [CC Switch](https://github.com/farion1231/cc-switch)（API 中转站密钥管理工具）
3. 下载并安装 Claude Desktop 和 / 或 Codex（AI 编程助手）
4. 将用户提供的 Claude API 密钥 / Codex API 密钥自动写入 CC Switch，完成中转站 Provider 配置

安装完成后，三款 AI 工具均可独立运行，后续更新由各自的内置机制负责，本工具只负责首次安装与配置。

---

## 下载安装包

前往 [Releases 页面](https://github.com/Fe1ix-deng/claude-codex-installer/releases/latest) 获取最新版本。

| 文件 | 平台 |
|------|------|
| `ai-installer-win-x64.exe` | Windows x64（64 位） |
| `ai-installer-win-arm64.exe` | Windows ARM64 |
| `ai-installer-macos-arm64.dmg` | macOS Apple Silicon（实验性） |

---

## 支持矩阵

| 平台 | 架构 | 状态 |
|------|------|------|
| Windows | x64 | ✅ 支持 |
| Windows | ARM64 | ✅ 支持 |
| macOS | Apple Silicon (arm64) | 🧪 实验性 |
| Windows | x86（32 位） | ❌ 不支持 |
| macOS | Intel (x86_64) | ⚠️ 暂不支持 / 未测试 |

---

## Windows 安装教程

1. 从 [Releases 页面](https://github.com/Fe1ix-deng/claude-codex-installer/releases/latest) 下载对应架构的 `.exe` 文件。
2. 双击运行。若出现"Windows 已保护你的电脑"提示，点击**更多信息** → **仍要运行**。
3. 按照向导提示操作：
   - 勾选要安装的工具（Codex、Claude Desktop 或两者）
   - 分别输入对应分组的 API 密钥和中转站地址
4. 等待安装完成，点击**启动**即可开始使用。

> **提示**：安装 CC Switch 到 `C:\Program Files` 需要管理员权限，程序会在需要时自动请求 UAC 提权。

---

## macOS 安装教程

> **⚠️ 实验性支持**：macOS 版本仅在 Apple Silicon（M1 / M2 / M3 / M4）上测试，Intel Mac 暂不支持。

### 1. 下载并校验安装包

从 [Releases 页面](https://github.com/Fe1ix-deng/claude-codex-installer/releases/latest) 下载 `ai-installer-macos-arm64.dmg` 和 `SHA256SUMS.txt`，先按下方说明校验 SHA-256。不要直接运行裸 Mach-O 文件；面向 Finder 的公开入口是 DMG。

```bash
cd ~/Downloads
shasum -a 256 ai-installer-macos-arm64.dmg
```

### 2. 打开 DMG 并运行安装器

双击 `ai-installer-macos-arm64.dmg`，在打开的磁盘映像中双击 `AI Installer.command`。它会由 Terminal 启动安装器，并保留安装日志。

### 3. 首次运行：手动放行 Gatekeeper

由于安装器未经签名和公证，macOS 可能会阻止 DMG 或命令文件运行。请使用以下任一方式授权：

#### 方法一：Finder 右键打开（推荐）

1. 在 Finder 中找到下载的 DMG 或 `AI Installer.command`。
2. **按住 Control 键**，同时单击文件，从菜单中选择**打开**（Open）。
3. 弹窗提示无法验证开发者时，点击**打开**（Open）确认运行。

#### 方法二：系统设置 Open Anyway

如果弹窗中只有"移到废纸篓"选项，或出现「**macOS 无法验证此 App 不包含恶意软件**」提示，请：

1. 打开**系统设置** → **隐私与安全性** → **通用**。
2. 向下滚动，找到已阻止使用安装器的提示。
3. 点击**仍要打开**（Open Anyway），在弹窗中再次确认。

### 4. 按照向导提示完成安装

授权后，按屏幕提示选择要安装的工具并输入 API 密钥即可。

---

## SHA-256 校验

每个 Release 附带 `SHA256SUMS.txt` 文件，可用于验证下载文件的完整性，防止文件在传输过程中被篡改。

### Windows（PowerShell）

```powershell
Get-FileHash .\ai-installer-win-x64.exe -Algorithm SHA256
```

将输出的哈希值（不区分大小写）与 `SHA256SUMS.txt` 中对应条目逐字比对，完全一致则文件可信。

### macOS（终端）

```bash
shasum -a 256 ai-installer-macos-arm64.dmg
```

将输出与 `SHA256SUMS.txt` 中对应行比对，两者完全一致则文件未被篡改。

---

## 签名与公证说明

**当前版本的可执行文件均未经过代码签名（Windows Authenticode）或 Apple 公证（macOS Notarization）。**

- **Windows**：SmartScreen 可能弹出"Windows 已保护你的电脑"警告，点击"更多信息"→"仍要运行"即可通过。
- **macOS**：Gatekeeper 可能阻止未经公证的 DMG 或命令文件，请按[上方步骤](#3-首次运行手动放行-gatekeeper)通过右键"打开"或系统设置"Open Anyway"对本文件单独授权。

### 不建议的操作

请**不要**为了运行本工具而执行以下命令，这些操作会大幅降低系统整体安全性：

```bash
# ❌ 不要执行这些命令
sudo spctl --master-disable          # 关闭 Gatekeeper
csrutil disable                      # 关闭 SIP（需重启进恢复模式）
```

关闭 Gatekeeper 或 SIP 会使整个系统对所有未签名软件敞开大门，远超运行本工具所需的权限范围。推荐仅通过右键"打开"或"Open Anyway"方式对本文件单独授权。

签名与公证计划在后续版本中完善。

---

## 运行中被阻止的解决方法

若在运行过程中（而非启动时）遇到以下任一提示，均可按此步骤处理：

- `"AI Installer.command"已损坏，无法打开。您应该将它移到废纸篓。`
- `无法打开"AI Installer.command"，因为它来自身份不明的开发者。`
- 应用被系统 blocked，无法继续

**步骤一**：确认 DMG 已完成 SHA-256 校验，然后打开**系统设置** → **隐私与安全性** → **通用**，确认是否出现"Open Anyway"选项，若有则点击放行。

**步骤二**：若上述选项未出现，不要直接运行裸 Mach-O 文件，也不要关闭 Gatekeeper 或 SIP。请确认使用的是已校验的项目 DMG，并联系项目维护者报告阻止信息。

**步骤三**：若安装器调起的子程序（如 CC Switch 本体）也被阻止，同样在**系统设置 → 隐私与安全性**中为其单独授权，无需关闭全局 Gatekeeper 或 SIP。

---

## 上游来源

本工具**不托管、不修改任何上游二进制文件**，安装包直接来自各项目官方发布渠道：

| 软件 | 来源 | 许可证 |
|------|------|--------|
| CC Switch | [github.com/farion1231/cc-switch/releases](https://github.com/farion1231/cc-switch/releases) | MIT |
| Claude Desktop | [claudeapp.agentsmirror.com](https://claudeapp.agentsmirror.com) | — |
| Codex | [codexapp.agentsmirror.com](https://codexapp.agentsmirror.com) | — |

完整的第三方许可证文本见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

---

## 当前 Release

→ **[查看最新 Release](https://github.com/Fe1ix-deng/claude-codex-installer/releases/latest)**

---

## 已知限制

- **macOS GUI 自动启动未测试**：macOS 版本安装后的 GUI 独立启动证据尚未完成，不保证可用。
- **macOS Intel 暂不支持**：当前仅提供 Apple Silicon（arm64）构建，Intel Mac 用户请等待后续版本。
- **签名与公证后置**：当前版本未进行代码签名和 macOS 公证，计划在后续稳定版本中完善。首次运行需手动授权（详见[签名与公证说明](#签名与公证说明)）。
