export function generateShimScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

INVOKED_PATH="\${BASH_SOURCE[0]}"
INVOKE_DIR="$(cd -P "$(dirname "$INVOKED_PATH")" >/dev/null 2>&1 && pwd)"
SOURCE="\${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  TARGET="$(readlink "$SOURCE")"
  if [[ "$TARGET" != /* ]]; then
    SOURCE="$DIR/$TARGET"
  else
    SOURCE="$TARGET"
  fi
done
PROGRAM_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
RUNNER="$INVOKE_DIR/lmx"

if [ -x "$RUNNER" ]; then
  "$RUNNER" run "$PROGRAM_DIR" "$@"
elif command -v lmx >/dev/null 2>&1; then
  lmx run "$PROGRAM_DIR" "$@"
else
  npx --no-install lmx run "$PROGRAM_DIR" "$@"
fi
`;
}

export function generateCmdShimScript(): string {
  return `@echo off
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
`;
}
