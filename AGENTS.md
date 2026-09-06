# Project-Level Decisions

This file records decisions that apply to all future work in this repository.

## Windows Support and Packaging

- Official packaged targets are Windows x64 and native Windows ARM64 only.
- Do not generate or advertise a Windows x86/32-bit artifact.
- The packaged entry point is `install-all.js`.
- Packaged filenames are `dist/ai-installer-win-x64.exe` and `dist/ai-installer-win-arm64.exe`.
- Do not create, overwrite, or publish the legacy `ai-installer.exe` alias.
- Build with the locked `pkg@5.8.1` dependency and verify PE machine values before release.
- Codex's stable AppUserModelId is `OpenAI.Codex_2p2nqsd0c76g0!App`; its packaged executable is `app/ChatGPT.exe`.
- Claude's stable AppUserModelId is `Claude_pzs8sxrjxfjjc!Claude`.
- CC Switch is a per-user MSI; its validated executable path is `%LOCALAPPDATA%\\Programs\\CC Switch\\CC-Switch.exe` and its Start Apps AppID is `com.ccswitch.desktop`.

## Signing

- The certificate strategy is OV code signing, not EV.
- Apply to the SignPath Foundation free open-source signing program; do not purchase a certificate or manage a private key locally.
- SignPath Foundation is expected to retain the private key in its HSM and perform signing from GitHub Actions.
- The SignPath application and approval are an independent task and must not block development or unsigned releases.
- Until approval is granted, artifacts are explicitly unsigned and integrity is communicated with `SHA256SUMS.txt`.
- Do not add certificates, private keys, passwords, signing secrets, or invented SignPath identifiers to this repository.

## Release

- The public distribution channel is a formal GitHub Release triggered by a version tag.
- GitHub Actions artifacts are temporary build evidence, not the public distribution channel.
- The unsigned release path may proceed while SignPath review is pending; after approval, signed executables can be added through a separate, auditable signing step.
- A release must include architecture-specific executables and a checksum file generated from those exact files.

## Third-Party Dependencies and Provenance

- The upstream projects listed in `THIRD-PARTY-NOTICES.md` are MIT-licensed dependencies. Preserve each upstream LICENSE text and original copyright line verbatim.
- The project must retain source links and retrieval dates for each copied license text so future upstream license changes can be audited.
- Use this exact provenance statement in product descriptions and the SignPath application materials:

  > 本工具本身不构建、不修改、不托管 Claude/Codex 的官方二进制文件，安装包分别来自上述三个项目各自发布的 GitHub Release。

- The installer downloads upstream releases at runtime. It does not build, modify, or host Claude or Codex official binaries.
