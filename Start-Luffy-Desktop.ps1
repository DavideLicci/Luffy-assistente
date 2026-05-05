$ErrorActionPreference = "Stop"

$workspace = "C:\Users\licci\Documents\Codex\2026-04-19-ecco-il-codice-per-un-agente"
$desktopAppDir = Join-Path $workspace "desktop"
$electronExe = Join-Path $desktopAppDir "node_modules\electron\dist\electron.exe"
$npmCmd = "C:\msys64\mingw64\bin\npm.cmd"
$launcherLog = Join-Path $workspace "luffy-launch.log"

function Test-LuffyRunning {
  $processes = Get-LuffyWorkspaceProcesses | Where-Object { $_.Name -eq "electron.exe" }
  return ($processes.Count -gt 0)
}

function Get-LuffyWorkspaceProcesses {
  return @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        ($_.Name -in @("node.exe", "electron.exe")) -and
        $_.CommandLine -like "*$workspace*"
      }
  )
}

function Get-PortOwnerProcess {
  param([int]$Port)

  $match = @(netstat -ano -p tcp |
    Select-String -Pattern "LISTENING" |
    Where-Object { $_.Line -match "[:\.]$Port\s" } |
    Select-Object -First 1)

  if ($match.Count -eq 0) {
    return $null
  }

  $pidToken = ($match[0].Line -split "\s+")[-1]
  $pid = 0
  if (-not [int]::TryParse($pidToken, [ref]$pid)) {
    return $null
  }

  return Get-CimInstance Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
}

function Test-PortOwnedByWorkspace {
  param([int]$Port)

  $owner = Get-PortOwnerProcess -Port $Port
  if ($null -eq $owner) {
    return $false
  }
  return [bool]($owner.CommandLine -like "*$workspace*")
}

function Stop-LuffyProcesses {
  Get-LuffyWorkspaceProcesses |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      } catch {
        # Ignore transient stop errors.
      }
    }
}

if (!(Test-Path $npmCmd)) {
  $resolved = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Path
  if ($resolved) {
    $npmCmd = $resolved
  }
}

if (!(Test-Path $npmCmd)) {
  Write-Error "Impossibile trovare npm sul sistema."
  exit 1
}

$isRunning = Test-LuffyRunning
$workspaceProcesses = Get-LuffyWorkspaceProcesses
$hasWorkspaceProcesses = $workspaceProcesses.Count -gt 0
$webReady = Test-PortOwnedByWorkspace -Port 3000
$apiReady = Test-PortOwnedByWorkspace -Port 8080

if ($isRunning -and $webReady -and $apiReady) {
  if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList "`"$desktopAppDir`"" | Out-Null
  }
  exit 0
}

if ((-not $isRunning) -and $webReady -and $apiReady -and (Test-Path $electronExe)) {
  Start-Process -FilePath $electronExe -ArgumentList "`"$desktopAppDir`"" | Out-Null
  exit 0
}

if ($hasWorkspaceProcesses) {
  Stop-LuffyProcesses
  Start-Sleep -Seconds 1
}

$launchCmd = "/c `"`"$npmCmd`" start >> `"$launcherLog`" 2>&1`""
Start-Process -FilePath "cmd.exe" -ArgumentList $launchCmd -WorkingDirectory $workspace -WindowStyle Hidden | Out-Null
exit 0
