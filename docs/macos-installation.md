# macOS Apple Silicon 实验版

当前 macOS 支持范围仅为 Apple Silicon（`darwin/arm64`），状态为
`experimental / implementation-in-progress`。Intel macOS（`darwin/x64`）本阶段
保持 `not-tested`，不进入安装路径，也不生成 Intel 产物。

## 未签名安装器

本工具的 macOS 安装器当前未签名、未公证。下载后先使用发布页面或 GitHub
Actions artifact 中的 `SHA256SUMS.txt` 校验安装器；只有 SHA-256 匹配的文件才应继续使用。

如果 macOS 首次打开时阻止安装器：

1. 在 Finder 中右键安装器，选择 `Open`。
2. 如果仍被阻止，打开 `System Settings` → `Privacy & Security`。
3. 点击 `Open Anyway`，确认后重新打开安装器。

不要关闭 Gatekeeper、SIP 或其他系统安全功能，也不要执行来源不明的命令。
只对来自本项目 GitHub Release 或 GitHub Actions artifact、且 SHA-256 匹配的文件
进行人工放行。

安装器的签名状态与上游应用的签名状态分开：本工具未签名、未公证，不代表
Claude、Codex/ChatGPT 或 CC Switch 上游应用未签名。安装流程会在复制前记录并
检查上游 `.app` 的 Bundle 信息、arm64 架构和 `codesign`/`spctl` 结果；检查失败
时不会绕过系统安全策略。

## 安装位置和限制

应用只复制到当前用户的 `~/Applications`，不要求 `sudo`，不写入 `/Applications`。
如果目标应用正在运行，安装器不会强制结束它，会返回 `blocked` 并要求退出后重试。
DMG 以只读方式挂载，复制后卸载；checksum、挂载、`.app` 查找、Bundle 校验或复制
失败时会清理本次临时文件。不会删除 Downloads 中的无关文件或用户已有应用。

截至 2026-09-10，三款应用在真实 Apple Silicon 环境的独立临时副本启动证据仍为
`blocked`；这允许实验版代码开发，但不构成 macOS 正式支持结论。
