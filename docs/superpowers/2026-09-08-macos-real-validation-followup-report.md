# macOS 真实安装验证 Follow-up 报告

验证日期：2026-09-09（Asia/Shanghai）
仓库：`https://github.com/Fe1ix-deng/claude-codex-installer`
验证目录：`/var/folders/mr/3wp37gr92g9c2_v8_6h01k140000gn/T//macos-installer-validation-followup.Qpc2g6`（报告完成后删除）

## 1. 验证范围和判定

本轮只重新验证三个 arm64 DMG 的真实 macOS 链路和临时副本启动，不实现 macOS 安装逻辑，不修改 manifest、平台判断、安装编排、打包脚本或 Windows workflow。

判定严格使用以下值：`supported`、`partially-supported`、`blocked`、`failed`、`not-tested`。`open` 返回 0 但没有能够归属于临时复制路径的新 PID，不算启动成功，按要求记为 `blocked`。

## 2. 验证主机

执行记录：

```text
uname -a
Darwin appledeMacBook-Pro.local 25.6.0 Darwin Kernel Version 25.6.0: Fri Jul 31 19:18:49 PDT 2026; root:xnu-12377.161.14~5/RELEASE_ARM64_T6000 arm64

uname -m
arm64

sw_vers
ProductName:        macOS
ProductVersion:     26.6.2
BuildVersion:       25G83

node --version
v26.0.0

npm --version
11.12.1

git rev-parse HEAD
7bc24aae80d51c8e82db88bf23960b3f4a98ffbc

git status --short
?? docs/superpowers/2026-09-08-macos-real-validation-report.md
?? docs/superpowers/2026-09-08-macos-support-feasibility-report.md
?? docs/superpowers/plans/2026-09-08-macos-support-implementation-plan.md
?? docs/superpowers/specs/
```

上面的 `git status --short` 是创建本 follow-up 报告前采集的主机状态；本报告文件随后才创建。

架构和 Rosetta：

- 当前主机是 Apple Silicon，`uname -m` 为 `arm64`；不是 Intel Mac，也不是已确认的 Intel macOS VM。
- 升权后的 `sysctl -in hw.optional.arm64` 输出 `1`。
- 升权后的 `sysctl -in hw.optional.x86_64` 没有输出；不把空输出解释为 Intel 主机能力。
- `pkgutil --pkg-info com.apple.pkg.RosettaUpdateAuto` 退出码为 `0`，版本为 `1.0.0.0.1786586848`。
- `arch -x86_64 true` 退出码为 `0`，但这只是当前 Apple Silicon 上的 Rosetta 能力证据，不是 Intel 主机证据，也不替代 Intel 原生启动验证。
- 沙箱内直接读取两条 `sysctl` 返回 `Operation not permitted`；该限制与升权后的只读结果分别记录在临时日志中。

本轮没有删除或修改用户现有的 `/Applications/CC Switch.app`、`/Applications/Claude.app` 或 `/Applications/ChatGPT.app`。

## 3. 已审计来源和重新下载

所有 URL 均直接取自 `docs/superpowers/2026-09-08-macos-support-feasibility-report.md`，没有重新猜测 URL。下载前删除本轮临时目录中的同名文件；所有后续挂载、复制和启动都只在远端长度与本地大小一致、且 SHA-256 通过后执行。

