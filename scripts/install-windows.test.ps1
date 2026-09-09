# No downloads, package installations, account access, or app launches occur in these fixtures.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'install-windows.ps1')

function Assert-SetupTest([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Assert-SetupThrows([scriptblock]$Action, [string]$Pattern) {
    try { & $Action } catch {
        if ($_.Exception.Message -match $Pattern) { return }
        throw
    }
    throw "Expected an error matching: $Pattern"
}
function Test-SetupCase([string]$Name, [scriptblock]$Action) {
    & $Action
    Write-Host "PASS: $Name"
}

Test-SetupCase 'Node version boundary and malformed output' {
    foreach ($version in @('v20.19.0', 'v22.11.9', 'not installed', 'v24.0.0-rc.1')) {
        Assert-SetupTest (-not (Test-SupportedNodeVersion $version)) "Incorrectly accepted $version"
    }
    foreach ($version in @('v22.12.0', 'v24.1.0', 'v26.0.0')) {
        Assert-SetupTest (Test-SupportedNodeVersion $version) "Incorrectly rejected $version"
    }
}

$fixture = Join-Path ([IO.Path]::GetTempPath()) ("mommycodex-setup-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
try {
    Test-SetupCase 'Corrupt or mismatched installers cannot pass checksum validation' {
        $installer = Join-Path $fixture 'Setup with spaces.exe'
        [IO.File]::WriteAllText($installer, 'installer fixture')
        $hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  Setup with spaces.exe" | Set-Content -Encoding ascii "$installer.sha256"
        Assert-SetupChecksum $installer "$installer.sha256"
        [IO.File]::AppendAllText($installer, 'corrupt')
        Assert-SetupThrows { Assert-SetupChecksum $installer "$installer.sha256" } 'does not match'
        "$hash  different.exe" | Set-Content -Encoding ascii "$installer.sha256"
        Assert-SetupThrows { Assert-SetupChecksum $installer "$installer.sha256" } 'different installer'
        'not a checksum' | Set-Content -Encoding ascii "$installer.sha256"
        Assert-SetupThrows { Assert-SetupChecksum $installer "$installer.sha256" } 'invalid'
        Remove-Item -LiteralPath "$installer.sha256"
        Assert-SetupThrows { Assert-SetupChecksum $installer "$installer.sha256" } 'missing'
    }

    Test-SetupCase 'Existing prerequisites are reused without installing or downgrading them' {
        function Update-SetupPath {}
        function Find-SetupCommand([string]$Name) {
            switch ($Name) {
                'node.exe' { return 'node-fixture' }
                'npm.cmd' { return 'npm-fixture' }
                'git.exe' { return 'git-fixture' }
                'codex.exe' { return 'codex-fixture' }
            }
        }
        function node-fixture { $global:LASTEXITCODE = 0; return 'v24.0.0' }
        function Install-SetupPackage { throw 'Existing tools must not be reinstalled' }
        function npm-fixture { throw 'Existing Codex must not be replaced' }
        $result = Install-SetupPrerequisites
        Assert-SetupTest ($result -ceq 'codex-fixture') 'Did not reuse installed Codex'
    }

    Test-SetupCase 'Fresh setup installs prerequisites in order and keeps npm output out of the executable path' {
        $state = @{ node = $false; git = $false; codex = $false; calls = [Collections.Generic.List[string]]::new() }
        function Update-SetupPath {}
        function Find-SetupCommand([string]$Name) {
            switch ($Name) {
                'node.exe' { if ($state.node) { return 'node-fixture' } }
                'npm.cmd' { if ($state.node) { return 'npm-fixture' } }
                'git.exe' { if ($state.git) { return 'git-fixture' } }
                'codex.exe' { if ($state.codex) { return 'codex-fixture' } }
            }
        }
        function node-fixture { $global:LASTEXITCODE = 0; return 'v24.0.0' }
        function Install-SetupPackage([string]$Id, [string]$DisplayName) {
            $state.calls.Add($Id)
            if ($Id -eq 'OpenJS.NodeJS.LTS') { $state.node = $true }
            elseif ($Id -eq 'Git.Git') { $state.git = $true }
            else { throw "Unexpected prerequisite: $Id" }
        }
        function npm-fixture {
            $state.calls.Add('codex')
            $state.codex = $true
            $global:LASTEXITCODE = 0
            'Normal npm progress output'
        }
        $result = Install-SetupPrerequisites
        Assert-SetupTest ($result -ceq 'codex-fixture') 'Package-manager output polluted the Codex executable path'
        Assert-SetupTest (($state.calls -join ',') -eq 'OpenJS.NodeJS.LTS,Git.Git,codex') 'Incorrect prerequisite order'
    }

    Test-SetupCase 'Package manager failure stops setup' {
        function Update-SetupPath {}
        function Find-SetupCommand([string]$Name) { if ($Name -eq 'winget.exe') { return 'winget-fixture' } }
        function winget-fixture { $global:LASTEXITCODE = 1; 'Package installation failed' }
        Assert-SetupThrows { Install-SetupPackage 'Git.Git' 'Git' } 'installation stopped'
    }

    Test-SetupCase 'Missing App Installer explains how to recover' {
        function Find-SetupCommand { return $null }
        Assert-SetupThrows { Install-SetupPackage 'Git.Git' 'Git' } 'Microsoft Store'
    }

    Test-SetupCase 'Existing login is preserved and incomplete sign-in is reported' {
        $state = @{ loggedIn = $true; loginCalls = 0 }
        function codex-fixture([string]$Command, [string]$Subcommand) {
            if ($Command -ne 'login') { throw 'Unexpected Codex command' }
            if ($Subcommand -eq 'status') {
                $global:LASTEXITCODE = if ($state.loggedIn) { 0 } else { 1 }
            } else { $state.loginCalls++; $global:LASTEXITCODE = 1 }
        }
        Connect-SetupCodex 'codex-fixture'
        Assert-SetupTest ($state.loginCalls -eq 0) 'Already signed-in user was asked to log in again'
        $state.loggedIn = $false
        Assert-SetupThrows { Connect-SetupCodex 'codex-fixture' } 'sign-in did not finish'
        Assert-SetupTest ($state.loginCalls -eq 1) 'Did not attempt browser sign-in exactly once'
    }

    Test-SetupCase 'Installer failures are not reported as successful installations' {
        function Start-Process { return @{ ExitCode = 2 } }
        Assert-SetupThrows { Install-SetupApp 'fixture.exe' $fixture } 'installer stopped'
    }

    Test-SetupCase 'Packaging produces a complete setup ZIP with matching checksums' {
        $project = Join-Path $fixture 'Project with spaces'
        $scripts = Join-Path $project 'scripts'
        $build = Join-Path $project 'src-tauri/target/release/bundle/nsis'
        New-Item -ItemType Directory -Path $scripts, $build -Force | Out-Null
        Copy-Item (Join-Path $PSScriptRoot 'package-windows.ps1'), (Join-Path $PSScriptRoot 'install-windows.ps1') $scripts
        Copy-Item (Join-Path $script:SetupRoot 'Install-Windows.cmd') $project
        '{"version":"0.2.1"}' | Set-Content -Encoding ascii (Join-Path $project 'package.json')
        [IO.File]::WriteAllText((Join-Path $build 'MommyCodex_0.2.1_x64-setup.exe'), 'fixture, not executable')
        & (Join-Path $scripts 'package-windows.ps1')
        $output = Join-Path $project 'output/windows-release'
        $zip = Join-Path $output 'MommyCodex-Windows-Setup.zip'
        Assert-SetupChecksum $zip "$zip.sha256"
        $extracted = Join-Path $fixture 'Extracted setup'
        Expand-Archive -LiteralPath $zip -DestinationPath $extracted
        $bundle = Join-Path $extracted 'MommyCodex-Windows-Setup'
        foreach ($file in @('Install-Windows.cmd', 'scripts/install-windows.ps1', 'START-HERE.txt')) {
            Assert-SetupTest (Test-Path -LiteralPath (Join-Path $bundle $file)) "Missing setup file: $file"
        }
        $app = Join-Path $bundle 'installer/MommyCodex_0.2.1_x64-setup.exe'
        Assert-SetupChecksum $app "$app.sha256"
    }
} finally { Remove-Item -LiteralPath $fixture -Recurse -Force }
Write-Host 'All Windows setup fixtures passed.'
