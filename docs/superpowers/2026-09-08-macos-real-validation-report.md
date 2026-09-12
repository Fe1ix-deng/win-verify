# macOS 真实安装验证报告

验证日期：2026-09-08（Asia/Shanghai）

仓库：`https://github.com/Fe1ix-deng/claude-codex-installer`

Git commit：`7bc24aae80d51c8e82db88bf23960b3f4a98ffbc`
验证临时目录：`/var/folders/mr/3wp37gr92g9c2_v8_6h01k140000gn/T//macos-installer-validation.14WpGi`（报告完成后删除）

## 1. 范围和判定

本阶段只验证真实 macOS 安装链路，不实现 macOS 安装代码，不修改 manifest/平台判断/安装编排，不生成 macOS 产物，不创建 Release，不打 tag。

`HTTP 200`、Release 页面存在、远端 digest、DMG 文件存在或静态 Mach-O 架构信息，都不能单独证明安装支持。矩阵结论严格使用 `supported`、`partially-supported`、`blocked`、`failed`、`not-tested`。

## 2. 验证主机

执行并保存的主机信息：

```text
uname -a
Darwin appledeMacBook-Pro.local 25.6.0 Darwin Kernel Version 25.6.0: Fri Jul 31 19:18:49 PDT 2026; root:xnu-12377.161.14~5/RELEASE_ARM64_T6000 arm64

uname -m
arm64

sw_vers
ProductName:    macOS
ProductVersion: 26.6.2
BuildVersion:   25G83

node --version
v26.0.0

npm --version
11.12.1

git rev-parse HEAD
7bc24aae80d51c8e82db88bf23960b3f4a98ffbc
```

架构和 Rosetta：

- 当前主机是 Apple Silicon，`uname -m` 为 `arm64`，不是 Intel。
- 升权后的 `sysctl -in hw.optional.arm64` 输出 `1`。
- 升权后的 `sysctl -in hw.optional.x86_64` 没有输出，退出码为 `0`，因此不把空输出解释为 Intel 能力。
- `pkgutil --pkg-info com.apple.pkg.RosettaUpdateAuto` 退出码为 `0`，版本为 `1.0.0.0.1786586848`。
- `arch -x86_64 true` 退出码为 `0`，但这不构成 Intel 主机证据，也不替代 Intel 原生启动验证。
- 沙箱内直接执行两条 `sysctl` 曾返回 `Operation not permitted`；该限制已作为环境信息保留，架构结论依据升权只读查询和 `uname`。

Git 工作区在验证开始时的 `git status --short`：

```text
?? docs/superpowers/2026-09-08-macos-support-feasibility-report.md
?? docs/superpowers/plans/2026-09-08-macos-support-implementation-plan.md
?? docs/superpowers/specs/
```

这些是验证开始前已存在的未跟踪可行性/设计/计划文件，本阶段没有覆盖或回滚。受保护文件的 `git diff --name-only` 为空。

## 3. 上游来源和下载

来源全部取自 `docs/superpowers/2026-09-08-macos-support-feasibility-report.md`。Claude 和 Codex 的来源是报告中已经审计的镜像 Release；CC Switch 的 macOS 资产来自其上游项目 Release。最终重定向 URL 的临时 query string 未写入仓库报告；完整 `curl -w url_effective` 输出只存在于本次临时日志中，且随临时目录删除。