| 软件 | 上游项目 / Release | 初始下载 URL | 最终 URL（签名 query 省略） | HTTP / 重定向 | Content-Length | 本地大小 | 文件名 | checksum 来源 | 期望 SHA-256 |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| CC Switch | `https://github.com/farion1231/cc-switch` / `https://github.com/farion1231/cc-switch/releases/tag/v3.20.2` | `https://github.com/farion1231/cc-switch/releases/download/v3.20.2/CC-Switch-v3.20.2-macOS.dmg` | `https://release-assets.githubusercontent.com/github-production-release-asset/1031912724/47be75e7-4aaf-40df-b0ce-bb43a49f2702` | `302` -> `200`，1 次 | 28,111,538 | 28,111,538 | `CC-Switch-v3.20.2-macOS.dmg` | 可行性报告记录的 GitHub Release API `asset.digest` | `847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec` |
| Claude Desktop | `https://github.com/Wangnov/claude-app-mirror` / `https://github.com/Wangnov/claude-app-mirror/releases/tag/claude-app-v1.46388.4` | `https://github.com/Wangnov/claude-app-mirror/releases/download/claude-app-v1.46388.4/Claude-mac-universal.dmg` | `https://release-assets.githubusercontent.com/github-production-release-asset/1254138541/9145757e-77f8-479b-b573-89e3d456dd5e` | `302` -> `200`，1 次 | 353,897,855 | 353,897,855 | `Claude-mac-universal.dmg` | `SHA256SUMS.txt`，同时与清单 hash 核对 | `c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9` |
| Codex arm64 | `https://github.com/Wangnov/codex-app-mirror` / `https://github.com/Wangnov/codex-app-mirror/releases/tag/codex-app-26.901.51231` | `https://github.com/Wangnov/codex-app-mirror/releases/download/codex-app-26.901.51231/Codex-mac-arm64.dmg` | `https://release-assets.githubusercontent.com/github-production-release-asset/1230652236/941b5331-f8d4-4765-b6ac-e58c1f7be4ab` | `302` -> `200`，1 次 | 643,007,873 | 643,007,873 | `Codex-mac-arm64.dmg` | `SHA256SUMS-macos.txt`，同时与清单 hash 核对 | `b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082` |

下载命令：

```bash
curl -L --fail --retry 3 --retry-delay 2 \
  -D "$VALIDATION_ROOT/logs/<software>-headers.txt" \
  -o "$VALIDATION_ROOT/downloads/<exact-file-name>" \
  -w 'http_code=%{http_code}\nurl_effective=%{url_effective}\nnum_redirects=%{num_redirects}\nsize_download=%{size_download}\n' \
  '<verified-url>'
```

三份包的 `curl` 退出码均为 `0`，最终响应均为 `HTTP/2 200`，且响应头中最终 `content-length` 与本地文件大小一致。Claude 本轮先删除旧文件后全量重新下载，没有复用上一轮约 131 MB 的截断文件。

## 4. SHA-256 验证

每个 DMG 均执行：

```bash
shasum -a 256 "$VALIDATION_ROOT/downloads/<file>"
```

结果如下，均在挂载前通过：

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
```

没有发生 hash 缺失、文件名歧义、架构交叉匹配或 checksum 不一致；因此三份包均允许进入后续 DMG 验证。

## 5. DMG 元数据

每个通过 checksum 的 DMG 均执行：

```bash
hdiutil imageinfo "$DMG_PATH"
```

| DMG | imageinfo 退出码 | 镜像格式 | 描述 / 压缩 | Total Bytes | 文件系统 / 分区 | Checksummed | Partitioned | 损坏报告 |
| --- | ---: | --- | --- | ---: | --- | --- | --- | --- |
| CC Switch | 0 | `UDZO` | compressed UDIF read-only, zlib | 89,166,336 | Apple_HFS / HFS+ | true | false | 未报告 |
| Claude | 0 | `ULFO` | compressed UDIF read-only, lzfse | 1,345,323,008 | Apple_HFS / HFS+ | true | false | 未报告 |
| Codex arm64 | 0 | `UDZO` | compressed UDIF read-only, zlib | 1,587,076,096 | Apple_HFS / HFS+ | true | false | 未报告 |

## 6. 只读挂载、`.app` 和架构

使用的挂载命令：

```bash
hdiutil attach "$DMG_PATH" -readonly -nobrowse -plist
```

真实设备和挂载点均从 attach plist 的 `system-entities` 解析，没有猜测 `/Volumes/...`：

| 软件 | attach 退出码 | 设备节点 | 挂载点 | `find` 结果 | 临时复制目标 |
| --- | ---: | --- | --- | --- | --- |
| CC Switch | 0 | `/dev/disk5s1` | `/Volumes/CC Switch` | `/Volumes/CC Switch/CC Switch.app` | `$VALIDATION_ROOT/apps/CC Switch.app` |
| Claude | 0 | `/dev/disk5s1` | `/Volumes/Claude` | `/Volumes/Claude/Claude.app` | `$VALIDATION_ROOT/apps/claude-arm64/Claude.app` |
| Codex arm64 | 0 | `/dev/disk5s1` | `/Volumes/ChatGPT Installer` | `/Volumes/ChatGPT Installer/ChatGPT.app` | `$VALIDATION_ROOT/apps/codex-arm64/ChatGPT.app` |

包内 Bundle 元数据和主可执行文件：

| 软件 | `.app` 路径 | CFBundleIdentifier | CFBundleExecutable | 主可执行文件实际路径 | `file` / `lipo -info` | arm64 |
| --- | --- | --- | --- | --- | --- | --- |
| CC Switch | `/Volumes/CC Switch/CC Switch.app` | `com.ccswitch.desktop` | `cc-switch` | `/Volumes/CC Switch/CC Switch.app/Contents/MacOS/cc-switch` | Universal binary，架构 `x86_64 arm64` | 原生 arm64 slice |
| Claude | `/Volumes/Claude/Claude.app` | `com.anthropic.claudefordesktop` | `Claude` | `/Volumes/Claude/Claude.app/Contents/MacOS/Claude` | Universal binary，架构 `x86_64 arm64` | 原生 arm64 slice |
| Codex arm64 | `/Volumes/ChatGPT Installer/ChatGPT.app` | `com.openai.codex` | `ChatGPT` | `/Volumes/ChatGPT Installer/ChatGPT.app/Contents/MacOS/ChatGPT` | `Mach-O 64-bit executable arm64`; `Non-fat file ... architecture: arm64` | 原生 arm64 |

关键原始输出：

```text
CC Switch:
Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]
Architectures in the fat file: .../cc-switch are: x86_64 arm64

