# Windows 桌面版构建与验收

面向最终用户：Windows 10/11 x64，安装后**不需要** Node.js / Python / pnpm / Visual Studio。
安装包内含本地训练引擎、两个基础权重（yolo11n.pt / yolo11n-cls.pt）、离线界面与原生串口。

## 桌面版结构
- Electron 独立窗口加载打包后的离线 HTML / JS（`desktop-ui`），不再要求 localhost:3000 网页服务器。
- 渲染器启用 `sandbox`、`contextIsolation`，禁用 Node；仅通过 preload 的限定方法访问项目、引擎、串口。
- 项目通过原子替换（写 `.tmp` 再 `rename`）保存到 `userData/projects/projects.json`。
- PyInstaller 将真实 Python 训练引擎及依赖（`ultralytics / lap / torchvision / onnxruntime / uvicorn`）、两个基础权重打包进 `desktop-runtime/zhixing-engine`；安装时作为 `extraResources` 放到 `resources/engine`。引擎监听操作系统分配的本机端口，并用随机令牌鉴权。
- 串口走 `serialport`，不依赖 Web Serial；停车指令按用户选择的协议（文字 / 数字 / JSON）生成，避免硬编码 `STOP` 与 ESP32 不兼容。
- 关闭窗口前尝试发送停车、关闭串口，并只结束本应用启动的引擎进程。
- NSIS 安装器支持选择安装目录、桌面快捷方式，卸载默认保留用户数据。安装器未签名，Windows 可能显示 SmartScreen 提示。

## 自行构建（Windows 本机）
要求：Windows 10/11 x64、Python 3.11、Node 22、pnpm 10；串口模块通常有预编译包，否则需 Visual Studio C++ Build Tools。首次构建需联网（下载权重与 npm 包），建议磁盘剩余 15GB。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

脚本会（全部使用 ASCII，规避 PowerShell 5.1 的 UTF-8-BOM 解析问题）：
1. 建 `.venv`（py -3.11），安装 `trainer/requirements.txt`（含 PyInstaller、`lap==0.5.12` 固定）。
2. 早期源码检查：`py_compile` + `node --check` + `package.json` 的 `extraResources.to === 'engine'`。
3. 下载并校验两个基础权重到 `trainer/weights/`（已存在且有效则跳过）。
4. `pyinstaller zhixing-engine.spec` 打包引擎，校验 `zhixing-engine.exe` 与 `_internal/trainer/weights/*` 存在且非空。
5. `pnpm install --frozen-lockfile` → `electron-builder install-app-deps`（重建 serialport 原生模块）→ 生成离线界面 → `node --test tests/desktop.test.cjs`。
6. `electron-builder --win nsis --x64` 生成安装器；写 `release/SHA256.txt`；超 2000MB 给出告警。
7. 所有原生命令通过 `$LASTEXITCODE` 检查，普通 stderr 不视为失败。

产物：`release/Zhixing-AI-Lab-0.1.0-Windows-x64.exe` 与 `release/SHA256.txt`。

## 通过 GitHub Actions 构建（推荐，无需本机工具链）
仓库已含 `.github/workflows/windows-desktop.yml`：
- `workflow_dispatch` 手动触发；`windows-latest` runner，90 分钟超时。
- 安装 pnpm 10 / Node 22 / Python 3.11，并用 choco 安装 VS Build Tools（serialport 原生兜底）。
- 使用 npmmirror 镜像避免 GitHub 连接重置；`YOLO_OFFLINE=true`、`YOLO_AUTOINSTALL=false` 保证打包后引擎离线。
- **不自动发布公开 Release**；成功后在 Artifacts 提供 `*.exe` + `SHA256.txt` + `ACCEPTANCE.md`，保留 14 天（`retain_days` 可改）。
- 失败时上传 `build-log/` 便于排查。
- 仅 `contents: read` 最小权限，不传递任何令牌。

> 本环境（Linux 沙箱）未授权触发该工作流，也不会把它等同于已生成的安装包。请在你的 GitHub 网页端手动运行。

## 自动化验证（A/B/C/D）
- A 构建与源码检查（可本地/CI 跑）：`node tests/verify.cjs`
  - Python 语法编译、桌面桥接单元测试（7/7）、离线界面产物、spec 收集完整性。
- B 引擎冒烟（需打包引擎）：`node tests/engine-smoke.cjs`
- C 真实模型冒烟（需 venv + 权重）：`py -3.11 tests/model-smoke.py`
- D 安装器检查（需 `.exe`）：`pwsh tests/installer-check.ps1`

本环境只真正跑通了 A 层；B/C/D 已提供真实脚本，待 Windows 环境执行。

## 验收清单（必须 Windows + ESP32 实机执行）
- 在没有 Python、Node 的干净电脑上安装，断网后打开独立窗口。
- 建立分类、检测项目，导入和标注；重启后数据可恢复。
- 两类任务各完成一次真实训练；检测 GPU 不可用时 CPU 能运行。
- 对未参与训练的图片推理；ONNX 导出可独立加载。
- 架空车轮连接 ESP32，验证协议内容、限频、低置信度门槛、急停。
- 关闭窗口及拔掉 USB 后小车停车：拔掉 USB 的停车必须由 ESP32 固件负责。
- 运行时不依赖网络；升级和卸载保留数据符合预期。

## 当前状态
源码、打包脚本、CI 工作流、验证脚本已完成并通过源码级检查（A 层）。**尚未在本环境真正产出 Windows 安装包（② 待 Windows runner），也未做实机验收（④）。** 数据仍集中存储为 JSON（含图片），大数据集磁盘布局、实时连续推理、检测框编辑及模型管理增强待后续完善。

Ultralytics 权重和代码的许可（AGPL-3.0 / 商业许可）需要在分发安装包前确认适用条件。请勿在地面载人或复杂环境下直接测试小车。
