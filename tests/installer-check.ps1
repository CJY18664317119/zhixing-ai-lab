# D. Installer / desktop check — run on Windows after the workflow produces release/*.exe.
# Verifies the installer exists, is not absurdly large, and its SHA256 matches
# release/SHA256.txt. Does not install or launch the app (that is real-machine acceptance).
# Usage: pwsh tests/installer-check.ps1
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$exe = Get-ChildItem -Path (Join-Path $repo 'release') -Filter *.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { Write-Host '未执行：release/ 下没有安装器，请先运行构建或下载 CI 产物'; exit 2 }
$shaFile = Join-Path $repo 'release/SHA256.txt'
if (-not (Test-Path $shaFile)) { Write-Host '未执行：缺少 release/SHA256.txt'; exit 2 }
$actual = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash
$expected = (Get-Content $shaFile | Where-Object { $_ -like "*$($exe.Name)" }) -replace '\s+',' ' -split ' ' | Select-Object -First 1
$sizeMB = [math]::Round($exe.Length / 1MB, 1)
$ok = $actual -eq $expected
Write-Host "安装器: $($exe.Name)"
Write-Host "大小: $sizeMB MB"
Write-Host "SHA256: $actual"
Write-Host "${($ok ? '✅' : '❌')} SHA256 与 SHA256.txt 一致: $expected"
if ($sizeMB -gt 2000) { Write-Warning '安装器超过 2000 MB，发布前需评估构件/NSIS 限制。' }
if ($ok) { Write-Host "`nD 安装器检查：通过" } else { Write-Host "`nD 安装器检查：失败"; exit 1 }
