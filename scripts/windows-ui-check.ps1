param([int]$AppProcessId)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline = (Get-Date).AddSeconds(45)
$names = @()
do {
  $appProcess = Get-Process -Id $AppProcessId -ErrorAction Stop
  $appProcess.Refresh()
  if ($appProcess.MainWindowHandle -ne 0) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($appProcess.MainWindowHandle)
    if ($null -ne $root) {
      $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $names = @($elements | ForEach-Object { $_.Current.Name })
      $text = $names -join "`n"
      if ($text -match 'mommy-windows-smoke-' -and $names -contains 'Message' -and $text -match 'Mommy') {
        Write-Output 'Installed Windows app rendered its selected project and message composer (native UI Automation).'
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
Write-Output ($names -join "`n")
throw 'The installed app did not expose the selected project and message composer.'
