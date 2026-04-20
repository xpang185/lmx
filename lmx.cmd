@echo off
setlocal
set "ROOT_DIR=%~dp0"
call node "%ROOT_DIR%dist\cli.js" %*
