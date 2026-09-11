# macOS 支持可行性审计报告

审计日期：2026-09-08（Asia/Shanghai）  
仓库：`https://github.com/Fe1ix-deng/win-verify`  
审计主机：Apple Silicon，`arm64`，macOS `26.6.2`（Darwin `25.6.0`）

## 判定规则

- `supported`：存在可访问的 macOS 安装包；架构、文件格式、校验、安装、应用元数据和启动验证均闭环。
- `partially-supported`：下载源、文件格式和 SHA-256 已由真实 Release 证据确认，但安装/启动或关键兼容性证据尚未闭环。
- `blocked`：有候选来源但安装链路被明确的系统、权限或上游限制阻塞。
- `not-found`：没有可确认的 macOS 安装包来源。

本报告不把源码可在 Node.js 上运行写成安装支持，也不使用 Windows 包替代 macOS 包。

## 上游 Release 证据

### CC Switch

- 官方仓库与 Release：仓库 `https://github.com/farion1231/cc-switch`；Release `https://github.com/farion1231/cc-switch/releases/tag/v3.20.2`。
- macOS 资产：`CC-Switch-v3.20.2-macOS.dmg`（28,111,538 bytes，SHA-256 `847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec`）；同时有 `CC-Switch-v3.20.2-macOS.zip`（28,125,809 bytes，SHA-256 `0972adce513f07d7a42f854b82d6776afb4b3824c709593e8fe68367a29d81ec`）和 `CC-Switch-v3.20.2-macOS.tar.gz`（28,826,804 bytes，SHA-256 `f9e4345f868293d239bdfa5eaeb75a417d7e2f98112bde5361efd48937f6519f`）。以上 digest 来自 GitHub Release API。
- 下载 URL：`https://github.com/farion1231/cc-switch/releases/download/v3.20.2/CC-Switch-v3.20.2-macOS.dmg`。
- `latest.json`：`https://github.com/farion1231/cc-switch/releases/download/v3.20.2/latest.json` 将同一个 macOS tar.gz 标记为 `darwin-aarch64` 和 `darwin-x86_64`；这证明上游宣称跨两架构，但没有提供独立的架构文件名。
- HTTP：下载 URL 返回 GitHub `302` 到 `release-assets.githubusercontent.com`，最终 `200`、`Content-Type: application/octet-stream`、DMG `Content-Length: 28111538`，`Last-Modified: Mon, 07 Sep 2026 14:25:32 GMT`。
- 安装方式：DMG 预期用 `hdiutil attach` 后复制 `.app`；ZIP/tar.gz 预期解压后复制 `.app`。本次主机无法完成挂载，见“安装验证限制”。
- 架构、最低 macOS 版本、Bundle Identifier、主可执行文件、安装后的 `.app` 路径和启动进程：Release 元数据未完整提供，包内检查尚未完成，不能猜测或套用 Windows 值。
- 签名/Gatekeeper：Release 有 tar.gz `.sig`，但未完成本机 `codesign`、公证或 `spctl` 验证，不能宣称可绕过 Gatekeeper。
- 实际校验：本审计下载的 DMG SHA-256 为 `847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec`，与 API digest 一致。

### Claude Desktop

