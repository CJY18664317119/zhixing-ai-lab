# Windows 桌面版构建与验收

## 桌面版结构
- Electron 独立窗口加载打包后的离线 HTML / JS，不再要求 localhost:3000 网页服务器。
- 渲染器启用 sandbox、contextIsolation，禁用 Node；仅通过 preload 的限定方法访问项目、引擎、串口。
- 项目通过原子替换保存到 `%APPDATA%/智行 AI Lab/projects/projects.json`（实际路径由 Electron userData 决定）。
- PyInstaller 将真实 Python 训练引擎及依赖、两个基础权重放入安装包。引擎监听操作系统分配的本机端口，并用随机令牌鉴权。
- 串口走 serialport，不依赖 Web Serial。关闭窗口前尝试发送 STOP、关闭串口，并结束本应用的引擎进程。
- NSIS 安装器支持选择安装目录、桌面快捷方式，卸载默认保留用户数据。安装器尚未签名，Windows 可能显示 SmartScreen 提示。

## 构建要求
Windows 10/11 x64、Python 3.11、Node 22、pnpm 10。串口模块通常有预编译包，若没有则需 Visual Studio C++ Build Tools。首次构建需联网，建议磁盘剩余 15GB。

在工程根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

输出：`release/Zhixing-AI-Lab-0.1.0-Windows-x64.exe`。

也提供 `.github/workflows/windows-desktop.yml`，工程推送至自己的 GitHub 仓库后可手动触发工作流，并下载构建产物。本轮并未触发远端工作流，不能将其等同于已经生成的安装包。

## 开发调试
`pnpm desktop:ui` 生成离线界面，`pnpm desktop:dev` 打开窗口。若未构建 `desktop-runtime`，窗口仍能标注与管理项目，但会提示训练引擎未连接，绝不会生成假训练结果。

## 验收清单（必须 Windows 实机执行）
- 在没有 Python、Node 的干净电脑上安装，断网后打开独立窗口。
- 建立分类、检测项目，导入和标注；重启后数据可恢复。
- 两类任务各完成一次真实训练；检测 GPU 不可用时 CPU 能运行。
- 对未参与训练的图片推理；ONNX 导出可独立加载。
- 架空车轮连接 ESP32，验证协议内容、限频、低置信度门槛、急停。
- 关闭窗口及拔掉 USB 后小车停车：拔掉 USB 的停车必须由 ESP32 固件负责。
- 运行时不依赖网络；升级和卸载保留数据符合预期。

## 当前状态
已实现桌面桥接、离线 UI 构建、原生串口、本地引擎生命周期和 Windows 打包脚本。Linux 沙箱仅能检查源码及静态构建，未完成 Windows 安装包生成与硬件验收。数据仍集中存储为 JSON（含图片），大数据集磁盘布局、实时连续推理、检测框编辑及模型管理增强待后续完善。
