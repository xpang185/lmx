@echo off
setlocal
for %%I in ("%~dp0.") do set "PROGRAM_DIR=%%~fI"
call lmx run "%PROGRAM_DIR%" %*
