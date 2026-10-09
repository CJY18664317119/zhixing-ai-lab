$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
py -3.11 -m venv .venv
& .venv/Scripts/python.exe -m pip install -r trainer/requirements.txt
New-Item -Force -ItemType Directory trainer/weights | Out-Null
Push-Location trainer/weights
& ../../.venv/Scripts/python.exe -c "from ultralytics import YOLO; YOLO('yolo11n.pt'); YOLO('yolo11n-cls.pt')"
Pop-Location
pnpm install
pnpm build
Write-Host '安装完成。之后可断网运行 scripts/start-windows.ps1'
