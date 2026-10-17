# Launch the separately built official DSH 0.2.1-alpha.2 desktop sources.
# The signed installed application stays available; both use the existing DSH home.
$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $repository '.cache/dsh-desktop-alpha'
$electron = Join-Path $runtime 'node_modules/electron/dist/electron.exe'
$support = Join-Path $env:LOCALAPPDATA 'Programs/DeepSeek Harness/resources/runtime'
if (!(Test-Path -LiteralPath $electron) -or !(Test-Path -LiteralPath (Join-Path $runtime 'lib/main.js'))) {
    throw 'The local DSH Alpha desktop build is missing. See DeepSeekSecurity/DESKTOP.md.'
}
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh'
$env:DSH_DESKTOP_DSH_DIR = $runtime
$env:DSH_DESKTOP_PRIMARY_RUNTIME_DIR = Join-Path $support 'primary-runtime'
$env:DSH_DESKTOP_PNPM_ENTRY = Join-Path $support 'primary-runtime/dependencies/pnpm/bin/pnpm.mjs'
$env:DSH_DESKTOP_OPEN_DEVTOOLS = '0'
$env:ELECTRON_RUN_AS_NODE = $null
$userData = Join-Path $env:APPDATA 'DeepSeek Harness Alpha'
$launchStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Process -FilePath $electron -ArgumentList @("--user-data-dir=`"$userData`"", "`"$runtime`"") -WindowStyle Normal -RedirectStandardOutput (Join-Path $repository ".cache/dsh-alpha-$launchStamp.stdout.log") -RedirectStandardError (Join-Path $repository ".cache/dsh-alpha-$launchStamp.stderr.log")