| 软件 | 上游项目 / Release | 最终下载 URL（query 已省略） | HTTP / 重定向 | Content-Length | 本地大小 | 文件名 | checksum 来源 | 期望 SHA-256 |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| CC Switch | `https://github.com/farion1231/cc-switch` / `https://github.com/farion1231/cc-switch/releases/tag/v3.20.2` | `https://release-assets.githubusercontent.com/github-production-release-asset/1031912724/47be75e7-4aaf-40df-b0ce-bb43a49f2702` | `200` / 1 次 | 28,111,538 | 28,111,538 | `CC-Switch-v3.20.2-macOS.dmg` | 可行性报告记录的 GitHub Release API `asset.digest` | `847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec` |
| Claude Desktop | `https://github.com/Wangnov/claude-app-mirror` / `https://github.com/Wangnov/claude-app-mirror/releases/tag/claude-app-v1.46388.4` | `https://release-assets.githubusercontent.com/github-production-release-asset/1254138541/9145757e-77f8-479b-b573-89e3d456dd5e` | `200` / 1 次 | 353,897,855 | 353,897,855 | `Claude-mac-universal.dmg` | `https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/SHA256SUMS.txt`；同时核对 `release-manifest.json` | `c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9` |
| Codex arm64 | `https://github.com/Wangnov/codex-app-mirror` / `https://github.com/Wangnov/codex-app-mirror/releases/tag/codex-app-26.901.51231` | `https://release-assets.githubusercontent.com/github-production-release-asset/1230652236/941b5331-f8d4-4765-b6ac-e58c1f7be4ab` | 最终续传 `206` / 1 次；首次 `200` 截断 | 643,007,873 | 643,007,873 | `Codex-mac-arm64.dmg` | `https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/SHA256SUMS-macos.txt`；同时核对 `release-manifest.json` | `b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082` |
| Codex x64 | 同上 | `https://release-assets.githubusercontent.com/github-production-release-asset/1230652236/09013c7c-5afa-41e4-85b6-4eb78c993877` | 最终续传 `206` / 1 次；首次 `200` 截断 | 631,579,926 | 631,579,926 | `Codex-mac-x64.dmg` | 同上 | `ef03923dd510c9663f2e77b8d0391dc565175e4ca94ea404030133e576e1b3b8` |

下载命令均使用：

```bash
curl -L --fail --retry 3 --retry-delay 2 -o <exact-file-name> <verified-url>
```

下载异常记录：

- 沙箱内首次 CC Switch curl 3 次 DNS 重试均失败，错误为 `curl: (6) Could not resolve host: github.com`。升权网络重试后成功，该问题归类为沙箱网络限制。
- Claude 在本次临时目录中先执行了对 `Claude-mac-universal.dmg` 的 `rm -f`，没有复用此前约 131 MB 的截断文件；新下载完整达到 `353,897,855` bytes 并通过 checksum。
- Codex arm64 首次传输在 `25,424,161` bytes 退出，stderr 为 `curl: (18) Transferred a partial file`；Codex x64 首次传输在 `65,698,381` bytes退出，同样为 `curl: (18) Transferred a partial file`。两者均未挂载。
- 对上述两个本次临时目录中的截断文件使用同一 pinned URL 执行 curl 断点续传和重试，服务器返回 `206`，最终分别补齐到 `643,007,873` 和 `631,579,926` bytes。

## 4. SHA-256 验证

所有 DMG 都在挂载前执行了 `shasum -a 256`，并按 checksum 清单中的精确文件名匹配；没有架构交叉匹配。

```text
CC-Switch-v3.20.2-macOS.dmg
actual   847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec
expected 847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec
PASS

Claude-mac-universal.dmg
actual   c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9
expected c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9
PASS

Codex-mac-arm64.dmg
actual   b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082
expected b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082
PASS

Codex-mac-x64.dmg
actual   ef03923dd510c9663f2e77b8d0391dc565175e4ca94ea404030133e576e1b3b8
expected ef03923dd510c9663f2e77b8d0391dc565175e4ca94ea404030133e576e1b3b8
PASS
```

## 5. DMG 元数据

每个通过 checksum 的 DMG 都执行了：

```bash
hdiutil imageinfo "$DMG_PATH"
```

四次升权执行均退出码 `0`，没有报告损坏；沙箱内对应命令一致返回 `设备未配置`，属于当前沙箱能力限制。

| DMG | 镜像格式 | 描述 / 压缩 | 镜像内 Total Bytes | 文件系统 / 分区 | Checksummed | Partitioned |
| --- | --- | --- | ---: | --- | --- | --- |
| CC Switch | `UDZO` | compressed UDIF read-only, zlib | 89,166,336 | Apple_HFS / HFS+ | true | false |
| Claude | `ULFO` | compressed UDIF read-only, lzfse | 1,345,323,008 | Apple_HFS / HFS+ | true | false |
| Codex arm64 | `UDZO` | compressed UDIF read-only, zlib | 1,587,076,096 | Apple_HFS / HFS+ | true | false |
| Codex x64 | `UDZO` | compressed UDIF read-only, zlib | 1,552,501,760 | Apple_HFS / HFS+ | true | false |

`hdiutil imageinfo` 的关键原始输出如下：

