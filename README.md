# 智行 AI Lab

高中生 AI 小车教学工作台。Next.js 16 + React 19 离线界面；本地 Python / Ultralytics 真实分类与目标检测引擎；Electron 桌面壳把界面、引擎、基础权重、原生串口打包成一个 Windows 安装包。

## 浏览器预览
`pnpm install && pnpm dev`。无需数据库或账号，项目、标注、历史记录保存在当前浏览器 IndexedDB。

## Windows 桌面版
见 `docs/Windows桌面版构建.md`。安装包目标：Windows 10/11 x64，最终用户**不需要**安装 Node.js / Python / pnpm / Visual Studio。训练服务仅监听 127.0.0.1，图像不发送云端。

---

## 当前交付状态（请逐层区分）

| 层级 | 状态 | 说明 |
| --- | --- | --- |
| ① 源码完成 | ✅ 完成 | 桌面壳、离线 UI、Python 训练引擎、打包脚本、CI 工作流、验证脚本均已就绪并通过源码级检查。 |
| ② 构建成功 | ⏳ 待 Windows runner | 仓库已具备可复现的 `scripts/build-windows.ps1` 与 GitHub Actions 工作流；**尚未在本环境真正产出 `.exe`**（本沙箱无法运行 Windows 构建）。 |
| ③ 自动化验证通过 | 🟡 部分 | A 构建/源码检查已在本地通过（见下）；B 引擎冒烟、C 真实模型冒烟、D 安装器检查已有真实脚本，但需 Windows 环境，本环境标记为「未执行」。 |
| ④ Windows + ESP32 实机验收 | ❌ 未做 | 干净电脑安装、断网训练、串口协议与急停等必须由 Windows 实机执行，本环境无法代替。 |

### 已在本环境真正执行的检查（A 层）
- `python -m py_compile trainer/launcher.py trainer/server.py trainer/download_weights.py` → 通过
- `node --test tests/desktop.test.cjs` → 7/7 通过（隔离、协议停车、路径穿越防护、`freeze_support`、`/health` 等待、令牌鉴权、单实例）
- `zhixing-engine.spec` 已收集 `ultralytics / lap / torchvision / onnxruntime / uvicorn` 与两个基础权重

### 仅 Windows 可执行的检查（B/C/D，已附真实脚本）
- B 引擎冒烟：`node tests/engine-smoke.cjs`（启动 `zhixing-engine.exe` → `/health` 权重就绪 → 非法 `/train` 返回 400）
- C 真实模型冒烟：`py -3.11 tests/model-smoke.py`（合成极小 分类+检测 数据，CPU 训练 1 轮，推理，ONNX 导出并独立加载）
- D 安装器检查：`pwsh tests/installer-check.ps1`（体积合理、SHA256 与 `release/SHA256.txt` 一致）
- 一键本地汇总：`node tests/verify.cjs`

---

## 下一步：你只需要做什么
1. 把本仓库推送（或已推送）到你的 GitHub 仓库 `CJY18664317119/zhixing-ai-lab`。
2. 在仓库 **Actions → Build Windows Desktop** 手动触发一次（需要能运行 Windows 的 runner；本账号当前 GitHub 未授权触发，需你本人在网页端点击运行）。
3. 工作流成功后在 **Artifacts** 下载 `Zhixing-AI-Lab-Windows-x64`（含 `.exe` + `SHA256.txt` + `ACCEPTANCE.md`）。
4. 在干净 Windows 10/11 x64 电脑安装，按 `docs/Windows桌面版构建.md` 的验收清单做实机验收；ESP32 固件必须独立实现指令超时停车。

> 安装器未做代码签名，Windows 可能提示 SmartScreen，属预期。Ultralytics 权重与代码（AGPL-3.0 / 商业许可）需在分发前确认适用条件。

请勿在载人或复杂环境下直接测试小车。
