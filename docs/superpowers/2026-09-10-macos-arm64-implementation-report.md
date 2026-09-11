# macOS Apple Silicon 实验版实现报告

日期：2026-09-11（Asia/Shanghai）
决策日期：2026-09-10
分支：`feature/macos-arm64-experimental`
提交 hash：最终交付提交 hash 在交付摘要中列出。

## 1. 范围和状态

本阶段实现 macOS Apple Silicon（`darwin/arm64`）实验版安装链路，状态保持：
`experimental / implementation-in-progress`。

2026-09-10 的项目决策只覆盖“在三款应用独立启动验收仍为 `blocked` 时允许修改代码”的阶段门槛。它没有覆盖安全约束、来源约束、真实验证结果或正式发布门槛。历史真实验证报告未修改，三款应用的独立启动结论仍为 `blocked`。

macOS Intel/x64（`darwin/x64`）本阶段完全后置，保持 `not-tested`；没有 Intel 安装路径、Intel 产物或 Rosetta 验证。

## 2. 实现内容

- 增加 `darwin/arm64` 平台检测和目标状态 `experimental`。
- 增加三个已审计上游 Release 的 arm64 DMG manifest，固定 URL、文件名、文件大小、SHA-256、Bundle ID、主可执行文件、最低 macOS 版本和用户安装路径。
- 下载后先验证固定文件大小，再验证固定 SHA-256；缺失、截断或不匹配时不挂载、不复制，并删除本次失败缓存。
- 使用 `hdiutil attach -readonly -nobrowse -plist` 只读挂载，从 plist 解析真实设备节点和挂载点。
- 递归查找期望的 `.app`，校验 Bundle ID、主可执行文件、最低系统版本和 arm64 Mach-O 架构。
- 在复制前执行 `codesign --verify --deep --strict` 和 `spctl --assess --type execute`；失败时停止，不绕过 Gatekeeper 或 SIP。
- 使用 `ditto` 复制到当前用户的 `~/Applications`，不写 `/Applications`，不使用 `sudo`。
- 目标应用运行时返回 `blocked`，不强制结束用户进程。
- 无论成功或失败都执行 DMG 卸载和临时目录清理；清理失败会保留原始错误并记录 cleanup error。
- 增加 Node 单元测试和手动触发的 arm64 GitHub Actions 构建/验证 workflow。

## 3. 固定上游来源

| 应用 | 资产 | SHA-256 | 大小 |
| --- | --- | --- | ---: |
| CC Switch | `CC-Switch-v3.20.2-macOS.dmg` | `847327c8acf320b8f3e1122676dd3921ff4dc7aa02ed1974579c8d7b00894dec` | 28,111,538 |
| Claude Desktop | `Claude-mac-universal.dmg` | `c5451dba21b8bf4232f8feffbff946dc7be4d6a64ee22d3190954e16f62444c9` | 353,897,855 |
| Codex | `Codex-mac-arm64.dmg` | `b6ffed73d581047862e85de5b4d322ba431004949a5338736e7059182dff6082` | 643,007,873 |

URL 和 hash 均来自此前已审计的可行性/真实验证报告；本阶段没有猜测下载链接，也没有使用 Windows 下载地址。

## 4. 验证结果

本地 Apple Silicon 环境执行：

```text
npm test                                      90/90 passed
node --check install-all.js                   passed
node --check macos-installer.js               passed
node --check platform-support.js              passed
node --check software-manifest.js             passed
scoped git diff --check                       passed
```

本地实验版打包结果：

```text
file dist/ai-installer-macos-arm64
Mach-O 64-bit executable arm64

SHA-256
01504b1a2069ebfa9a85ce6f5902fff5702827f3ada9dda851911b8ca62f0285

--print-target
{"platform":"darwin","arch":"arm64","isWindows":false}
```

测试覆盖了目标检测、manifest 隔离、固定大小和 SHA-256 前置、截断文件拒绝、DMG 只读挂载参数、Bundle 校验、架构校验、Gatekeeper 错误、运行中应用阻塞、复制失败、卸载失败和临时目录清理。

## 5. Windows 回归

现有 Windows x64/ARM64 真机安装、启动和 PE 验证报告保持原样，没有修改 Windows Release workflow 或既有 Release 资产。历史基线为 `npm test 69/69`，Windows x64/ARM64 实机安装与三款应用启动均为通过；本次新增测试套件最终为 `90/90`，其中包含原有 Windows 测试。

本次在当前 macOS 主机没有重新执行 Windows 实机安装；因此报告使用既有真实 Windows 验证证据，不把 macOS 本地测试冒充 Windows 实机证据。历史验证报告按原文保留，其中已有的 Markdown 行尾硬换行空白未被改写。

## 6. 当前支持矩阵

| 应用 | `darwin/arm64` | `darwin/x64` |
| --- | --- | --- |
| CC Switch | `blocked`：独立临时副本启动 PID 证据仍缺失 | `not-tested` |
| Claude Desktop | `blocked`：独立临时副本启动 PID 证据仍缺失 | `not-tested` |
| Codex | `blocked`：独立临时副本启动 PID 证据仍缺失 | `not-tested` |

`experimental / implementation-in-progress` 描述的是安装器代码阶段，不是三款应用的正式支持结论。

## 7. GitHub Actions workflow

workflow 文件：`.github/workflows/package-macos-arm64.yml`。

触发方式：在 GitHub 仓库的 **Actions** 页面选择 **Package macOS Apple Silicon artifact**，点击 **Run workflow**。它只使用 `macos-15` arm64 runner，执行测试、静态检查、`pkg@5.8.1` 版本校验和 arm64 打包，然后生成 `SHA256SUMS.txt`、`file-evidence.txt`、`build-evidence-macos-arm64.txt` 并上传名为 `ai-installer-macos-arm64-experimental` 的临时 artifact，保留 14 天。

该 workflow 明确记录 `signed=false`、`notarized=false`、`launch not-tested`，并声明 artifact 不是 Release。当前本次任务没有触发 GitHub Actions，因此没有新的远端 artifact；已生成的是本地测试用 arm64 Mach-O 文件，不纳入提交。

## 8. 安全和发布边界

- 未创建 macOS Release。
- 未创建 tag。
- 未修改现有 Windows Release。
- 未使用 `sudo`。
- 未强制结束用户正在运行的应用。
- 未关闭 Gatekeeper 或 SIP。
- 未自动删除 quarantine 属性。
- 未把 `blocked` 改成 `supported`，也未把 Intel `not-tested` 改成其他状态。
- 未提交本地生成的 `dist/ai-installer-macos-arm64` 或 `node_modules`。

未签名、未公证安装器的用户指导只要求先核对 SHA-256，再使用 Finder 右键 `Open`，或在 System Settings → Privacy & Security → Open Anyway 手动放行。
