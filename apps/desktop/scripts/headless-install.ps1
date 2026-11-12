# Installs the headless Cocurdex daemon and CLI from a GitHub release.
#   irm https://github.com/softmeta/cocurdex/releases/latest/download/install.ps1 | iex
# $env:COCURDEX_VERSION pins a release, $env:COCURDEX_DOWNLOAD_URL names a mirror that holds
# the release assets, $env:COCURDEX_INSTALL_DIR overrides where it lands, and
# $env:COCURDEX_NO_MODIFY_PATH=1 leaves the user PATH alone.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repository = 'softmeta/cocurdex'

$osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$arch = switch ($osArch) {
  'X64' { 'x64' }
  default { throw "cocurdex install: unsupported architecture $osArch" }
}
$name = "cocurdex-headless-win32-$arch"
$asset = "$name.zip"
if ($env:COCURDEX_DOWNLOAD_URL) {
  $base = $env:COCURDEX_DOWNLOAD_URL.TrimEnd('/')
} elseif ($env:COCURDEX_VERSION) {
  $version = $env:COCURDEX_VERSION.TrimStart('v')
  $base = "https://github.com/$repository/releases/download/v$version"
} else {
  $base = "https://github.com/$repository/releases/latest/download"
}
$installDir = if ($env:COCURDEX_INSTALL_DIR) {
  $env:COCURDEX_INSTALL_DIR
} else {
  Join-Path $env:LOCALAPPDATA 'Programs\cocurdex'
}
$binDir = Join-Path $installDir 'bin'
$launcher = Join-Path $binDir 'cocurdex.cmd'

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("cocurdex-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  Write-Host "Downloading $asset"
  $archive = Join-Path $work $asset
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $archive
  Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset.sha256" -OutFile "$archive.sha256"
  $expected = ((Get-Content -Raw "$archive.sha256").Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $archive).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw "cocurdex install: checksum mismatch for $asset" }

  $extract = Join-Path $work 'extract'
  Expand-Archive -Path $archive -DestinationPath $extract
  $source = Join-Path $extract $name
  if (-not (Test-Path (Join-Path $source 'bin\cocurdex.cmd'))) {
    throw "cocurdex install: $asset has no bin\cocurdex.cmd"
  }

  $wasRunning = $false
  if (Test-Path $launcher) {
    # Windows PowerShell turns redirected native stderr into terminating errors under 'Stop'.
    $ErrorActionPreference = 'Continue'
    $stopExit = $null
    try {
      $stopResult = (& $launcher daemon stop --json 2>&1 | Out-String).Trim()
      $stopExit = $LASTEXITCODE
    } catch {
      $stopResult = "$_"
    }
    $ErrorActionPreference = 'Stop'
    if ($stopExit -ne 0) {
      throw "cocurdex install: could not stop the running daemon; retry when it is idle`n$stopResult"
    }
    $stopStatus = try { ($stopResult | ConvertFrom-Json).status } catch { $null }
    if ($stopStatus -eq 'stopped') {
      $wasRunning = $true
      Write-Host 'Stopped the daemon to upgrade it'
    } elseif ($stopStatus -eq 'notRunning') {
      Write-Host 'No running daemon to stop'
    } else {
      throw "cocurdex install: unexpected output from cocurdex daemon stop`n$stopResult"
    }
  }

  $parent = Split-Path -Parent $installDir
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $previous = "$installDir.old"
  if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }
  if (Test-Path $installDir) { Move-Item -Path $installDir -Destination $previous }
  Move-Item -Path $source -Destination $installDir
  if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = if ($userPath) { $userPath -split ';' } else { @() }
if (-not $env:COCURDEX_NO_MODIFY_PATH -and $entries -notcontains $binDir) {
  $nextPath = (@($entries | Where-Object { $_ }) + $binDir) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $nextPath, 'User')
  Write-Host "Added $binDir to your PATH; open a new terminal to use cocurdex"
}

$installed = (Get-Content (Join-Path $installDir 'VERSION'))[0]
Write-Host "Installed $installed to $installDir"
if ($wasRunning) {
  # A call operator child inherits this shell's handles and passes them on to the daemon the CLI
  # launches, which then holds a capturing caller's pipes open. ShellExecute inherits none.
  $restart = Start-Process -FilePath $launcher -ArgumentList 'daemon', 'status' -WindowStyle Hidden -PassThru
  $null = $restart.Handle
  $restart.WaitForExit()
  if ($restart.ExitCode -ne 0) {
    throw "cocurdex install: could not restart the daemon; run ``cocurdex daemon status`` to start it"
  }
  Write-Host 'Restarted the daemon'
}
Write-Host 'Run `cocurdex daemon background on` to start the daemon when you sign in'
