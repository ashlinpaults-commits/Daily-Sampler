$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Node = "C:\Users\ashlinpaul\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$App = Join-Path $Root "standalone-app.js"
$Builder = Join-Path $Root "build-standalone.mjs"
$Standalone = Join-Path $Root "standalone.html"
$Index = Join-Path $Root "index.html"

if (!(Test-Path -LiteralPath $Node)) {
  throw "Bundled Node was not found at $Node"
}

if (!(Test-Path -LiteralPath $App)) {
  throw "Missing standalone-app.js"
}

if (!(Test-Path -LiteralPath $Builder)) {
  throw "Missing build-standalone.mjs"
}

Write-Host "Checking app script..."
& $Node --check $App

Write-Host "Building standalone.html..."
& $Node $Builder

if (!(Test-Path -LiteralPath $Standalone)) {
  throw "Build failed: standalone.html was not created."
}

Copy-Item -LiteralPath $Standalone -Destination $Index -Force

$Output = Get-Item -LiteralPath $Standalone
Write-Host "Built:" $Output.FullName
Write-Host "Size:" $Output.Length "bytes"
Write-Host "Copied to:" $Index
