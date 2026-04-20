@echo off
setlocal
for %%I in ("%~dp0.") do set "PROGRAM_DIR=%%~fI"

for %%I in ("%PROGRAM_DIR%\..\..\dist\cli.js" "%PROGRAM_DIR%\..\..\cli.js") do (
  if exist "%%~fI" (
    call node "%%~fI" run "%PROGRAM_DIR%" %*
    exit /b %ERRORLEVEL%
  )
)

where lmx >nul 2>&1
if not errorlevel 1 (
  call lmx run "%PROGRAM_DIR%" %*
  exit /b %ERRORLEVEL%
)

call npx --no-install lmx run "%PROGRAM_DIR%" %*
