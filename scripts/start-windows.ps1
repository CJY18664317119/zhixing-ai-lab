$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path '.venv/Scripts/python.exe')) { throw '请先运行 scripts/setup-windows.ps1 完成首次联网安装' }
$env:YOLO_OFFLINE = 'true'
Start-Process '.venv/Scripts/python.exe' -ArgumentList '-m uvicorn trainer.server:app --host 127.0.0.1 --port 8765'
pnpm start