```text
CC Switch: Format Description: 已压缩为UDIF只读(zlib); Format: UDZO; CUDIFEncoding-bytes-total: 28088726; partition-hint: Apple_HFS; HFS+:; Checksummed: true; Partitioned: false
Claude: Format Description: 已压缩为UDIF只读(lzfse); Format: ULFO; CUDIFEncoding-bytes-total: 353826294; partition-hint: Apple_HFS; HFS+:; Checksummed: true; Partitioned: false
Codex arm64: Format Description: 已压缩为UDIF只读(zlib); Format: UDZO; CUDIFEncoding-bytes-total: 642904477; partition-hint: Apple_HFS; HFS+:; Checksummed: true; Partitioned: false
Codex x64: Format Description: 已压缩为UDIF只读(zlib); Format: UDZO; CUDIFEncoding-bytes-total: 631478807; partition-hint: Apple_HFS; HFS+:; Checksummed: true; Partitioned: false
```

## 6. 挂载、`.app` 和架构

每次都使用只读、无 Finder 模式：

```bash
hdiutil attach "$DMG_PATH" -readonly -nobrowse -plist
```

设备节点和挂载点由 `/usr/libexec/PlistBuddy` 从 `system-entities` 提取，没有猜测 `/Volumes/...`。每次 attach 都设置了 EXIT 清理逻辑；四次 detach 日志均为：`"disk5" ejected.`。最终 `hdiutil info` 只剩 framework/driver 信息，没有本次挂载残留。

| 软件 / DMG | attach 退出码 | plist 设备 / 挂载点 | `find` 结果 | 复制目标 |
| --- | ---: | --- | --- | --- |
| CC Switch | 0 | `/dev/disk5s1` / `/Volumes/CC Switch` | `/Volumes/CC Switch/CC Switch.app` | 临时 `apps/CC Switch.app` |
| Claude | 0 | `/dev/disk5s1` / `/Volumes/Claude` | `/Volumes/Claude/Claude.app` | 临时 `apps/Claude.app` |
| Codex arm64 | 0 | `/dev/disk5s1` / `/Volumes/ChatGPT Installer` | `/Volumes/ChatGPT Installer/ChatGPT.app` | 临时 `apps/codex-arm64/ChatGPT.app` |
| Codex x64 | 0 | `/dev/disk5s1` / `/Volumes/ChatGPT Installer` | `/Volumes/ChatGPT Installer/ChatGPT.app` | 临时 `apps/codex-x64/ChatGPT.app` |

`.app` 元数据通过 `plutil -p`、`defaults read ... CFBundleIdentifier` 和 `defaults read ... CFBundleExecutable` 读取：

| 软件 | CFBundleIdentifier | CFBundleExecutable | LSMinimumSystemVersion | 实际主可执行文件 |
| --- | --- | --- | --- | --- |
| CC Switch | `com.ccswitch.desktop` | `cc-switch` | `12.0` | `/Volumes/CC Switch/CC Switch.app/Contents/MacOS/cc-switch` |
| Claude | `com.anthropic.claudefordesktop` | `Claude` | `12.0` | `/Volumes/Claude/Claude.app/Contents/MacOS/Claude` |
| Codex arm64 | `com.openai.codex` | `ChatGPT` | `13.0` | `/Volumes/ChatGPT Installer/ChatGPT.app/Contents/MacOS/ChatGPT` |
| Codex x64 | `com.openai.codex` | `ChatGPT` | `13.0` | `/Volumes/ChatGPT Installer/ChatGPT.app/Contents/MacOS/ChatGPT` |

主可执行文件的完整 `file` / `lipo -info` 结果：

```text
CC Switch:
/Volumes/CC Switch/CC Switch.app/Contents/MacOS/cc-switch: Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]
Architectures in the fat file: .../cc-switch are: x86_64 arm64

Claude:
/Volumes/Claude/Claude.app/Contents/MacOS/Claude: Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]
Architectures in the fat file: .../Claude are: x86_64 arm64

Codex arm64:
/Volumes/ChatGPT Installer/ChatGPT.app/Contents/MacOS/ChatGPT: Mach-O 64-bit executable arm64
Non-fat file: .../ChatGPT is architecture: arm64

Codex x64:
/Volumes/ChatGPT Installer/ChatGPT.app/Contents/MacOS/ChatGPT: Mach-O 64-bit executable x86_64
Non-fat file: .../ChatGPT is architecture: x86_64
```

因此 CC Switch 和 Claude 的 DMG 是 Universal，两个 Codex DMG 是架构独立的 thin binary。静态 x86_64 slice 证据不等于 Intel 主机启动证据。

