# ============================================================
#  NoteMaster Build Script
#  Usage:
#    .\build.ps1                  Fast mode, unpacked dir only
#    .\build.ps1 -installer       Generate NSIS installer (.exe)
#    .\build.ps1 -check           Run typecheck + lint before build
#    .\build.ps1 -clean           Clean all build artifacts
#    .\build.ps1 -installer -check   Full check + installer
# ============================================================

param(
    [switch]$installer,
    [switch]$check,
    [switch]$clean
)

$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot"

$MIRROR_ELECTRON = "https://npmmirror.com/mirrors/electron/"
$MIRROR_BUILDER  = "https://npmmirror.com/mirrors/electron-builder-binaries/"

$ELECTRON_VITE    = "node_modules\electron-vite\bin\electron-vite.js"
$ELECTRON_BUILDER = "node_modules\electron-builder\cli.js"
$ELECTRON_INSTALL = "node_modules\electron\install.js"
$ELECTRON_EXE     = "node_modules\electron\dist\electron.exe"

$BUILD_OUTPUT_DIR = ""
$TIMER = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step { param($msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "    [WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param($msg) Write-Host "    [ERROR] $msg" -ForegroundColor Red }
function Abort      { param($msg) Write-Err $msg; pause; exit 1 }

# ----------------------------------------------------------------
#  0. Banner
# ----------------------------------------------------------------
$modeLabel = if ($installer) { "NSIS Installer (.exe)" } else { "Unpacked Dir (verify)" }
$checkLabel = if ($check) { "ON (typecheck + lint)" } else { "OFF" }
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  NoteMaster Build Script" -ForegroundColor Magenta
Write-Host "  Mode : $modeLabel" -ForegroundColor Magenta
Write-Host "  Check: $checkLabel" -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta

# ----------------------------------------------------------------
#  -clean: cleanup only
# ----------------------------------------------------------------
if ($clean) {
    Write-Step "Cleaning build artifacts"
    Remove-Item -Recurse -Force out   -ErrorAction SilentlyContinue; Write-OK "Removed out/"
    Remove-Item -Recurse -Force dist  -ErrorAction SilentlyContinue; Write-OK "Removed dist/"
    Get-ChildItem -Filter "electron.vite.config.*.mjs" | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Directory -Filter "output-*" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-OK "Removed output-* dirs"
    Write-Host "`nCleanup done." -ForegroundColor Green
    pause
    exit 0
}

# ----------------------------------------------------------------
#  1. Environment check
# ----------------------------------------------------------------
Write-Step "1. Environment check"

if (-not (Test-Path "node_modules")) {
    Abort "node_modules not found. Please run: npm install"
}
$nodeVer = & node --version
Write-OK "Node.js $nodeVer"

if (-not (Test-Path $ELECTRON_VITE))    { Abort "electron-vite not installed" }
if (-not (Test-Path $ELECTRON_BUILDER)) { Abort "electron-builder not installed" }
Write-OK "electron-vite + electron-builder ready"

# ----------------------------------------------------------------
#  2. Fix npm isolated packages
# ----------------------------------------------------------------
Write-Step "2. Fix npm isolated packages"

$fixScript = @"
var f=require('fs'),p=require('path'),nm='__NMDIR__',fixed=0,errs=0,dirs=0;
function syncDir(src,dst){
  var st; try{st=f.statSync(src)}catch(e){return}
  if(!st.isDirectory())return;
  try{if(!f.existsSync(dst))f.mkdirSync(dst,{recursive:true})}catch(e){return}
  var items; try{items=f.readdirSync(src)}catch(e){return}
  for(var i=0;i<items.length;i++){
    var s=p.join(src,items[i]),d=p.join(dst,items[i]);
    var st2; try{st2=f.statSync(s)}catch(e){continue}
    if(st2.isDirectory()){syncDir(s,d)}
    else if(st2.isFile()&&!f.existsSync(d)){try{f.copyFileSync(s,d);fixed++}catch(e){errs++}}
  }
  dirs++;
}
var all=f.readdirSync(nm);
for(var j=0;j<all.length;j++){
  var dn=all[j];
  if(!dn.startsWith('.'))continue;
  var ld=dn.lastIndexOf('-');if(ld<2)continue;
  var name=dn.slice(1,ld);
  if(name==='bin'||name==='cache'||name==='package-lock'||name.length<2)continue;
  var src=p.join(nm,dn),dst=p.join(nm,name);
  if(!f.existsSync(dst)||!f.statSync(dst).isDirectory())continue;
  syncDir(src,dst);
}
console.log('Synced '+fixed+' files from '+dirs+' dirs, '+errs+' errors');
"@
$fixScript = $fixScript.Replace('__NMDIR__', (Resolve-Path "node_modules").Path.Replace('\', '\\'))
node -e $fixScript 2>&1 | Out-Null
Write-OK "npm isolation fixed"

# ----------------------------------------------------------------
#  3. Electron binary download
# ----------------------------------------------------------------
Write-Step "3. Electron binary check"

if (-not (Test-Path $ELECTRON_EXE)) {
    Write-Warn "electron.exe missing, downloading via mirror..."
    & {
        $env:ELECTRON_MIRROR = $MIRROR_ELECTRON
        node $ELECTRON_INSTALL
    }
    if ($LASTEXITCODE -ne 0) {
        Abort "Electron download failed. Try: npm install"
    }
    Write-OK "electron.exe downloaded"
} else {
    Write-OK "electron.exe exists"
}

# ----------------------------------------------------------------
#  3. Pre-check (optional)
# ----------------------------------------------------------------
if ($check) {
    Write-Step "4. TypeScript type check"
    $vueTscScripts = Get-ChildItem "node_modules\.bin\" | Where-Object {
        $_.Name -like 'vue-tsc*' -and $_.Name -like '*.ps1'
    }
    $vueTsc = $vueTscScripts | Select-Object -First 1
    if ($vueTsc) {
        & $vueTsc.FullName --noEmit
        if ($LASTEXITCODE -ne 0) { Abort "TypeScript type check failed" }
        Write-OK "Type check passed"
    } else {
        Write-Warn "vue-tsc not found, skipping type check"
    }

    Write-Step "5. ESLint check"
    $eslintScripts = Get-ChildItem "node_modules\.bin\" | Where-Object {
        $_.Name -like 'eslint*' -and $_.Name -like '*.ps1'
    }
    $eslint = $eslintScripts | Select-Object -First 1
    if ($eslint) {
        & $eslint.FullName src --ext .ts,.vue
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "ESLint has warnings"
        } else {
            Write-OK "ESLint check passed"
        }
    } else {
        Write-Warn "eslint not found, skipping"
    }
} else {
    Write-Step "4. Pre-check (skipped)"
    Write-OK "Use -check to enable typecheck + lint"
}

# ----------------------------------------------------------------
#  5. Generate icon
# ----------------------------------------------------------------
$stepNum = if ($check) { 6 } else { 5 }
Write-Step "$stepNum. Generate icon (resources/icon.png)"

node scripts\gen-icon.js
if ($LASTEXITCODE -ne 0) {
    Write-Err "Icon generation failed"
    pause
    exit 1
}
Write-OK "Icon generated"

# ----------------------------------------------------------------
#  6. Compile source
# ----------------------------------------------------------------
$stepNum++
Write-Step "$stepNum. Compile source (electron-vite build)"

node $ELECTRON_VITE build
if (-not (Test-Path "out\main\index.js") -or -not (Test-Path "out\renderer\index.html")) {
    Write-Err "Compile failed, output files missing"
    pause
    exit 1
}
Write-OK "Compile done -> out/ + dist/"

# ----------------------------------------------------------------
#  5. Package
# ----------------------------------------------------------------
$stepNum++
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$BUILD_OUTPUT_DIR = "output-$ts"
$env:BUILD_OUTPUT = $BUILD_OUTPUT_DIR

$pkgLabel = if ($installer) { "NSIS Installer" } else { "Unpacked Dir" }
Write-Step "$stepNum. Package ($pkgLabel)"
Write-Host "    Output dir: $BUILD_OUTPUT_DIR" -ForegroundColor DarkGray

$env:ELECTRON_MIRROR = $MIRROR_ELECTRON
$env:ELECTRON_BUILDER_BINARIES_MIRROR = $MIRROR_BUILDER

$ebArgs = @("build", "--win", "--publish=never")
if (-not $installer) { $ebArgs += "--dir" }

& node $ELECTRON_BUILDER @ebArgs
if ($LASTEXITCODE -ne 0) {
    Write-Err "Package failed"
    $env:BUILD_OUTPUT = $null
    pause
    exit 1
}
$env:BUILD_OUTPUT = $null
Write-OK "Package done"

# ----------------------------------------------------------------
#  6. Cleanup intermediate files
# ----------------------------------------------------------------
$stepNum++
Write-Step "$stepNum. Cleanup intermediate files"
Remove-Item -Recurse -Force out   -ErrorAction SilentlyContinue; Write-OK "Removed out/"
Remove-Item -Recurse -Force dist  -ErrorAction SilentlyContinue; Write-OK "Removed dist/"
Get-ChildItem -Filter "electron.vite.config.*.mjs" | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -Force "pkgname.txt" -ErrorAction SilentlyContinue

# ----------------------------------------------------------------
#  7. Output result
# ----------------------------------------------------------------
$TIMER.Stop()
$elapsed = [math]::Round($TIMER.Elapsed.TotalSeconds, 1)
$modeText = if ($installer) { "NSIS Installer" } else { "Unpacked Dir" }

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Build SUCCESS" -ForegroundColor Green
Write-Host "  Elapsed: $elapsed s" -ForegroundColor Green
Write-Host "  Mode   : $modeText" -ForegroundColor Green

$exe = Get-ChildItem -Path $BUILD_OUTPUT_DIR -Filter "NoteMaster.exe" -Recurse | Select-Object -First 1
if ($exe) {
    Write-Host "  Path: $($exe.FullName)" -ForegroundColor Yellow
    Write-Host "  Size: $([math]::Round($exe.Length/1MB, 1)) MB" -ForegroundColor Yellow
}
if ($installer) {
    $setup = Get-ChildItem -Path $BUILD_OUTPUT_DIR -Filter "NoteMaster Setup*.exe" -Recurse | Select-Object -First 1
    if ($setup) {
        Write-Host "  Installer: $($setup.FullName)" -ForegroundColor Yellow
        Write-Host "  Size: $([math]::Round($setup.Length/1MB, 1)) MB" -ForegroundColor Yellow
    }
}
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
pause