- 当前确认的镜像项目与 Release：仓库 `https://github.com/Wangnov/claude-app-mirror`；Release `https://github.com/Wangnov/claude-app-mirror/releases/tag/claude-app-v1.46388.4`。
- 资产：`Claude-mac-universal.dmg`，353,897,855 bytes。
- 下载 URL：`https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/Claude-mac-universal.dmg`。
- `release-manifest.json`：`https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/release-manifest.json` 的 `sources.macos.universal` 明确给出 `platform: darwin`、`arch: universal`、`format: dmg`、官方重定向 `https://api.anthropic.com/api/desktop/darwin/universal/dmg/latest/redirect`、稳定源 `https://downloads.claude.ai/releases/darwin/universal/1.46388.4/Claude-50e62f90a2c85243eef42913398f7c8f1534abef.dmg`、`contentLength: 353897855` 和 SHA-256 `c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9`。
- HTTP：GitHub URL 返回 `302` 到 `release-assets.githubusercontent.com`，最终 `200`、`Content-Type: application/octet-stream`、`Content-Length: 353897855`、`Last-Modified: Sat, 05 Sep 2026 03:38:02 GMT`。
- SHA-256：上游 `SHA256SUMS.txt` 与清单声明 `c5451dba...62444c9`。本次下载因执行时限只得到 131 MB 截断临时文件（SHA-256 `c14fbc91d4d24efcc0ab52aee386a2177013900e0d8e7bdde8219bc30d881a1b`），因此该临时文件禁止安装；必须完整重下载并重新校验。
- 架构：`universal`，理论上覆盖 Intel 和 Apple Silicon；需对完整 DMG 内 Mach-O 使用 `file`/`lipo -info` 复核。
- 最低 macOS 版本、Bundle Identifier、主可执行文件、安装路径、启动进程及签名/Gatekeeper：镜像清单未提供或本机未验证，不能套用 Windows MSIX 值。
- 安装方式/权限：预期 `hdiutil attach -readonly` 后复制 `.app` 到 `/Applications`；写入 `/Applications` 可能需要管理员授权。

### Codex / ChatGPT Desktop

- 当前确认的镜像项目与 Release：仓库 `https://github.com/Wangnov/codex-app-mirror`；Release `https://github.com/Wangnov/codex-app-mirror/releases/tag/codex-app-26.901.51231`。
- 资产：`Codex-mac-arm64.dmg`（643,007,873 bytes，SHA-256 `b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082`）和 `Codex-mac-x64.dmg`（631,579,926 bytes，SHA-256 `ef03923dd510c9663f2e77b8d0391dc565175e4ca94ea404030133e576e1b3b8`）；另有 `Codex-darwin-arm64-26.901.51231.zip` 和 x64 ZIP。
- 下载 URL：arm64 `https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/Codex-mac-arm64.dmg`；x64 `https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/Codex-mac-x64.dmg`。
- 清单与 checksum：`https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/release-manifest.json` 和 `SHA256SUMS-macos.txt`。清单明确给出 arm64/x64 独立 DMG URL、`minimumSystemVersion: 13.0`、`bundleIdentifier: com.openai.codex`、`bundleName: ChatGPT`、`bundleExecutable: ChatGPT`、`downloadable: true`、`status: downloadable`；两个 SHA-256 与 `SHA256SUMS-macos.txt` 一致。
- HTTP：两个 URL 均返回 `302` 到 `release-assets.githubusercontent.com`，最终 `200`、`Content-Type: application/octet-stream`；arm64 `Content-Length: 643007873`，x64 `Content-Length: 631579926`。
- 安装方式/权限：DMG 挂载后复制 `ChatGPT.app` 到 `/Applications`；写入系统应用目录可能触发管理员授权，用户目录安装不应假定管理员权限。建议启动 `/usr/bin/open -a /Applications/ChatGPT.app`，再用 `pgrep -x ChatGPT` 检查；本环境尚未执行。
- 签名/Gatekeeper：清单含 Sparkle `edSignature` 和 Team ID `2DC432GLL2`，但未完成 `codesign --verify`、`spctl --assess` 或首次启动验证。

## 每个软件、每个架构结论

| 软件 | `darwin/arm64` | `darwin/x64` | 结论依据 |
| --- | --- | --- | --- |
| CC Switch | `partially-supported` | `partially-supported` | 候选包可访问且 DMG SHA-256 已实际匹配；包内架构、Bundle ID、最低版本和安装/启动未验证。 |
| Claude Desktop | `partially-supported` | `partially-supported` | universal DMG、稳定 URL、长度和 SHA-256 已确认；完整文件需重下载校验，安装/启动和包内元数据未验证。 |
| Codex / ChatGPT Desktop | `partially-supported` | `partially-supported` | 独立 arm64/x64 DMG、ZIP、最低 macOS 13.0、Bundle ID、可执行文件和 SHA-256 已由清单确认；真实挂载/安装/启动未验证。 |

因此，本阶段没有形成可宣称的完整 macOS 安装支持矩阵：不能宣称任一 `darwin/arm64` 或 `darwin/x64` 已支持，不能新增正式 macOS Release，也不能把当前状态写成三款软件整体支持。

## 本机已安装应用交叉检查

