# Build the Windows x64 desktop installer for Zhixing AI Lab.
# Written in ASCII so it is safe under Windows PowerShell 5.1 (UTF-8 without
# BOM caused "string missing terminator" in Chinese scripts). GitHub Actions
# runs this with pwsh 7.x.
# Native commands (python, pip, pyinstaller, pnpm, electron-builder) do NOT
# raise PowerShell errors by themselves, so every native call is checked via
# $LASTEXITCODE. Normal stderr logs are NOT treated as failure.
param()
$ErrorActionPreference = 'Stop'
# pwsh 7.4+ only; makes native non-zero exits throw. Ignored on PowerShell 5.1.
$PSNativeCommandUseErrorActionPreference = $true

$repo = Split-Path $PSScriptRoot -Parent
Set-Location $repo
$buildLogDir = Join-Path $repo 'build-log'
New-Item -ItemType Directory -Force -Path $buildLogDir | Out-Null
$logFile = Join-Path $buildLogDir ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -Path $logFile -Append | Out-Null

# Offline engine: never auto-download deps or weights at train/inference time.
$env:YOLO_OFFLINE = 'true'
$env:YOLO_AUTOINSTALL = 'false'
# Mirrors to avoid GitHub connection resets seen on some networks.
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:npm_config_registry = 'https://registry.npmmirror.com'

function Invoke-Checked {
    param([string]$Name, [scriptblock]$Cmd)
    Write-Host "==> STEP: $Name"
    & $Cmd
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Write-Host "FAILED: $Name exited with code $LASTEXITCODE"
        throw "Step '$Name' exited with code $LASTEXITCODE"
    }
}

# --- locate python 3.11 -------------------------------------------------
if (Get-Command python -ErrorAction SilentlyContinue) {
    $Py = 'python'
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $Py = 'py'; $PyVer = '-3.11'
} else {
    throw 'Python 3.11 not found (need py -3.11 or python on PATH)'
}
Write-Host "Using python launcher: $Py $($PyVer)"

# --- 1. virtual environment ---------------------------------------------
$venvPy = Join-Path $repo '.venv/Scripts/python.exe'
Invoke-Checked 'create venv' {
    if ($PyVer) { & $Py $PyVer -m venv .venv } else { & $Py -m venv .venv }
}

# --- 2. install python deps + PyInstaller -----------------------------
Invoke-Checked 'install python requirements' {
    & $venvPy -m pip install --upgrade pip
    # Bundle the CPU-only torch build: the offline engine runs on student laptops
    # without a GPU. The default (CUDA) torch wheel is >2 GB and makes PyInstaller
    # OOM / exit 1 while collecting binaries; CPU torch keeps the bundle small.
    & $venvPy -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    & $venvPy -m pip install -r trainer/requirements.txt
}

# --- 2b. source-level checks (cheap gate before the slow packaging) -----
Invoke-Checked 'source syntax checks' {
    & $venvPy -m py_compile trainer/launcher.py trainer/server.py trainer/download_weights.py
    & node --check desktop/main.cjs
    & node --check desktop/preload.cjs
}
$pack = Get-Content package.json -Raw | ConvertFrom-Json
if ($pack.build.extraResources[0].to -ne 'engine') { throw 'package.json extraResources.to must be "engine"' }
Write-Host 'source checks OK (py_compile + node --check + extraResources.to=engine)'

# --- 3. download base weights into trainer/weights --------------------
Invoke-Checked 'download base weights' {
    & $venvPy trainer/download_weights.py
}
foreach ($w in @('yolo11n.pt','yolo11n-cls.pt')) {
    $p = Join-Path $repo ('trainer/weights/' + $w)
    if (-not (Test-Path $p)) { throw "weight missing after download: $w" }
    if ((Get-Item $p).Length -eq 0) { throw "weight is empty: $w" }
    Write-Host "weight OK: $w $((Get-Item $p).Length) bytes"
}

# --- 4. package python engine with PyInstaller -------------------------
$pyiLog = Join-Path $buildLogDir 'pyinstaller.log'
Invoke-Checked 'pyinstaller package engine' {
    & $venvPy -m PyInstaller zhixing-engine.spec --noconfirm --clean --distpath desktop-runtime --log-level INFO *> $pyiLog
    $code = $LASTEXITCODE
    Write-Host "----- PyInstaller output (tail) -----"
    Get-Content $pyiLog | Select-Object -Last 150 | Write-Host
    if ($code -and $code -ne 0) { throw "PyInstaller exited with code $code" }
}

# --- 5. verify packaged engine layout ----------------------------------
$engineExe = Join-Path $repo 'desktop-runtime/zhixing-engine/zhixing-engine.exe'
$wt1 = Join-Path $repo 'desktop-runtime/zhixing-engine/_internal/trainer/weights/yolo11n.pt'
$wt2 = Join-Path $repo 'desktop-runtime/zhixing-engine/_internal/trainer/weights/yolo11n-cls.pt'
foreach ($f in @($engineExe,$wt1,$wt2)) {
    if (-not (Test-Path $f)) { throw "packaged engine layout missing: $f" }
    if ((Get-Item $f).Length -eq 0) { throw "packaged file empty: $f" }
}
Write-Host "engine layout OK"

# --- 6. install pnpm deps + rebuild native serialport for electron -----
Invoke-Checked 'pnpm install' {
    & pnpm install --frozen-lockfile
}
Invoke-Checked 'rebuild serialport for electron' {
    & pnpm exec electron-builder install-app-deps
}

# --- 7. build offline desktop UI ---------------------------------------
Invoke-Checked 'build offline UI' {
    & pnpm exec node scripts/build-desktop.cjs
}

# --- 7b. desktop bridge unit tests (require built offline UI) ----------
Invoke-Checked 'desktop bridge unit tests' {
    & node --test tests/desktop.test.cjs
}

# --- 8. build NSIS installer -------------------------------------------
Invoke-Checked 'electron-builder NSIS' {
    & pnpm exec electron-builder --win nsis --x64
}

# --- 9. write SHA256 of installer --------------------------------------
$exeFiles = Get-ChildItem -Path (Join-Path $repo 'release') -Filter *.exe -ErrorAction SilentlyContinue
if (-not $exeFiles) { throw 'no installer produced in release/' }
$shaLines = $exeFiles | ForEach-Object {
    $h = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    "$h  $($_.Name)"
}
$shaLines | Out-File -FilePath (Join-Path $repo 'release/SHA256.txt') -Encoding ascii
Write-Host ($shaLines -join [Environment]::NewLine)

# --- size guard ---------------------------------------------------------
$sizeMB = [math]::Round((($exeFiles | Measure-Object -Property Length -Sum).Sum) / 1MB, 1)
Write-Host "Installer total size: $sizeMB MB"
if ($sizeMB -gt 2000) {
    Write-Warning "Installer is larger than 2000 MB. NSIS/artifact limits may apply; consider an external weights download or web installer before publishing."
}

Write-Host "BUILD SUCCEEDED"
Stop-Transcript | Out-Null
exit 0
