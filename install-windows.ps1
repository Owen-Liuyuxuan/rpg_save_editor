# Per-user install: no administrator rights, stable shortcuts across upgrades.
$ErrorActionPreference = 'Stop'
$releaseRoot = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release\latest.txt') -Raw).Trim()
$sourceExe = Join-Path $releaseRoot 'RPGMakerSaveLab.exe'
if (!(Test-Path -LiteralPath $sourceExe)) { throw 'Build the portable release first.' }
$appInstallDir = Join-Path $env:LOCALAPPDATA 'Programs\RPGMakerSaveLab'
$installedExe = Join-Path $appInstallDir 'RPGMakerSaveLab.exe'
$running = Get-CimInstance Win32_Process -Filter "Name = 'RPGMakerSaveLab.exe'" | Where-Object { $_.ExecutablePath -eq $installedExe }
if ($running) { throw 'Close the installed RPGMakerSaveLab app before upgrading.' }
New-Item -ItemType Directory -Path $appInstallDir -Force | Out-Null
Get-ChildItem -LiteralPath $releaseRoot | Copy-Item -Destination $appInstallDir -Recurse -Force
if ((Get-FileHash -LiteralPath $sourceExe).Hash -ne (Get-FileHash -LiteralPath $installedExe).Hash) { throw 'Installed executable verification failed.' }
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'RPG Maker 存档修改器.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'RPG Maker 存档修改器.lnk')
)
foreach ($shortcutPath in $shortcutPaths) {
    $shortcut = $shortcutShell.CreateShortcut($shortcutPath)
    if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $installedExe) { throw "An unrelated shortcut already exists: $shortcutPath" }
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = $appInstallDir
    $shortcut.IconLocation = "$installedExe,0"
    $shortcut.Description = 'RPG Maker MV 存档修改器：角色属性、背包、变量和开关'
    $shortcut.Save()
    $verified = $shortcutShell.CreateShortcut($shortcutPath)
    if ($verified.TargetPath -ne $installedExe) { throw 'Shortcut verification failed.' }
}
[PSCustomObject]@{ Application = $installedExe; Shortcuts = $shortcutPaths } | ConvertTo-Json
