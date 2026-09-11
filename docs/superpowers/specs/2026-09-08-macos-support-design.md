# macOS Support Feasibility Design

日期：2026-09-08
状态：`experimental / implementation-in-progress`；本文件不授权正式支持、Release 或 tag。

## 2026-09-10 决策更新

本节是对 2026-09-08 设计阶段门槛的增量覆盖，不删除或改写后续真实验证报告中的事实。

- 允许现在实现 `darwin/arm64` 的实验性平台检测、已审计 DMG manifest、下载和 SHA-256 校验、只读挂载、`.app` 查找、Bundle 校验、复制到 `~/Applications`、卸载清理、单元测试和 GitHub Actions 构建/验证 workflow。
- 旧设计中“完成三款应用独立启动验收后才能修改代码”的限制已由本次项目决策覆盖。三款应用独立启动证据仍保持 `blocked`，这只阻止正式支持结论，不阻止实验版代码开发。
- macOS Apple Silicon 在本阶段只能标记为 `experimental / implementation-in-progress`；GitHub Actions 和后续真实环境验收完成前不得标记为 `supported`。
- `darwin/x64` 完全后置：保持 `not-tested`，不进入当前安装路径，不生成 Intel 产物，不使用 Rosetta 代替 Intel 原生证据。
- macOS 安装器可以未签名、未公证，但不得自动关闭 Gatekeeper/SIP、删除 quarantine 属性或使用 `sudo`；文档只指导用户先校验 SHA-256，再用 Finder 右键 `Open` 或 System Settings → Privacy & Security → Open Anyway 手动放行。
- 不创建 macOS Release 或 tag，不修改 Windows Release 资产；Windows x64/ARM64 行为必须零回归。

上述决策只覆盖实现前置门槛，不覆盖安全约束、上游来源约束或真实验证报告的 `blocked`/`not-tested` 结论。

## 审计结论

截至 2026-09-08，现有可行性报告和真实验证报告不足以支持“宣称 macOS 正式支持”。三款软件的 `darwin/arm64` 独立启动结论仍为 `blocked`，`darwin/x64` 仍为 `not-tested`；这不再阻止按 2026-09-10 决策开发实验版代码。

项目当前 Windows 行为是既有基线。实验版新增只面向 `darwin/arm64` 的 manifest 和安装路径；`darwin/x64` 和其他非 Windows/非 Apple Silicon 目标不得回退到 Windows 资产。Windows 行为保持不变。

## 证据矩阵

状态含义：`通过` 表示该架构有直接证据；`候选` 只表示 Release/扩展名/清单声称存在，不能替代本地验证；`未通过` 表示没有合格证据；`不适用` 表示没有执行或不能从现有材料推断。

| 软件 / 架构 | 下载成功 | SHA-256 成功 | 包格式正确 | 安装成功 | Bundle ID | Gatekeeper/签名 | 启动成功 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC Switch arm64 | 通过：DMG 已完整下载 | 通过：DMG hash 与 GitHub API 一致 | 候选：DMG 资产存在；未能挂载/检查容器 | 未通过 | 未通过 | 未通过；仅有 tar.gz `.sig` 来源，未做本机验证 | 未通过 |
| CC Switch x64 | 通过：同一 DMG 下载；上游 `latest.json` 声称双架构 | 通过：同一 DMG hash；不是 x64 独立包校验 | 候选；未能挂载/检查容器 | 未通过 | 未通过 | 未通过 | 未通过 |
| Claude Desktop arm64 | 未通过：本地仅 131 MB 截断文件 | 未通过：截断文件 hash 不等于清单 hash | 候选：universal DMG 资产和长度已声明；未完成结构检查 | 未通过 | 未通过 | 未通过 | 未通过 |
| Claude Desktop x64 | 未通过：本地仅 131 MB 截断文件 | 未通过：截断文件 hash 不等于清单 hash | 候选：universal 理论覆盖 x64；未完成结构检查 | 未通过 | 未通过 | 未通过 | 未通过 |
| Codex / ChatGPT arm64 | 未通过：仅有 Release/HTTP 证据，未留合格本地下载验收记录 | 未通过：清单和远端 checksum 一致，但未对本地文件复算 | 候选：独立 DMG；格式/挂载未验证 | 未通过 | 通过（Release manifest：`com.openai.codex`） | 未通过；仅有 Team ID/Sparkle 签名字段 | 未通过 |
| Codex / ChatGPT x64 | 未通过：仅有 Release/HTTP 证据，未留合格本地下载验收记录 | 未通过：同上 | 候选：独立 DMG；格式/挂载未验证 | 未通过 | 通过（Release manifest：`com.openai.codex`） | 未通过 | 未通过 |

HTTP `200`、DMG 扩展名、Release 资产存在和远端清单 digest 只能证明候选来源可访问或被声明，不能提升为 macOS 支持。