## 7. codesign 和 spctl

命令和退出码：

```bash
codesign --verify --deep --strict --verbose=4 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
```

四个挂载 DMG 内 `.app` 的 `codesign_exit` 和 `spctl_exit` 都为 `0`。以下保留完整 stdout/stderr：

### CC Switch

```text
codesign_exit=0
/Volumes/CC Switch/CC Switch.app: valid on disk
/Volumes/CC Switch/CC Switch.app: satisfies its Designated Requirement

spctl_exit=0
/Volumes/CC Switch/CC Switch.app: accepted
source=Notarized Developer ID
```

### Claude

```text
codesign_exit=0
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (GPU).app
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (GPU).app
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (Plugin).app
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (Plugin).app
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper (Renderer).app
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper.app
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Claude Helper.app
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Electron Framework.framework/Versions/Current/.
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Electron Framework.framework/Versions/Current/Helpers/chrome_crashpad_handler
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Electron Framework.framework/Versions/Current/Helpers/chrome_crashpad_handler
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Electron Framework.framework/Versions/Current/.
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Mantle.framework/Versions/Current/.
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Mantle.framework/Versions/Current/.
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/ReactiveObjC.framework/Versions/Current/.
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/ReactiveObjC.framework/Versions/Current/.
--prepared:/Volumes/Claude/Claude.app/Contents/Frameworks/Squirrel.framework/Versions/Current/.
--validated:/Volumes/Claude/Claude.app/Contents/Frameworks/Squirrel.framework/Versions/Current/.
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/app-cu-helper
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/app-cu-helper
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/chrome-native-host
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/chrome-native-host
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app/Contents/Frameworks/FBControlCore.framework
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app/Contents/Frameworks/FBControlCore.framework
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app/Contents/Frameworks/FBSimulatorControl.framework
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app/Contents/Frameworks/FBSimulatorControl.framework
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/Claude iOS Sim.app
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/disclaimer
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/disclaimer
--prepared:/Volumes/Claude/Claude.app/Contents/Helpers/permission-fixer
--validated:/Volumes/Claude/Claude.app/Contents/Helpers/permission-fixer
/Volumes/Claude/Claude.app: valid on disk
/Volumes/Claude/Claude.app: satisfies its Designated Requirement

spctl_exit=0
/Volumes/Claude/Claude.app: accepted
source=Notarized Developer ID
```

### Codex arm64

```text
codesign_exit=0
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/app_mode_loader
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/app_mode_loader
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/browser_crashpad_handler
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/browser_crashpad_handler
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Alerts).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Alerts).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (GPU).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (GPU).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Renderer).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Renderer).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Service).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Service).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/web_app_shortcut_copier
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/web_app_shortcut_copier
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Autoupdate
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Autoupdate
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Updater.app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Updater.app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Downloader.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Downloader.xpc
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Installer.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Installer.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/PlugIns/CodexDockTilePlugin.docktileplugin
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/PlugIns/CodexDockTilePlugin.docktileplugin
/Volumes/ChatGPT Installer/ChatGPT.app: valid on disk
/Volumes/ChatGPT Installer/ChatGPT.app: satisfies its Designated Requirement

spctl_exit=0
/Volumes/ChatGPT Installer/ChatGPT.app: accepted
source=Notarized Developer ID
```

### Codex x64

```text
codesign_exit=0
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/app_mode_loader
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/app_mode_loader
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/browser_crashpad_handler
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/browser_crashpad_handler
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Alerts).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Alerts).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (GPU).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (GPU).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Renderer).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Renderer).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Service).app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/Codex (Service).app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/web_app_shortcut_copier
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/web_app_shortcut_copier
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Autoupdate
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Autoupdate
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Updater.app
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/Updater.app
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Downloader.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Downloader.xpc
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Installer.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/XPCServices/Installer.xpc
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/Frameworks/Sparkle.framework/Versions/Current/.
--prepared:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/PlugIns/CodexDockTilePlugin.docktileplugin
--validated:/Volumes/ChatGPT Installer/ChatGPT.app/Contents/PlugIns/CodexDockTilePlugin.docktileplugin
/Volumes/ChatGPT Installer/ChatGPT.app: valid on disk
/Volumes/ChatGPT Installer/ChatGPT.app: satisfies its Designated Requirement

spctl_exit=0
/Volumes/ChatGPT Installer/ChatGPT.app: accepted
source=Notarized Developer ID
```