Claude:
Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]
Architectures in the fat file: .../Claude are: x86_64 arm64

Codex arm64:
Mach-O 64-bit executable arm64
Non-fat file: .../ChatGPT is architecture: arm64
```

Codex 的 Bundle ID 是 `com.openai.codex`，主可执行文件是 `ChatGPT`；没有按进程显示名推断身份。

## 7. codesign 和 Gatekeeper

对三个挂载 DMG 中的实际 `.app` 均执行：

```bash
codesign --verify --deep --strict --verbose=4 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
```

| 软件 | codesign 退出码 | codesign 结果 | spctl 退出码 | spctl 结果 |
| --- | ---: | --- | ---: | --- |
| CC Switch | 0 | `valid on disk`; `satisfies its Designated Requirement` | 0 | `accepted`; `source=Notarized Developer ID` |
| Claude | 0 | helpers/frameworks validated；`valid on disk`; `satisfies its Designated Requirement` | 0 | `accepted`; `source=Notarized Developer ID` |
| Codex arm64 | 0 | frameworks/helpers/plugins validated；`valid on disk`; `satisfies its Designated Requirement` | 0 | `accepted`; `source=Notarized Developer ID` |

没有执行 `xattr -d com.apple.quarantine`，没有关闭 Gatekeeper 或 SIP，没有执行 `sudo`。这些结果是本轮 DMG 中实际 `.app` 的当前主机检查结果，不替代 Intel 主机证据。

## 8. 临时复制

复制均在 checksum、imageinfo、挂载、`.app` 和签名检查之后执行：

```bash
ditto "$APP_PATH" "$DEST_APP"
du -sh "$APP_PATH" "$DEST_APP"
defaults read "$DEST_APP/Contents/Info.plist" CFBundleIdentifier
```

| 软件 | ditto | 源 / 目标大小 | 复制后 Bundle ID |
| --- | ---: | --- | --- |
| CC Switch | 0 | `58M` / `58M` | `com.ccswitch.desktop` |
| Claude | 0 | `833M` / `834M` | `com.anthropic.claudefordesktop` |
| Codex arm64 | 0 | `1.3G` / `1.3G` | `com.openai.codex` |

没有写入 `/Applications`。复制结束后每个 DMG 都通过从 attach plist 取得的设备节点执行：

```bash
hdiutil detach "$DEVICE_NODE" -force
```

三次 detach 退出码均为 `0`，结果为设备 ejected。最终 `hdiutil info` 只显示 framework/driver，没有本轮挂载残留。

## 9. 干净启动验证

### 9.1 识别规则

启动前保存现有进程快照；启动命令为：

```bash
open -n "$DEST_APP"
sleep 10
ps -axo pid=,ppid=,command=
```

只接受包含临时复制路径主可执行文件的真实进程行，例如：

```text
$VALIDATION_ROOT/apps/<id>/<App>.app/Contents/MacOS/<executable>
```

采集脚本先将 `ps` 保存到文件，再用独立的 `awk` 过滤，排除了采集 shell 自身；没有使用宽泛的 `pkill -f`。没有匹配到临时路径 PID 时不执行 kill。

### 9.2 结果

| 软件 | Bundle ID | 启动前现有进程 | `open` | 10 秒内临时路径新 PID | kill | 结论 |
| --- | --- | --- | ---: | --- | --- | --- |
| CC Switch arm64 | `com.ccswitch.desktop` | PID `2822`：`/Applications/CC Switch.app/Contents/MacOS/cc-switch` | 0 | 无 | 无 | `blocked` |
| Claude arm64 | `com.anthropic.claudefordesktop` | 没有匹配 `/Applications/Claude.app/Contents/MacOS/Claude` 的主进程行 | 0 | 无 | 无 | `blocked` |
| Codex arm64 | `com.openai.codex` | PID `50126`：`/Applications/ChatGPT.app/Contents/MacOS/ChatGPT` | 0 | 无 | 无 | `blocked` |

Codex 还在默认沙箱权限下做过一次启动尝试：`open=1`，错误为 `kLSNoExecutableErr: The executable is missing`，同时 `ps` 被沙箱返回 `Operation not permitted`。临时主可执行文件实际存在、权限为 `-rwxr-xr-x`、`file` 为 arm64，且升权的短 `open -n` 尝试返回 `0`；升权后仍没有临时路径 PID。因此该错误只作为当前执行环境的附加证据，不归因于 DMG 损坏。

三款 arm64 应用均未获得能够确认归属于临时复制路径的新 PID：`0/3`。没有停止任何用户现有应用或本轮之外的进程。

## 10. 六项矩阵

本轮只对 arm64 重新执行真实下载和安装链路；Intel 项没有在当前主机执行。

| 软件 | 架构 | 下载 | 本地 hash | DMG 元数据 | 挂载 | `.app` | 架构 | Bundle ID | codesign | spctl | 复制 | 启动 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CC Switch | arm64 | PASS，28,111,538 bytes | PASS | PASS，UDZO/HFS+ | PASS | PASS，`CC Switch.app` | Universal，arm64 原生 | `com.ccswitch.desktop` | PASS | PASS | PASS | `open=0`，无临时 PID | blocked |
| CC Switch | x64 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未测试 | 未测试 | 静态 Universal slice 证据不替代 Intel | 未测试 | 未测试 | 未测试 | 未测试 | not-tested |
| Claude | arm64 | PASS，353,897,855 bytes | PASS | PASS，ULFO/HFS+ | PASS | PASS，`Claude.app` | Universal，arm64 原生 | `com.anthropic.claudefordesktop` | PASS | PASS | PASS | `open=0`，无临时 PID | blocked |
| Claude | x64 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未测试 | 未测试 | 静态 Universal slice 证据不替代 Intel | 未测试 | 未测试 | 未测试 | 未测试 | not-tested |
| Codex | arm64 | PASS，643,007,873 bytes | PASS | PASS，UDZO/HFS+ | PASS | PASS，`ChatGPT.app` | 原生 arm64 thin | `com.openai.codex` | PASS | PASS | PASS | `open=0`，无临时 PID | blocked |
| Codex | x64 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未在 Intel 主机测试 | 未测试 | 未测试 | 不使用 Apple Silicon/Rosetta 替代 | 未测试 | 未测试 | 未测试 | 未测试 | not-tested |

## 11. 环境问题与上游包问题区分

### 已确认的上游包证据

- 三份 arm64 DMG 均完整下载，HTTP 最终响应为 200。
- Content-Length 与本地文件大小完全匹配。
- 三份本地 SHA-256 与报告中的上游 digest/checksum 清单完全匹配。
- 三份 `hdiutil imageinfo` 均可读且没有损坏报告。
- 三份 DMG 均成功只读挂载，并从 plist 找到 `.app`。
- `.app` 的 Bundle 元数据和主 Mach-O 架构符合包内容；Codex 是 `com.openai.codex` / `ChatGPT` / arm64。
- 三份 `.app` 的 `codesign` 和 `spctl` 均通过。
- 三份 `.app` 均可复制到本次临时目录。

### 已确认的当前环境因素

- 沙箱内 `sysctl` 和 `ps` 存在权限限制；升权后可以读取架构能力、挂载 DMG 和获取进程快照。
- 当前主机为 Apple Silicon；没有 Intel 主机或真实 Intel VM 的原生启动环境。
- CC Switch 和 Codex 启动前分别存在 `/Applications` 同 Bundle ID 主进程；三款均没有形成可确认属于临时复制路径的新 PID。
- Codex 默认沙箱启动返回 `kLSNoExecutableErr`，升权 `open` 返回 0；两种结果都没有产生临时路径主进程，不能把它写成应用启动成功或上游包损坏。

## 12. Apple Silicon 结论

Apple Silicon 的包级证据已经完成：下载、checksum、DMG 元数据、只读挂载、`.app`、Bundle、arm64、签名、Gatekeeper、临时复制和卸载均有直接记录。

但三款 arm64 临时副本均没有出现能够确认路径归属的新 PID，所以三行结论为 `blocked`，不是 `supported`。本报告不把 `open=0`、Release 存在、远端 digest 或静态架构信息写成 macOS 已支持。

## 13. Intel 验证结论和所需条件

Intel 验证未完成，六项矩阵中的 x64 行均为 `not-tested`。本轮没有使用 Rosetta 结果替代 Intel 原生验证。

完成 Intel 验证至少需要：

1. 真实 Intel Mac，或确认运行在 x86_64 CPU 的 Intel macOS VM；必须记录 `uname -m` 为 `x86_64`，不能只是 Apple Silicon 上的 `arch -x86_64`。
2. 可用的 macOS Launch Services、`hdiutil`、`codesign`、`spctl`、`open` 和进程读取能力，并有可用图形登录会话。
3. 对 CC Switch Universal、Claude Universal 和 Codex x64 DMG 使用报告中的同一已审计 URL 重新下载、比较 Content-Length、计算本地 SHA-256，再重复 imageinfo、只读挂载、`.app`、`file`/`lipo`、复制、签名、Gatekeeper、启动和 detach。
4. 启动前记录同 Bundle ID 的现有进程；启动后只接受包含临时复制路径的 x86_64 主进程 PID，并只停止本轮确认的 PID。

## 14. 是否可以进入 macOS 安装实现阶段

不可以。进入实现前仍缺少：

- 三款 arm64 应用独立临时副本 PID：`0/3`，全部 `blocked`。
- CC Switch、Claude Universal 和 Codex x64 在真实 Intel Mac/Intel macOS VM 上的完整证据：全部 `not-tested`。

在上述证据完成前，继续保持 feasibility-only，不修改 `platform-support.js`、`software-manifest.js`、`install-all.js`，不新增 macOS manifest，不生成 macOS 产物，不创建 macOS Release，不打 tag。

## 15. 代码、发布和清理状态

- 本轮只新增本报告文件。
- 没有修改 `platform-support.js`、`software-manifest.js`、`install-all.js`、`package.json`。
- 没有修改 `.github/workflows/release-windows.yml` 或 `.github/workflows/package-windows-artifacts.yml`。
- 没有生成 macOS installer 或其他 macOS 产物。
- 没有创建 macOS Release、GitHub Release 或 tag。
- 没有执行 `sudo`，没有关闭 Gatekeeper、SIP 或其他系统安全策略。
- 每次本轮 `hdiutil attach` 都有对应的 `hdiutil detach`；最终 `hdiutil info` 无挂载残留。
- 报告写入后只删除本次 `mktemp` 创建的临时目录，不删除用户 Downloads 或用户现有应用。
