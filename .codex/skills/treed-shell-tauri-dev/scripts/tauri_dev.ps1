[CmdletBinding()]
param(
    [ValidateSet('start', 'status', 'logs', 'stop')]
    [string]$Action = 'status',
    [ValidateSet('desktop', 'printer')]
    [string]$Profile = 'desktop',
    [int]$Tail = 12,
    [int]$WaitSeconds = 0,
    [string]$RepoRoot,
    [switch]$IncludeDetails,
    [switch]$PrettyJson
)

$ErrorActionPreference = 'Stop'

function Get-DefaultRepoRoot {
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..'))
}

if (-not $RepoRoot) {
    $RepoRoot = Get-DefaultRepoRoot
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$TempRoot = $env:TEMP
$StatePath = Join-Path $TempRoot "treed-shell-tauri-dev-$Profile-state.json"
$StdoutPath = Join-Path $TempRoot "treed-shell-tauri-dev-$Profile.log"
$StderrPath = Join-Path $TempRoot "treed-shell-tauri-dev-$Profile.err.log"
$LaunchCmdPath = Join-Path $TempRoot "treed-shell-tauri-dev-$Profile-launch.cmd"
$AppExePath = Join-Path $RepoRoot 'src-tauri\target\debug\app.exe'

function Get-TauriDevScript {
    if ($Profile -eq 'printer') {
        return 'tauri:dev:printer'
    }

    return 'tauri:dev'
}

function Test-ContainsIgnoreCase {
    param(
        [string]$Text,
        [string]$Token
    )

    if ([string]::IsNullOrWhiteSpace($Text) -or [string]::IsNullOrWhiteSpace($Token)) {
        return $false
    }

    return $Text.IndexOf($Token, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Write-JsonResult {
    param(
        $Value
    )

    if ($PrettyJson) {
        $Value | ConvertTo-Json -Depth 6
    } else {
        $Value | ConvertTo-Json -Depth 6 -Compress
    }
}

function Get-StateObject {
    if (-not (Test-Path $StatePath)) {
        return $null
    }

    $raw = Get-Content -Path $StatePath -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    return $raw | ConvertFrom-Json
}

function Save-StateObject([hashtable]$State) {
    $State | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

function Remove-IfExists([string]$Path) {
    if (Test-Path $Path) {
        Remove-Item $Path -Force -ErrorAction SilentlyContinue
    }
}

function Get-ProcessSnapshot {
    return @(Get-CimInstance Win32_Process)
}

function Get-ProcessIndex {
    param(
        [object[]]$Processes
    )

    $index = @{}
    foreach ($process in $Processes) {
        $index[[int]$process.ProcessId] = $process
    }

    return $index
}

function Get-ChildrenIndex {
    param(
        [object[]]$Processes
    )

    $index = @{}
    foreach ($process in $Processes) {
        $parentId = [int]$process.ParentProcessId
        if (-not $index.ContainsKey($parentId)) {
            $index[$parentId] = New-Object System.Collections.Generic.List[object]
        }

        $null = $index[$parentId].Add($process)
    }

    return $index
}

function Get-Descendants {
    param(
        [object[]]$Processes,
        [int]$RootPid
    )

    if (-not $RootPid) {
        return @()
    }

    $childrenIndex = Get-ChildrenIndex -Processes $Processes
    $queue = New-Object System.Collections.Generic.Queue[int]
    $result = New-Object System.Collections.Generic.List[object]

    $queue.Enqueue($RootPid)
    while ($queue.Count -gt 0) {
        $currentPid = $queue.Dequeue()
        if (-not $childrenIndex.ContainsKey($currentPid)) {
            continue
        }

        foreach ($child in $childrenIndex[$currentPid]) {
            $null = $result.Add($child)
            $queue.Enqueue([int]$child.ProcessId)
        }
    }

    return $result.ToArray()
}

function Get-Ancestors {
    param(
        [hashtable]$ProcessIndex,
        [int]$StartPid
    )

    $result = New-Object System.Collections.Generic.List[object]
    $currentPid = $StartPid

    while ($currentPid -and $ProcessIndex.ContainsKey($currentPid)) {
        $process = $ProcessIndex[$currentPid]
        $null = $result.Add($process)
        $currentPid = [int]$process.ParentProcessId
    }

    return $result.ToArray()
}

function Test-IsRepoProcess {
    param(
        $Process
    )

    $commandLine = [string]$Process.CommandLine
    $executablePath = [string]$Process.ExecutablePath

    if ($executablePath -eq $AppExePath) {
        return $true
    }

    $hasRepoPath = (
        (Test-ContainsIgnoreCase -Text $commandLine -Token $RepoRoot) -or
        (Test-ContainsIgnoreCase -Text $executablePath -Token $RepoRoot)
    )

    if (-not $hasRepoPath) {
        return $false
    }

    return (
        $commandLine -like '*run tauri:dev*' -or
        $commandLine -like '*\tauri.js* dev*' -or
        $commandLine -like '*\vite\bin\vite.js*' -or
        $commandLine -like '*cargo*run --no-default-features*' -or
        $commandLine -like '*target\debug\app.exe*'
    )
}

function Get-SessionRoot {
    param(
        [object[]]$Processes,
        [hashtable]$ProcessIndex,
        [int]$CandidatePid
    )

    if (-not $CandidatePid) {
        return $null
    }

    $ancestors = Get-Ancestors -ProcessIndex $ProcessIndex -StartPid $CandidatePid
    $interesting = @($ancestors | Where-Object { Test-IsRepoProcess -Process $_ })
    if ($interesting.Count -gt 0) {
        return $interesting[-1]
    }

    if ($ancestors.Count -gt 0) {
        return $ancestors[0]
    }

    return $null
}

function Get-ManagedSession {
    param(
        [object[]]$Processes,
        $State
    )

    $processIndex = Get-ProcessIndex -Processes $Processes

    if ($State -and $State.launcherPid) {
        $launcherPid = [int]$State.launcherPid
        if ($processIndex.ContainsKey($launcherPid)) {
            $root = $processIndex[$launcherPid]
            $descendants = Get-Descendants -Processes $Processes -RootPid $launcherPid
            return [pscustomobject]@{
                Root = $root
                RootPid = $launcherPid
                Processes = @($root) + @($descendants)
                Tracked = $true
            }
        }
    }

    $appProcess = @($Processes | Where-Object { [string]$_.ExecutablePath -eq $AppExePath } | Select-Object -First 1)
    if ($appProcess.Count -gt 0) {
        $root = Get-SessionRoot -Processes $Processes -ProcessIndex $processIndex -CandidatePid ([int]$appProcess[0].ProcessId)
        if ($root) {
            $descendants = Get-Descendants -Processes $Processes -RootPid ([int]$root.ProcessId)
            return [pscustomobject]@{
                Root = $root
                RootPid = [int]$root.ProcessId
                Processes = @($root) + @($descendants)
                Tracked = $false
            }
        }
    }

    $candidate = @($Processes | Where-Object { Test-IsRepoProcess -Process $_ } | Select-Object -First 1)
    if ($candidate.Count -gt 0) {
        $root = Get-SessionRoot -Processes $Processes -ProcessIndex $processIndex -CandidatePid ([int]$candidate[0].ProcessId)
        if ($root) {
            $descendants = Get-Descendants -Processes $Processes -RootPid ([int]$root.ProcessId)
            return [pscustomobject]@{
                Root = $root
                RootPid = [int]$root.ProcessId
                Processes = @($root) + @($descendants)
                Tracked = $false
            }
        }
    }

    return [pscustomobject]@{
        Root = $null
        RootPid = $null
        Processes = @()
        Tracked = $false
    }
}

function Get-LogTail {
    param(
        [string]$Path,
        [int]$LineCount
    )

    if (-not (Test-Path $Path)) {
        return @()
    }

    $lines = @(Get-Content -Path $Path -Tail $LineCount)
    return @(
        $lines |
            ForEach-Object { "$_".TrimEnd() } |
            Where-Object { $_ -ne '' }
    )
}

function Test-LogPattern {
    param(
        [string]$Path,
        [string]$Pattern
    )

    if (-not (Test-Path $Path)) {
        return $false
    }

    return [bool](Select-String -Path $Path -Pattern $Pattern -Quiet)
}

function Get-NpmCommand {
    $userInstall = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\npm.cmd'
    if (Test-Path $userInstall) {
        return $userInstall
    }

    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw 'npm.cmd not found'
}

function Get-CargoBinDir {
    $userInstall = Join-Path $env:USERPROFILE '.cargo\bin'
    if (Test-Path (Join-Path $userInstall 'cargo.exe')) {
        return $userInstall
    }

    $command = Get-Command cargo.exe -ErrorAction SilentlyContinue
    if ($command) {
        return Split-Path -Parent $command.Source
    }

    throw 'cargo.exe not found'
}

function Get-StatusObject([string]$Mode) {
    $state = Get-StateObject
    $processes = Get-ProcessSnapshot
    $session = Get-ManagedSession -Processes $processes -State $state
    $sessionProcesses = @($session.Processes)
    $appProcess = @(
        $sessionProcesses |
            Where-Object { $_.Name -eq 'app.exe' -or [string]$_.ExecutablePath -eq $AppExePath } |
            Select-Object -First 1
    )
    $sessionActive = ($appProcess.Count -gt 0) -or [bool]$session.RootPid
    $viteReady = $sessionActive -and (Test-LogPattern -Path $StdoutPath -Pattern 'localhost:')
    $stateName = if ($appProcess.Count -gt 0) {
        'running'
    } elseif ($session.RootPid) {
        'starting'
    } else {
        'stopped'
    }

    $result = [ordered]@{
        action = $Mode
        profile = $Profile
        state = $stateName
        tracked = [bool]$session.Tracked
        launcherPid = if ($state -and $state.launcherPid) { [int]$state.launcherPid } else { $null }
        rootPid = if ($session.RootPid) { [int]$session.RootPid } else { $null }
        appPid = if ($appProcess.Count -gt 0) { [int]$appProcess[0].ProcessId } else { $null }
        viteReady = [bool]$viteReady
        appReady = [bool]($appProcess.Count -gt 0)
    }

    if ($IncludeDetails) {
        $interestingNames = @('app.exe', 'node.exe', 'cargo.exe', 'cmd.exe')
        $filteredProcesses = @(
            $sessionProcesses |
                Where-Object {
                    $interestingNames -contains $_.Name -or
                    (Test-IsRepoProcess -Process $_)
                }
        )

        $processSummary = @(
            $filteredProcesses |
                Group-Object Name |
                Sort-Object Name |
                ForEach-Object {
                    [pscustomobject]@{
                        name = $_.Name
                        pids = @($_.Group | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
                    }
                }
        )

        $result.repoRoot = $RepoRoot
        $result.npmScript = Get-TauriDevScript
        $result.stdoutTail = @(Get-LogTail -Path $StdoutPath -LineCount $Tail)
        $result.stderrTail = @(Get-LogTail -Path $StderrPath -LineCount $Tail)
        $result.processes = $processSummary
        $result.logPath = $StdoutPath
        $result.errPath = $StderrPath
    }

    return [pscustomobject]$result
}

function Get-LogsObject {
    $result = [ordered]@{
        action = 'logs'
        profile = $Profile
        viteReady = [bool](Test-LogPattern -Path $StdoutPath -Pattern 'localhost:')
        stdoutTail = @(Get-LogTail -Path $StdoutPath -LineCount $Tail)
        stderrTail = @(Get-LogTail -Path $StderrPath -LineCount $Tail)
    }

    if ($IncludeDetails) {
        $result.repoRoot = $RepoRoot
        $result.npmScript = Get-TauriDevScript
        $result.logPath = $StdoutPath
        $result.errPath = $StderrPath
        $result.tail = $Tail
    }

    return [pscustomobject]$result
}

function Start-TauriDev {
    $current = Get-StatusObject 'start'
    if ($current.state -ne 'stopped') {
        $current | Add-Member -NotePropertyName note -NotePropertyValue 'already-running'
        return $current
    }

    $npmCommand = Get-NpmCommand
    $nodeBinDir = Split-Path -Parent $npmCommand
    $cargoBinDir = Get-CargoBinDir
    $npmScript = Get-TauriDevScript

    Remove-IfExists $StdoutPath
    Remove-IfExists $StderrPath
    Remove-IfExists $StatePath
    Remove-IfExists $LaunchCmdPath

    $launchScript = @"
@echo off
setlocal
set "PATH=$nodeBinDir;$cargoBinDir;%PATH%"
cd /d "$RepoRoot"
"$npmCommand" run $npmScript 1>"$StdoutPath" 2>"$StderrPath"
"@

    Set-Content -Path $LaunchCmdPath -Value $launchScript -Encoding ASCII

    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = 'cmd.exe /d /c "' + $LaunchCmdPath + '"'
    }

    if ([int]$result.ReturnValue -ne 0) {
        throw "Failed to start tauri:dev. Win32_Process.Create returned $($result.ReturnValue)"
    }

    Save-StateObject ([ordered]@{
        launcherPid = [int]$result.ProcessId
        profile = $Profile
        npmScript = $npmScript
        repoRoot = $RepoRoot
        startedAt = (Get-Date).ToString('o')
        logPath = $StdoutPath
        errPath = $StderrPath
        launchCmdPath = $LaunchCmdPath
    })

    if ($WaitSeconds -gt 0) {
        Start-Sleep -Seconds $WaitSeconds
    }

    $status = Get-StatusObject 'start'
    $status | Add-Member -NotePropertyName note -NotePropertyValue 'started'
    return $status
}

function Stop-TauriDev {
    $state = Get-StateObject
    $processes = Get-ProcessSnapshot
    $session = Get-ManagedSession -Processes $processes -State $state
    $processIds = @()

    if ($session.RootPid) {
        $processIds += [int]$session.RootPid
    }

    $processIds += @($session.Processes | ForEach-Object { [int]$_.ProcessId })
    $processIds = @($processIds | Where-Object { $_ } | Sort-Object -Descending -Unique)

    foreach ($processId in $processIds) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 2

    Remove-IfExists $StatePath
    Remove-IfExists $LaunchCmdPath

    $status = Get-StatusObject 'stop'
    if ($processIds.Count -gt 0) {
        $status | Add-Member -NotePropertyName note -NotePropertyValue 'stopped'
    } else {
        $status | Add-Member -NotePropertyName note -NotePropertyValue 'already-stopped'
    }

    return $status
}

try {
    $result = switch ($Action) {
        'start' { Start-TauriDev }
        'status' { Get-StatusObject 'status' }
        'logs' { Get-LogsObject }
        'stop' { Stop-TauriDev }
    }

    Write-JsonResult -Value $result
} catch {
    $errorObject = [pscustomobject]@{
        action = $Action
        profile = $Profile
        state = 'error'
        repoRoot = $RepoRoot
        message = $_.Exception.Message
    }
    Write-JsonResult -Value $errorObject
    exit 1
}
