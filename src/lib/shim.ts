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

exec lmx run "$PROGRAM_DIR" "$@"
`;
}

export function generateCmdShimScript(): string {
  return `@echo off
setlocal
for %%I in ("%~dp0.") do set "PROGRAM_DIR=%%~fI"
call lmx run "%PROGRAM_DIR%" %*
`;
}
