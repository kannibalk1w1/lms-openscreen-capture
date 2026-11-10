param(
    [Parameter(Mandatory=$true)][string]$NodeExe,
    [Parameter(Mandatory=$true)][string]$GodotExe,
    [Parameter(Mandatory=$true)][string]$ProbeRoot,
    [Parameter(Mandatory=$true)][string]$EvidenceRoot
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Only use a portable, explicitly prepared engine; never change installed editor settings.
if (!(Test-Path (Join-Path (Split-Path $GodotExe) '_sc_'))) { throw 'Prepare a disposable self-contained Godot directory first.' }
if (!(Test-Path (Join-Path $ProbeRoot 'decoder.cjs'))) { throw 'Missing host-bundled production decoder.' }
if (Test-Path $EvidenceRoot) { throw 'Choose a new evidence directory.' }
New-Item -ItemType Directory -Path $EvidenceRoot | Out-Null
$env:GODOT_BIN = $GodotExe
$env:OPENSCREEN_SCENE_DECODER = Join-Path $ProbeRoot 'decoder.cjs'
$env:OPENSCREEN_SCENE_PROBE_TMP = $EvidenceRoot
$stdout = Join-Path $EvidenceRoot 'probe-stdout.log'
$stderr = Join-Path $EvidenceRoot 'probe-stderr.log'
$entry = Join-Path $ProbeRoot 'scripts\probe-godot-scene.cjs'
$process = Start-Process -FilePath $NodeExe -ArgumentList @(('"' + $entry + '"')) -NoNewWindow -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr

# Acquire the handle before completion so PowerShell 5.1 retains the exit code.
$null = $process.Handle
if (!$process.WaitForExit(120000)) { throw "Probe exceeded deadline; inspect owned PID $($process.Id). No user processes were stopped." }
$process.Refresh()
Get-Content $stdout
if ($process.ExitCode -ne 0) { Get-Content $stderr; throw "Windows scene probe exited $($process.ExitCode)" }
$report = @{
    os = [Environment]::OSVersion.VersionString
    powershell = $PSVersionTable.PSVersion.ToString()
    node = (& $NodeExe --version | Out-String).Trim()
    godot = (& $GodotExe --version | Out-String).Trim()
    nodeSha256 = (Get-FileHash $NodeExe -Algorithm SHA256).Hash
    godotSha256 = (Get-FileHash $GodotExe -Algorithm SHA256).Hash
    probe = 'headless real Windows editor APIs and injected signals; no physical UI/capture acceptance'
    success = $true
}
$report | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $EvidenceRoot 'windows-report.json')
$report | ConvertTo-Json -Compress
