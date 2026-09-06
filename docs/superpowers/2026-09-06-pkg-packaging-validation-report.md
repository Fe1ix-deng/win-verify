# Windows 打包验收报告

## 结论

专用 workflow run [34036249580](https://github.com/Fe1ix-deng/win-verify/actions/runs/34036249580) 已成功完成。x64 与原生 ARM64 的构建、artifact 下载后身份校验、PE 校验、`--print-target`、三款软件安装和 GUI 启动验证全部通过。

源码修复提交为 `0812b959b7fe26e687180d55dc8fc1ae48506849`。CC Switch MSI 是 per-user 安装包，实际目录为 `%LOCALAPPDATA%\\Programs\\CC Switch\\CC-Switch.exe`；源码和验收脚本已从此前错误的 `Program Files` 路径修正为该官方 WiX 配置对应的目录。

## 保留产物

| 架构 | 文件 | 字节数 | SHA-256 | PE machine | `--print-target` |
| --- | --- | ---: | --- | --- | --- |
| x64 | `dist/ai-installer-win-x64.exe` | 37,706,526 | `6906E0B58B62CD306E10235E8800887B0CB474C65F3685034FD148F9B2E9DF80` | `0x8664` | `{"platform":"win32","arch":"x64","isWindows":true,"windowsBuild":26100}` |
| ARM64 | `dist/ai-installer-win-arm64.exe` | 27,230,014 | `2CFAD9CDCD2E96178CA73A8B7B02C53357D0EE39C09029C64E530AE462BF4923` | `0xAA64` | `{"platform":"win32","arch":"arm64","isWindows":true,"windowsBuild":26200}` |

`dist/SHA256SUMS.txt` 从下载后的实际文件重新生成。构建证据与下载后证据中的字节数和 SHA-256 完全一致。

## Artifact 证据

| 内容 | Artifact ID | Artifact digest |
| --- | ---: | --- |
| x64 installer | `9990262154` | `sha256:aaf964844b1e8b16cdc757b0a159226f4f7865439ee03d76c31b723693125847` |
| ARM64 installer | `9990269300` | `sha256:8907121e6cfee48f0a7903db9ccd367f317ef59d8eaa740cf58363c2707d9ebc` |
| x64 validation evidence | `9990315009` | `sha256:60132f080245d676a315669eaf767a7176aeb0673f2c78da1d1567abb1eac149` |
| ARM64 validation evidence | `9990332706` | `sha256:8e7e834bfb9dcaee70daae0421ff3533b0b7f7a2b832e307ad8f65bc0284732c` |

构建 runner 为 `windows-latest` 和 `windows-11-arm`，artifact retention 为 14 天。两个验证 job 均在对应的新 runner 上通过下载后的文件执行。

## 安装与启动结果

两架构均记录：`installerSucceeded=True`、`failureCount=0`、退出码 `0`、Claude/Codex 各一次 `SHA-256 校验通过`，`[错误]` 行数量为 `0`。

- CC Switch：x64/ARM64 均存在 `C:\\Users\\runneradmin\\AppData\\Local\\Programs\\CC Switch\\CC-Switch.exe`；`Get-StartApps` 找到 `com.ccswitch.desktop`；启动进程 `CC-Switch`，状态 `passed`。
- Claude：x64 包 `Claude_1.46388.4.0_x64__pzs8sxrjxfjjc`，ARM64 包 `Claude_1.46388.4.0_arm64__pzs8sxrjxfjjc`；状态 `Ok`；AUMID `Claude_pzs8sxrjxfjjc!Claude`；清单 executable `app\\Claude.exe`；两架构启动状态 `passed`。
- Codex：x64 包 `OpenAI.Codex_26.901.6511.0_x64__2p2nqsd0c76g0`，ARM64 包 `OpenAI.Codex_26.901.6511.0_arm64__2p2nqsd0c76g0`；状态 `Ok`；AUMID `OpenAI.Codex_2p2nqsd0c76g0!App`；清单 executable 规范化为 `app/ChatGPT.exe`；两架构启动状态 `passed`。

验证仅删除 runner 当前用户的 `Downloads\\AI工具安装包` 缓存。未签名状态由两个 PE 的 Security Directory 均为 `0x0` 确认。

## 本地最终验证

以下命令均通过：

```text
npm test                         69/69 passed
node --test scripts/verify-pe.test.js  4/4 passed
node --check install-all.js
node --check scripts/verify-pe.js
node scripts/verify-pe.js dist/ai-installer-win-x64.exe x64
node scripts/verify-pe.js dist/ai-installer-win-arm64.exe arm64
```

未生成 Windows x86 产物；未创建或覆盖 `ai-installer.exe`。本次 run 的 GitHub Actions 告警为 Actions 使用的 Node.js 20 弃用提示，以及 `windows-11-arm` runner 将于 2026-09-21 起迁移 Visual Studio 2026 的通知；这些告警未影响验收结果。