## 阻塞分类

### `hdiutil attach` 返回“设备未配置”

这是当前审计沙箱/主机环境导致的验证失败：挂载服务或设备能力不可用，且外部特权尝试未获许可。它不是上游包损坏的证据，也不是永久的 macOS 产品限制。它确实阻塞了当前环境中的自动 DMG 安装和包内检查；必须在可用的真实 macOS 主机重新执行 `hdiutil attach -readonly -nobrowse`，并在 `finally` 中始终执行 `hdiutil detach`。若真实主机仍失败，才把它升级为该包/该安装链路的真实阻塞。

### `codesign` 的 `invalid signature` 与 `spctl` internal error

这些结果来自机器上已经存在的应用，不是本安装器刚下载并安装的候选包。现有证据不足以区分“上游签名确实无效”和“本机 Code Signing 子系统/应用残留状态异常”，所以不能把它写成上游包已确认损坏，也不能写成环境无关的通过。它是 Gatekeeper 闭环的真实阻塞：在干净真实 macOS 主机上对同一下载文件执行 `codesign --verify --deep --strict`、`spctl --assess --type execute` 和首次启动；任一步失败，都必须停止自动安装并给出明确提示。

## 设计边界

实验实现只允许选择报告中已经审计并在 Apple Silicon 主机完成包级验证的 `darwin/arm64` 条目。流程固定为：检测 `darwin/arm64` -> 选择固定 manifest -> 下载到临时工作目录 -> 检查 HTTP/文件长度 -> 完整 SHA-256 成功 -> DMG 只读挂载/解析 plist -> 查找并读取 `.app` -> 检查运行状态、Bundle ID 和主可执行文件 -> `ditto` 复制到 `~/Applications` -> Bundle/可执行文件复核 -> 无条件卸载和清理。签名/Gatekeeper 检查可记录结果，但失败时不得绕过安全策略；独立启动仍应如实记录为 `blocked`，不提升支持矩阵。

不得自动调用 `sudo`；不写 `/Applications`；不强制结束运行中的用户应用。目标应用正在运行时返回可识别的 `blocked`/重试状态。`darwin/x64` 不进入当前安装路径。

系统命令必须通过可注入的 `execFile`/`spawn` 边界调用。挂载点使用临时目录并在成功、失败、取消三种路径都清理；checksum 缺失、截断、歧义或不匹配均不得安装。Gatekeeper 失败不得静默绕过或建议禁用安全策略。

## 方案比较与推荐

1. **只实现 Apple Silicon**：只在真实 arm64 主机验收并发布 arm64 条目。范围最小、验证成本低，但 Intel 用户继续保持 feasibility-only；不能因为 Claude/CC Switch 是 universal 就跳过 arm64 包内检查。
2. **Apple Silicon 和 Intel 同时实现**：在 Apple Silicon 与 Intel 真实主机分别验收，或对 universal 包完成双架构 Mach-O 验证，并为 Codex 保留独立 DMG。覆盖面最好，但需要两套主机/VM、更多 Gatekeeper 和启动证据。
3. **先完成真实 macOS 安装验证再实现**：这是 2026-09-08 的原始推荐，要求暂不改代码或 manifest。

2026-09-10 的项目决策覆盖了方案 3 中“启动验收是代码实现前置条件”的部分，选择“只实现 Apple Silicon 实验版”。启动证据的支持结论门槛仍然有效：任何缺失都保持 `blocked`、`partially-supported` 或 `not-tested`，不能作为正式发布依据。

## 验收与发布门槛

- 真实 macOS arm64 和（若选择双架构）x64 主机完成完整日志和版本记录。
- checksum 成功是安装硬前置，失败删除缓存且不执行复制/安装。
- `/Applications` 写入不自动 sudo；权限不足时显示可操作错误。
- DMG 只读挂载，复制后无条件卸载并清理临时目录。
- Bundle ID、主可执行文件、最低 macOS 版本和 Mach-O 架构来自实际 `.app`，不得套用 Windows 值。
- `codesign`/`spctl` 任一失败时明确告知“无法验证签名/Gatekeeper，未继续安装”，不绕过安全策略。
- 启动后记录 `open` 返回、主进程出现和退出状态。
- 全量 `npm test` 及既有 Windows x64/ARM64 真机回归通过。
- 在实验实现、GitHub Actions 验证和后续真实环境验收完成前，不宣称 macOS 正式支持；本阶段不创建 macOS Release、不打 tag、不修改 Windows Release。是否生成临时测试 artifact 必须在报告中单独记录，不能当作 Release。

## AGENTS.md 状态约束建议

根目录 `AGENTS.md` 已按 2026-09-10 决策更新：macOS Apple Silicon 为实验性实现中，Intel 暂不实现，真实启动报告保持 `blocked`，正式支持、Release 和 tag 仍被禁止。
