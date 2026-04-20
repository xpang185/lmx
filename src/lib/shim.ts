export function generateShimScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

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

for RUNNER_CLI in "$PROGRAM_DIR/../../dist/cli.js" "$PROGRAM_DIR/../../cli.js"; do
  if [ -f "$RUNNER_CLI" ]; then
    exec node "$RUNNER_CLI" run "$PROGRAM_DIR" "$@"
  fi
done

if command -v lmx >/dev/null 2>&1; then
  exec lmx run "$PROGRAM_DIR" "$@"
fi

exec npx --no-install lmx run "$PROGRAM_DIR" "$@"
`;
}

export function generateCmdShimScript(): string {
  return `@echo off
setlocal
for %%I in ("%~dp0.") do set "PROGRAM_DIR=%%~fI"

for %%I in ("%PROGRAM_DIR%\\..\\..\\dist\\cli.js" "%PROGRAM_DIR%\\..\\..\\cli.js") do (
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
`;
}