本机现有应用只用于核对身份，不代表本安装器已完成安装：

| 应用 | 版本 | Bundle ID | 可执行文件 | 最低 macOS | 架构 |
| --- | --- | --- | --- | --- | --- |
| CC Switch | 3.20.1 | `com.ccswitch.desktop` | `cc-switch` | 12.0 | universal |
| Claude | 1.46388.4 | `com.anthropic.claudefordesktop` | `Claude` | 12.0 | universal |
| ChatGPT/Codex | 26.901.51231 (8109) | `com.openai.codex` | `ChatGPT` | 13.0 | arm64 |

路径分别为 `/Applications/CC Switch.app`、`/Applications/Claude.app`、`/Applications/ChatGPT.app`。三者的 `codesign --verify --deep --strict` 均报告 arm64 `invalid signature`；`spctl` 在当前环境返回 Code Signing subsystem internal error。因此不能把这些现有应用作为签名、公证、Gatekeeper 或本安装器启动通过的证据。

## 安装验证限制与待办证据

本审计主机为 macOS 26.6.2 arm64，但沙箱内对已完整下载的 CC Switch DMG 执行 `hdiutil attach -nobrowse -readonly` 返回 `hdiutil: attach failed - 设备未配置`。外部特权挂载尝试未获得执行许可，故没有伪造挂载点、应用路径或启动结果。

在真实 macOS 主机完成以下证据前，不得把任一架构从 `partially-supported` 提升为 `supported`：完整下载并校验；`hdiutil attach -readonly` 或 ZIP 解压；`file`/`lipo -info` 架构检查；读取 `CFBundleIdentifier`、`CFBundleExecutable`、`LSMinimumSystemVersion`；复制到 `/Applications` 并记录权限/覆盖行为；`codesign --verify --deep --strict` 与 `spctl --assess --type execute`；启动并记录主进程和退出状态。

## 对代码实现的决定

按项目兼容性边界，本次先停在可行性报告和测试设计，不修改 `platform-support.js`、`software-manifest.js` 或 `install-all.js` 的行为。三款软件虽有可访问、可校验的候选包，但真实安装/启动矩阵尚未在当前主机闭环。

后续若在真实 macOS 主机完成验证，可按“只实现已验证子集”进入代码阶段：manifest 固定 URL、文件名、installerType、checksumUrl、architecture、bundleId、installPath；DMG/PKG/ZIP/APP 安装器分别封装并注入系统命令；checksum 成功是安装硬前置；未验证或 Gatekeeper 阻塞的条目继续返回明确的 `blocked`/`partially-supported`，不回退到 Windows 包。

## 测试设计

进入实现阶段时，应先写失败测试，再写行为代码。测试矩阵必须覆盖：

- `detectTarget({ platform: 'darwin', arch: 'arm64' })` 与 `darwin/x64`，同时保留 Windows x64/ARM64 和 Windows x86 拒绝行为；
- 三款软件按 macOS 架构选择 manifest，且任何 macOS 目标都不能回退到 Windows 资产；
- checksum 匹配后才可调用安装器；校验失败时删除缓存并禁止任何安装命令；
- DMG 的 `hdiutil attach -nobrowse -readonly`、`ditto` 复制和 `hdiutil detach` 参数；未来若纳入 PKG/ZIP，也分别断言 `installer` 和解压/复制参数；
- 所有系统命令通过可注入的 `execFile`/`spawn` 封装；非 darwin 平台不得调用 macOS 安装器；
- `--print-target` 在 macOS 输出正确 JSON；`--dry-run` 不挂载、不复制、不执行安装命令；
- `npm test` 全量保留 Windows MSI/MSIX/EXE、checksum 清理和下载续传回归。

单元测试不能替代真实安装验收；支持结论仍需真实 macOS 主机的下载、挂载、复制、Gatekeeper、启动和进程证据。

## 发布状态

- 本阶段未生成 macOS 打包产物。
- 未修改或删除现有 Windows x64/ARM64 产物。
- 未签名、未公证的 macOS 产物不存在。
- 没有创建新的 GitHub Release 或 tag。
- Windows 现有行为尚未因本阶段改变；后续实现阶段必须重新运行完整 `npm test` 及 Windows 回归测试。
