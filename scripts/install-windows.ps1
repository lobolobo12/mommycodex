# Runs from both the source ZIP and the smaller Windows setup ZIP. No build tools are needed.
param(
    [switch]$SkipLogin,
    [switch]$SkipLaunch,
    [string]$InstallDirectory
)

$ErrorActionPreference = 'Stop'
$script:SetupRoot = Split-Path -Parent $PSScriptRoot
$script:ReleaseVersion = '0.2.1'
$script:CodexVersion = '0.153.4'

function Find-SetupCommand([string]$Name) {
    $command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return $null
}

function Update-SetupPath {
    # Refresh this process after an installer updates PATH; do not rewrite the user's PATH.
    $paths = @(
        [Environment]::GetEnvironmentVariable('Path', 'Machine'),
        [Environment]::GetEnvironmentVariable('Path', 'User'),
        $env:Path,
        (Join-Path $env:APPDATA 'npm')
    )
    $env:Path = ($paths | Where-Object { $_ }) -join ';'
}

function Test-SupportedNodeVersion([string]$Version) {
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') { return $false }
    return ([int]$Matches[1] -gt 22 -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 12))
}

function Install-SetupPackage([string]$Id, [string]$DisplayName) {
    $winget = Find-SetupCommand 'winget.exe'
    if (-not $winget) {
        throw "Windows App Installer is needed to install $DisplayName automatically. Install or update App Installer from the Microsoft Store, then double-click Install-Windows.cmd again."
    }
    Write-Host "Installing $DisplayName. Windows may ask you to allow its installer..." -ForegroundColor Cyan
    & $winget install --id $Id --exact --source winget --architecture x64 --silent --accept-source-agreements --accept-package-agreements --disable-interactivity | Out-Host
    if ($LASTEXITCODE -notin @(0, 3010)) {
        throw "$DisplayName installation stopped (exit $LASTEXITCODE). Check the message above and run setup again."
    }
    Update-SetupPath
}

function Get-SetupCodex {
    foreach ($name in @('codex.exe', 'codex.cmd')) {
        $command = Find-SetupCommand $name
        if ($command) { return $command }
    }
    return $null
}

function Install-SetupPrerequisites {
    Update-SetupPath
    $node = Find-SetupCommand 'node.exe'
    $supported = $false
    if ($node) {
        $version = & $node --version
        $supported = ($LASTEXITCODE -eq 0 -and (Test-SupportedNodeVersion "$version"))
    }
    if (-not $supported -or -not (Find-SetupCommand 'npm.cmd')) {
        Install-SetupPackage 'OpenJS.NodeJS.LTS' 'Node.js LTS'
        $node = Find-SetupCommand 'node.exe'
        if (-not $node) { throw 'Node.js was installed but is not available yet. Restart Windows and run setup again.' }
        $version = & $node --version
        if ($LASTEXITCODE -ne 0 -or -not (Test-SupportedNodeVersion "$version")) {
            throw 'Node.js 22.12 or newer is required. Restart Windows after installing Node.js LTS, then run setup again.'
        }
    }

    if (-not (Find-SetupCommand 'git.exe')) { Install-SetupPackage 'Git.Git' 'Git for Windows' }
    if (-not (Find-SetupCommand 'git.exe')) { throw 'Git is not available yet. Restart Windows and run setup again.' }

    $codex = Get-SetupCodex
    if (-not $codex) {
        $npm = Find-SetupCommand 'npm.cmd'
        if (-not $npm) { throw 'npm is not available yet. Restart Windows and run setup again.' }
        Write-Host 'Installing Codex...' -ForegroundColor Cyan
        # Ignore project-local npm configuration by running in our download directory.
        & $npm install --global "@openai/codex@$script:CodexVersion" --registry=https://registry.npmjs.org | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Codex installation failed (exit $LASTEXITCODE). Check your internet connection and run setup again." }
        Update-SetupPath
        $codex = Get-SetupCodex
    }
    if (-not $codex) { throw 'Codex is not available yet. Restart Windows and run setup again.' }
    return $codex
}

function Assert-SetupChecksum([string]$Installer, [string]$ChecksumFile) {
    if (-not (Test-Path -LiteralPath $Installer -PathType Leaf) -or -not (Test-Path -LiteralPath $ChecksumFile -PathType Leaf)) {
        throw 'The installer or its checksum is missing. Extract the entire setup ZIP and try again.'
    }
    $line = (Get-Content -LiteralPath $ChecksumFile -Raw).Trim()
    if ($line -notmatch '^([a-fA-F0-9]{64})\s+\*?([^\\/\r\n]+)$') { throw 'The installer checksum file is invalid. Download the setup ZIP again.' }
    $expectedHash = $Matches[1]
    $expectedName = $Matches[2]
    if ($expectedName -cne [IO.Path]::GetFileName($Installer)) { throw 'The checksum belongs to a different installer. Download the setup ZIP again.' }
    $actualHash = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
    if ($actualHash -ine $expectedHash) { throw 'The installer checksum does not match. Download the setup ZIP again; this copy will not be run.' }
}

