@echo off
setlocal
set "INVOKE_DIR=%~dp0"
for %%I in ("%~dp0.") do set "PROGRAM_DIR=%%~fI"

if exist "%INVOKE_DIR%lmx.cmd" (
  call "%INVOKE_DIR%lmx.cmd" run "%PROGRAM_DIR%" %*
  exit /b %ERRORLEVEL%
)

if exist "%INVOKE_DIR%lmx" (
  call "%INVOKE_DIR%lmx" run "%PROGRAM_DIR%" %*
  exit /b %ERRORLEVEL%
)

where lmx >nul 2>&1
if not errorlevel 1 (
  call lmx run "%PROGRAM_DIR%" %*
  exit /b %ERRORLEVEL%
)

call npx --no-install lmx run "%PROGRAM_DIR%" %*
