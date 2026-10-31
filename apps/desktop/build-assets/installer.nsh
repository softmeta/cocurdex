!macro customUnInstall
  ${ifNot} ${isUpdated}
    ReadEnvStr $0 LOCALAPPDATA
    Delete "$0\Cocurdex\bin\cocurdex.cmd"
    RMDir "$0\Cocurdex\bin"
    RMDir "$0\Cocurdex"
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$bin = Join-Path $$env:LOCALAPPDATA 'Cocurdex\bin'; $$userPath = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($$userPath) { $$kept = @($$userPath -split ';' | Where-Object { $$_ -and ($$_.TrimEnd('\') -ne $$bin) }); [Environment]::SetEnvironmentVariable('Path', ($$kept -join ';'), 'User') }"`
    Pop $0
  ${endIf}
!macroend
