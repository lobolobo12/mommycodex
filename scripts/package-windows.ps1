param([string]$OutputDirectory = 'output/windows-release')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
    # The source-ZIP helper must download this same app version.
    $helper = Get-Content scripts/install-windows.ps1 -Raw
    if ($helper -notmatch ('\$script:ReleaseVersion = ''' + [regex]::Escape($version) + '''')) {
        throw 'Update ReleaseVersion in install-windows.ps1 to match package.json before packaging.'
    }
    $name = "MommyCodex_${version}_x64-setup.exe"
    $installer = Join-Path 'src-tauri/target/release/bundle/nsis' $name
    if (-not (Test-Path -LiteralPath $installer)) { throw "Build the Windows installer first: $installer is missing." }
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $output = (Resolve-Path $OutputDirectory).Path
    $stage = Join-Path $output 'MommyCodex-Windows-Setup'
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $stage 'scripts'), (Join-Path $stage 'installer') -Force | Out-Null
    Copy-Item Install-Windows.cmd $stage
    Copy-Item scripts/install-windows.ps1 (Join-Path $stage 'scripts')
    Copy-Item $installer (Join-Path $output $name)
    $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $name" | Set-Content -Encoding ascii (Join-Path $output "$name.sha256")
    Copy-Item (Join-Path $output $name), (Join-Path $output "$name.sha256") (Join-Path $stage 'installer')
    @"
MommyCodex for Windows 10/11 x64

1. Extract the entire ZIP (right-click > Extract All).
2. Double-click Install-Windows.cmd.
3. Allow the prerequisite installers if Windows asks, then sign in in your browser.

Setup installs MommyCodex and any missing Node.js, Git and Codex.
Existing tools and login are reused. An internet connection is required.
No Rust, Visual Studio, pnpm, or build commands are needed.

The Windows app is unsigned. Only run a download you trust from:
https://github.com/lobolobo12/mommycodex/releases

If setup stops, read its message and run Install-Windows.cmd again.
Windows App Installer (winget) is required to install missing Node.js or Git.
Google Chrome is optional for live browser previews.
GitHub CLI is optional for the issue/PR workflow; Fish Audio is optional for voice.
"@ | Set-Content -Encoding utf8 (Join-Path $stage 'START-HERE.txt')
    $zip = Join-Path $output 'MommyCodex-Windows-Setup.zip'
    Compress-Archive -Path $stage -DestinationPath $zip -Force
    $zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    "$zipHash  MommyCodex-Windows-Setup.zip" | Set-Content -Encoding ascii "$zip.sha256"
    Write-Host "Windows setup ready: $zip"
} finally { Pop-Location }
