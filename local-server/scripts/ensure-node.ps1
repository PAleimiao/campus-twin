<#
  ensure-node.ps1 -- make sure Node.js is available for the campus-twin local server.

  What it does, in order:
    1) look for an existing node.exe
       (PATH / .runtime portable / Program Files / %LOCALAPPDATA% / WorkBuddy managed)
    2) if missing, download a PORTABLE zip and extract it  (NO admin rights needed)
    3) if that fails, download the MSI and install it SILENTLY (/qn)
    4) if that fails, open the MSI installer GUI and WAIT for the user to finish,
       then confirm success by reading the MSI install log
    5) on success: write the resolved node.exe path to <RuntimeDir>\node-path.txt, exit 0

  The .bat calls this with -RuntimeDir. ASCII only on purpose: Windows PowerShell 5.1
  may mis-decode a non-BOM UTF-8 .ps1 and garble non-ASCII text.
#>
param(
  [string]$Version    = 'v20.18.0',
  [string]$RuntimeDir = (Join-Path $PSScriptRoot '..\.runtime')
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function Log($m) { Write-Host $m }

function Result($path) {
  try { New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null } catch {}
  # diagnostics only -- the .bat re-detects Node itself (cmd is Unicode-safe for ?? paths)
  try { Set-Content -Path (Join-Path $RuntimeDir 'node-path.txt') -Value $path -Encoding UTF8 } catch {}
  Log "[OK] node: $path"
  Write-Output $path
  exit 0
}

function Find-Node {
  $c = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($c -and $c.Source -and (Test-Path $c.Source)) { return $c.Source }

  $cands = @(
    (Join-Path $RuntimeDir ("node-$Version-win-x64\node.exe")),
    "$env:ProgramFiles\nodejs\node.exe",
    "${env:ProgramFiles(x86)}\nodejs\node.exe",
    "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
  )
  foreach ($p in $cands) { if ($p -and (Test-Path $p)) { return $p } }

  $wb = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
  if (Test-Path $wb) {
    $hit = Get-ChildItem -Path $wb -Directory |
           Where-Object { Test-Path (Join-Path $_.FullName 'node.exe') } |
           Select-Object -First 1
    if ($hit) { return (Join-Path $hit.FullName 'node.exe') }
  }
  return $null
}

$found = Find-Node
if ($found) { Result $found }

Log "[i] Node.js is not installed on this computer."
Log "[i] Step 1/3: downloading a PORTABLE copy (no admin needed)..."

$mirrors = @(
  "https://registry.npmmirror.com/-/binary/node/$Version",
  "https://cdn.npmmirror.com/binaries/node/$Version",
  "https://nodejs.org/dist/$Version",
  "https://npmmirror.com/mirrors/node/$Version"
)
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

function Download($name, $out) {
  foreach ($m in $mirrors) {
    $url = "$m/$name"
    Log "[i]   try $url"
    try {
      Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 90
      if ((Test-Path $out) -and ((Get-Item $out).Length -gt 1000000)) { return $true }
    } catch {}
  }
  return $false
}

$zipName    = "node-$Version-win-x64.zip"
$extractSub = "node-$Version-win-x64"
$zipPath    = Join-Path $RuntimeDir $zipName
$portable   = Join-Path $RuntimeDir "$extractSub\node.exe"

if (-not (Test-Path $portable)) {
  if (Download $zipName $zipPath) {
    Log "[i] extracting..."
    try { Expand-Archive -LiteralPath $zipPath -DestinationPath $RuntimeDir -Force }
    catch { try { [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $RuntimeDir) } catch {} }
    Remove-Item $zipPath -Force
  }
}
if (Test-Path $portable) { Result $portable }

# ---------------- silent MSI ----------------
Log "[i] Step 2/3: portable failed, trying SILENT MSI install..."
$msiName = "node-$Version-x64.msi"
$msiPath = Join-Path $RuntimeDir $msiName
$ok = $false
if (Download $msiName $msiPath) {
  $log = Join-Path $RuntimeDir 'node-install.log'
  Log "[i] running installer silently (may take a minute)..."
  $p = Start-Process msiexec.exe -ArgumentList "/i","`"$msiPath`"","/qn","/norestart","/l*v","`"$log`"" -Wait -PassThru
  Log "[i] installer exit code: $($p.ExitCode)"
  Start-Sleep -Seconds 2
  $found = Find-Node
  if ($found) { Result $found }
}

# ---------------- GUI MSI (needs the user to click) ----------------
Log ""
Log "[!] Step 3/3: if a Node.js Setup window opens, please click through it (Next -> Install)."
Log "[!] This window will WAIT and auto-detect when the installation finishes."
if (Test-Path $msiPath) {
  $guiLog = Join-Path $RuntimeDir 'node-install-gui.log'
  $p = Start-Process msiexec.exe -ArgumentList "/i","`"$msiPath`"","/l*v","`"$guiLog`"" -Wait -PassThru
  Log "[i] installer exit code: $($p.ExitCode)"
  Start-Sleep -Seconds 2
  $found = Find-Node
  if ($found) { Result $found }

  # even if node is not on PATH yet, the log ending normally is a good sign
  if (Test-Path $guiLog) {
    $done = Select-String -Path $guiLog -Quiet -Pattern `
      'Installation completed successfully','Installation success or error status: 0'
    if ($done) {
      $found = Find-Node
      if ($found) { Result $found }
    }
  }
}

Log "[X] Could not set up Node.js automatically."
Log "[X] Please install Node.js 18+ manually: https://nodejs.org/en/download"
exit 1
