$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8765
$Prefix = "http://127.0.0.1:$Port/"

Add-Type -AssemblyName System.Web

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Daily Ticket Sampler may already be running."
  Start-Process $Prefix
  exit 0
}

Write-Host "Daily Ticket Sampler running at $Prefix"
Write-Host "Keep this window open while using the app."
Start-Process $Prefix

function Get-ContentType($Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    default { "application/octet-stream" }
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [System.Web.HttpUtility]::UrlDecode($context.Request.Url.AbsolutePath.TrimStart("/"))

    if ([string]::IsNullOrWhiteSpace($requestPath)) {
      $requestPath = "standalone.html"
    }

    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $requestPath))
    if (!$fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
    } else {
      $context.Response.StatusCode = 200
      $context.Response.ContentType = Get-ContentType $fullPath
      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    }

    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
