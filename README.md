# 智行 AI Lab
高中生 AI 小车教学工作台，Next.js 16 + React 19；本地 Python / Ultralytics 真实分类与目标检测引擎。

## 浏览器预览
`pnpm install && pnpm dev`。无需数据库或账号。项目、标注和历史记录保存在当前浏览器 IndexedDB。

## Windows 本地运行
见 `docs/课堂快速开始.md`。首次联网运行 `scripts/setup-windows.ps1`，以后用 `scripts/start-windows.ps1`。训练服务仅监听 127.0.0.1:8765，图像不发送云端。YOLO 基础权重必须已下载。

## 当前验收
- TypeScript 类型检查、Next.js 生产构建通过。
- 浏览器创建项目交互通过。
- Python 语法检查通过，尚未安装大体积训练依赖并实测训练。
- 桌面壳源码只是骨架；未生成或验收 Windows 安装包。
- 没有 ESP32 实机或虚拟串口联调，不保证当前软件完成安全控制验收。

完整的已实现范围与限制见课堂快速开始文档。请勿在地面载人或复杂环境下直接测试小车；ESP32 必须独立实现超时停车。

Ultralytics 权重和代码的许可（AGPL-3.0 / 商业许可）需要在分发安装包前确认适用条件。