function Get-SetupInstaller([string]$DownloadDirectory) {
    $name = "MommyCodex_$($script:ReleaseVersion)_x64-setup.exe"
    $local = Join-Path (Join-Path $script:SetupRoot 'installer') $name
    if (Test-Path -LiteralPath $local -PathType Leaf) {
        Assert-SetupChecksum $local "$local.sha256"
        return $local
    }

    Write-Host 'Downloading MommyCodex...' -ForegroundColor Cyan
    $installer = Join-Path $DownloadDirectory $name
    $url = "https://github.com/lobolobo12/mommycodex/releases/download/v$($script:ReleaseVersion)/$name"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$url.sha256" -OutFile "$installer.sha256" -TimeoutSec 120
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $installer -TimeoutSec 300
    } catch {
        throw 'Could not download the Windows installer. Check your internet connection, or get MommyCodex-Windows-Setup.zip from https://github.com/lobolobo12/mommycodex/releases and extract it.'
    }
    Assert-SetupChecksum $installer "$installer.sha256"
    return $installer
}

function Install-SetupApp([string]$Installer, [string]$Directory) {
    Write-Host 'Installing MommyCodex for your Windows account...' -ForegroundColor Cyan
    # NSIS requires /D to be last, with the directory unquoted even when it contains spaces.
    $install = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$Directory") -Wait -PassThru
    if ($install.ExitCode -ne 0) { throw "The app installer stopped (exit $($install.ExitCode)). Close MommyCodex if it is running, then try again." }
    $app = Join-Path $Directory 'MommyCodex.exe'
    if (-not (Test-Path -LiteralPath $app -PathType Leaf)) { throw 'The installer finished but MommyCodex.exe was not found. Run the app installer in the installer folder to choose an installation location.' }
    return $app
}

function Connect-SetupCodex([string]$Codex) {
    # Login status may use stderr for normal output; capture it without treating it as a PowerShell error.
    $prior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Codex login status *> $null; $loggedIn = $LASTEXITCODE -eq 0 }
    finally { $ErrorActionPreference = $prior }
    if ($loggedIn) { Write-Host 'Codex is already signed in.'; return }
    Write-Host 'Sign in to Codex in the browser that opens. Return here when you finish.' -ForegroundColor Cyan
    & $Codex login
    if ($LASTEXITCODE -ne 0) { throw 'MommyCodex is installed, but sign-in did not finish. Double-click Install-Windows.cmd again to retry sign-in.' }
}

function Invoke-WindowsSetup([string]$Directory, [switch]$WithoutLogin, [switch]$WithoutLaunch) {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem) {
        throw 'This setup is for Windows 10/11 on a 64-bit Intel or AMD PC.'
    }
    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        throw 'This installer targets Intel/AMD x64. Windows ARM64 is not currently supported.'
    }
    if (-not $Directory) { $Directory = Join-Path $env:LOCALAPPDATA 'Programs\MommyCodex' }
    Write-Host 'MommyCodex setup' -ForegroundColor Magenta
    Write-Host 'This installs the app, sets up missing Node.js, Git and Codex, then opens sign-in.'
    Write-Host 'Existing tools and your Codex login are reused. No build tools are needed.'
    $downloadDirectory = Join-Path ([IO.Path]::GetTempPath()) ("mommycodex-setup-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $downloadDirectory | Out-Null
    Push-Location $downloadDirectory
    try {
        # Validate the app before installing prerequisites, including when run from the source ZIP.
        $installer = Get-SetupInstaller $downloadDirectory
        $codex = Install-SetupPrerequisites
        $app = Install-SetupApp $installer $Directory
        if (-not $WithoutLogin) { Connect-SetupCodex $codex }
        if (-not $WithoutLaunch) { Start-Process -FilePath $app -WorkingDirectory $Directory | Out-Null }
        Write-Host 'Installed! Open MommyCodex from the Start menu and choose a project folder.' -ForegroundColor Green
    } finally {
        Pop-Location
        Remove-Item -LiteralPath $downloadDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Dot-sourcing loads the functions for isolated tests without installing anything.
if ($MyInvocation.InvocationName -ne '.') {
    try { Invoke-WindowsSetup -Directory $InstallDirectory -WithoutLogin:$SkipLogin -WithoutLaunch:$SkipLaunch }
    catch { Write-Host "`n$($_.Exception.Message)" -ForegroundColor Red; exit 1 }
}