没有执行 `xattr -d com.apple.quarantine`，没有关闭 Gatekeeper，也没有执行 `sudo`。上述 `codesign`/`spctl` 结果只证明本次 DMG 中的实际 `.app` 在当前主机的检查结果，不替代 Intel 主机启动证据。

## 8. 临时复制和启动

复制命令是 `ditto "$APP_PATH" "$DEST_APP"`，目标只在本次临时目录，没有写入 `/Applications`。四次复制退出码均为 `0`，Bundle ID 复制后再次读取一致：

```text
CC Switch: 58M -> 58M; com.ccswitch.desktop
Claude: 833M -> 833M; com.anthropic.claudefordesktop
Codex arm64: 1.3G -> 1.3G; com.openai.codex
Codex x64: 1.3G -> 1.3G; com.openai.codex
```

启动命令均为：

```bash
open -n "$DEST_APP"
sleep 10
pgrep -fl "$EXECUTABLE"
ps aux | grep -i "$EXECUTABLE" | grep -v grep
```

结果：

| 软件 / 架构 | `open` 退出码 | 10 秒内的进程证据 | 启动结论 |
| --- | ---: | --- | --- |
| CC Switch arm64 | 0 | 只有已存在的 `/Applications/CC Switch.app/Contents/MacOS/cc-switch`，PID `2822`；没有临时副本独立 PID | 当前机器已有同 Bundle ID 实例，不能证明临时副本独立启动 |
| Claude arm64 | 0 | 只有已存在的 `/Applications/Claude.app/Contents/MacOS/Claude`，PID `55354` 及其 helpers；没有临时副本独立 PID | 当前机器已有同 Bundle ID 实例，不能证明临时副本独立启动 |
| Codex arm64 | 0 | 机器已有 `/Applications/ChatGPT.app` 进程；没有可靠的临时副本主进程证据 | 当前机器已有同 Bundle ID 实例，不能证明临时副本独立启动 |
| Codex x64 | 1 | 无临时副本进程；完整错误为 `The application cannot be opened because it has an incorrect executable format.` | Apple Silicon 主机不能替代 Intel x64 启动验证 |

进程安全复盘：CC Switch 和 Claude 没有停止现有 PID。Codex arm64 的第一次验证脚本错误地从宽匹配的 `pgrep -fl ChatGPT` 结果中选择了现有 `/Applications/ChatGPT.app` 的 crashpad helper PID `28536` 并执行了 `kill 28536`；该 PID 不是本次临时副本产生的目标，属于验证脚本控制错误。后续 Codex x64 改为只匹配临时副本完整路径，没有停止现有应用；日志中的 `57504` 是用于匹配的 awk 进程，不是应用进程。该事件不被写成启动成功，也不扩大任何支持范围。

## 9. 卸载和清理

每个 attach 都对应了 EXIT trap 中的：

```bash
hdiutil detach "$DEVICE_NODE" -force
```

四个 detach 结果均为：

```text
"disk5" ejected.
```

最终升权 `hdiutil info`：

```text
framework       : 683.160.3
driver          : 683.160.3
```

验证结束后确认所有 DMG 挂载点已卸载。报告写入后只删除本次 `mktemp` 创建且路径已核对的临时目录；不删除用户 Downloads，不删除仓库文件。

## 10. 六项验证矩阵

| 软件 | 架构 | 下载 | 本地 hash | DMG 元数据 | 挂载 | `.app` | 架构 | Bundle ID | codesign | spctl | 复制 | 启动 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CC Switch | arm64 | PASS，28,111,538 bytes | PASS | PASS，UDZO/HFS+ | PASS | PASS，`CC Switch.app` | Universal，arm64 原生 | `com.ccswitch.desktop` | PASS | PASS | PASS | `open=0`，临时 PID 缺失 | partially-supported |
| CC Switch | x64 | PASS，同一 Universal DMG | PASS | PASS | PASS | PASS，`CC Switch.app` | Universal，x86_64 slice | `com.ccswitch.desktop` | PASS | PASS | PASS | 未在 Intel 主机测试 | not-tested |
| Claude | arm64 | PASS，353,897,855 bytes | PASS | PASS，ULFO/HFS+ | PASS | PASS，`Claude.app` | Universal，arm64 原生 | `com.anthropic.claudefordesktop` | PASS | PASS | PASS | `open=0`，临时 PID 缺失 | partially-supported |
| Claude | x64 | PASS，同一 Universal DMG | PASS | PASS | PASS | PASS，`Claude.app` | Universal，x86_64 slice | `com.anthropic.claudefordesktop` | PASS | PASS | PASS | 未在 Intel 主机测试 | not-tested |
| Codex | arm64 | PASS，643,007,873 bytes | PASS | PASS，UDZO/HFS+ | PASS | PASS，`ChatGPT.app` | 原生 arm64 thin | `com.openai.codex` | PASS | PASS | PASS | `open=0`，临时 PID 证据缺失 | partially-supported |
| Codex | x64 | PASS，631,579,926 bytes | PASS | PASS，UDZO/HFS+ | PASS | PASS，`ChatGPT.app` | 原生 x86_64 thin | `com.openai.codex` | PASS | PASS | PASS | Apple Silicon 上 `open=1`，incorrect executable format | not-tested |

