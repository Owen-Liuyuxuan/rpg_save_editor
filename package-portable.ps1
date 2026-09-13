$ErrorActionPreference = 'Stop'
$labRoot = $PSScriptRoot
$appRoot = Join-Path $labRoot 'app'
$releaseRoot = Join-Path $labRoot 'release'
$targetRoot = Join-Path $releaseRoot ('RPGMakerSaveLab-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$runtimeRoot = Join-Path $appRoot 'node_modules\electron\dist'
if (!(Test-Path -LiteralPath (Join-Path $appRoot 'dist-electron\main.js'))) { throw 'Run pnpm build first.' }
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
Get-ChildItem -LiteralPath $runtimeRoot | Copy-Item -Destination $targetRoot -Recurse
Rename-Item -LiteralPath (Join-Path $targetRoot 'electron.exe') -NewName 'RPGMakerSaveLab.exe'
$bundleRoot = Join-Path $targetRoot 'resources\app'
New-Item -ItemType Directory -Path (Join-Path $bundleRoot 'node_modules\lz-string') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $appRoot 'dist-electron') -Destination $bundleRoot -Recurse
Copy-Item -LiteralPath (Join-Path $appRoot 'dist') -Destination $bundleRoot -Recurse
Get-ChildItem -LiteralPath (Join-Path $appRoot 'node_modules\lz-string') | Copy-Item -Destination (Join-Path $bundleRoot 'node_modules\lz-string') -Recurse
$manifest = Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json
@{ name = 'rpgmaker-save-lab'; version = $manifest.version; main = 'dist-electron/main.js'; private = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundleRoot 'package.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $labRoot '使用说明.md') -Destination $targetRoot
$targetRoot | Set-Content -LiteralPath (Join-Path $releaseRoot 'latest.txt') -Encoding utf8
Write-Output $targetRoot
