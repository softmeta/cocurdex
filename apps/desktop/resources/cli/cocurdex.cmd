@echo off
setlocal EnableExtensions

rem Cocurdex CLI launcher for Windows. Lives under resources\cli and is
rem installed into %LOCALAPPDATA%\Cocurdex\bin (on PATH).

set "CLI_DIR=%~dp0"
set "CLI_JS=%CLI_DIR%cli.mjs"

if not exist "%CLI_JS%" (
  echo cocurdex: missing cli.mjs next to the launcher. Reinstall Cocurdex. 1>&2
  exit /b 1
)

if defined COCURDEX_ELECTRON if exist "%COCURDEX_ELECTRON%" (
  set "ELECTRON=%COCURDEX_ELECTRON%"
  goto :run
)

rem Packaged: resources\cli -> app root\Cocurdex.exe
if exist "%CLI_DIR%..\..\Cocurdex.exe" (
  set "ELECTRON=%CLI_DIR%..\..\Cocurdex.exe"
  goto :run
)

rem Dev: electron package under apps\desktop\node_modules
if exist "%CLI_DIR%..\..\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%CLI_DIR%..\..\node_modules\electron\dist\electron.exe"
  goto :run
)
if exist "%CLI_DIR%..\..\..\..\node_modules\electron\dist\electron.exe" (
  set "ELECTRON=%CLI_DIR%..\..\..\..\node_modules\electron\dist\electron.exe"
  goto :run
)

echo cocurdex: could not locate Cocurdex.exe / electron.exe. 1>&2
exit /b 1

:run
set ELECTRON_RUN_AS_NODE=1
"%ELECTRON%" "%CLI_JS%" %*
exit /b %ERRORLEVEL%