## 11. 环境问题和上游包问题的区分

- 上游包证据：四个固定 URL 都能完整下载；四个本地大小和 SHA-256 都匹配；`hdiutil imageinfo`、只读挂载、`.app` 查找、Bundle 元数据、`file`/`lipo`、`codesign`、`spctl`、`ditto` 均成功。
- 当前环境证据：沙箱 DNS 阻塞了第一次网络请求；沙箱内 `hdiutil` 返回 `设备未配置`，升权只读执行后成功；当前主机有正在运行的 `/Applications` 同 Bundle ID 应用，导致 `open -n` 不能形成可区分的临时副本 PID；当前主机是 Apple Silicon，不能提供 Intel 主机启动证据。
- Codex x64 的 `incorrect executable format` 是当前 Apple Silicon 主机上运行 x86_64 DMG 的结果；不能直接归因于包损坏，也不能把 Rosetta 安装或该失败结果改写成 Intel 原生支持。
- 没有出现本次 DMG 的 `codesign` 或 `spctl` 失败，因此当前 Gatekeeper 结果不是 blocked；但启动闭环仍缺少干净实例证据，Intel 仍未完成。

## 12. Apple Silicon 和 Intel 结论

Apple Silicon：已在真实 Apple Silicon 主机完成四个 DMG 的下载、checksum、imageinfo、只读挂载、`.app`、Bundle、架构、签名、Gatekeeper 和临时复制。CC Switch、Claude、Codex arm64 的 `open` 退出码为 `0`，但已有同 Bundle ID 应用使临时副本独立 PID 证据缺失；Codex x64 在该主机上不能启动。对应矩阵保持 `partially-supported` 或 `not-tested`，没有任何一项提升为 `supported`。

Intel：未完成。没有 Intel Mac 或真实 Intel VM 的主机信息、挂载后启动、Gatekeeper 和进程证据。Universal DMG 的 x86_64 slice 以及 Codex x64 的 x86_64 thin binary 只能作为静态包证据，不能替代 Intel 验证。

## 13. 是否可以进入 macOS 实现阶段

不可以。当前只完成了 Apple Silicon 主机上的包级和签名/Gatekeeper 证据，三个软件/架构的真实启动闭环仍不完整，六项矩阵也没有全部达到 `supported`。进入安装器实现前至少需要：

1. 在不受现有同 Bundle ID 应用干扰的干净 Apple Silicon 环境中重新完成三款 arm64/Universal 副本的独立启动 PID 证据，并修正进程识别与清理流程。
2. 在真实 Intel Mac 或真实 Intel VM 中完成 CC Switch、Claude Universal 和 Codex x64 的下载复核、挂载、复制、codesign、spctl、启动和清理。
3. 继续保持 checksum 为安装硬前置，不绕过 Gatekeeper，不自动 `sudo`，不使用 Windows 包替代 macOS 包。

本报告不授权修改 `platform-support.js`、`software-manifest.js`、`install-all.js` 或任何 Windows 发布流程。

## 14. 发布和代码状态

- 本阶段只新增本报告文件。
- 没有修改 `platform-support.js`、`software-manifest.js`、`install-all.js`、`package.json`。
- 没有修改 `.github/workflows/release-windows.yml` 或 `.github/workflows/package-windows-artifacts.yml`。
- 没有生成 macOS installer 或其他 macOS 产物。
- 没有创建 macOS Release，没有创建 tag，没有发布 GitHub Release。
- 没有执行 `sudo`，没有关闭 Gatekeeper、系统完整性保护或其他安全策略。
