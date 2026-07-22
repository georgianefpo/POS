---
name: unix-commands
description: rm, chmod, cp, mv, mkdir -p missing on Windows. Cross-platform fix via shx (limited command set); CMD/PowerShell fallbacks; chmod has no native Windows equivalent.
---

# Unix commands (`rm -rf`, `chmod`, `cp -r`, `mv`, `mkdir -p`)

## Problem

Windows native shells (CMD and PowerShell) do not ship POSIX binaries like `rm`, `chmod`, `cp`, `mv`, `mkdir -p`. Scripts that call them directly fail with "'rm' is not recognized as an internal or external command" (CMD) or `CommandNotFoundException` (PowerShell).

## Primary fix — `shx` (cross-platform)

Install once:

```bash
npm install --save-dev shx
```

Prefix the Unix command with `shx`:

```diff
- "docker:infra:cleanup": "docker compose down --volumes && rm -rf storage"
+ "docker:infra:cleanup": "docker compose down --volumes && shx rm -rf storage"
```

```diff
- "build": "chmod 755 src/index.ts"
+ "build": "shx chmod 755 src/index.ts"
```

### `shx`-supported commands (only these)

`cat`, `chmod`, `cp`, `echo`, `ln`, `ls`, `mkdir`, `mv`, `pwd`, `rm`, `sed`, `sleep`, `touch`, `which`.

Anything else (e.g., `awk`, `grep`, `tar`, `find`, `xargs`) is not provided by `shx`. Replace those with a Node.js script using `fs`, `child_process`, or a dedicated npm package.

### Edge case — `shx chmod` is a no-op on Windows

Windows file systems have no executable bit. `shx chmod 755 file.sh` runs without error and leaves the file untouched on Windows. On Linux/macOS it sets the mode normally. If the script depends on `chmod` for CI/deploy that runs on Linux, the no-op behavior is acceptable — the bit is set when the same script runs in the Linux CI environment.

If the executable bit must be set explicitly during Windows-local development (e.g., for files that will be packaged into a tarball), replace `shx chmod` with a Node script:

```js
import { chmodSync } from 'node:fs';
chmodSync('src/index.ts', 0o755);
```

## Shell-specific fallback — `rm -rf`

CMD:

```diff
- "clean": "rm -rf storage"
+ "clean": "rmdir /S /Q storage"
```

PowerShell:

```diff
- "clean": "rm -rf storage"
+ "clean": "Remove-Item -Recurse -Force storage"
```

Bash family: keep `rm -rf storage`.

## Shell-specific fallback — `chmod`

No native CMD or PowerShell equivalent — [troubleshooting/windows/conflicts.md](../../../troubleshooting/windows/conflicts.md) §Comandos Unix explicitly notes this. Bash family keeps `chmod 755 file`. If the cross-platform fallback isn't acceptable and the user is on CMD/PS, the chmod step must be removed or moved to a Node script (see edge case above).

## Shell-specific fallback — `cp -r`, `mv`, `mkdir -p`

CMD: `xcopy /E /I src dst`, `move src dst`, `mkdir folder` (creates intermediate dirs by default).

PowerShell: `Copy-Item -Recurse src dst`, `Move-Item src dst`, `New-Item -ItemType Directory -Force folder`.

Bash: keep as-is.

## Affected directories

`rm -rf`:

- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-template/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-z/`
- `modulo03-mcp-na-pratica/01-multiple-mcp-tools-template/`
- `modulo03-mcp-na-pratica/01-multiple-mcp-tools-z/`
- `modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/nodejs-fastify-mongodb-crud/`
- `modulo03-mcp-na-pratica/09-using-mcp-with-langchain/01-multiple-mcp-tools-z/`

`chmod`:

- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/customers-mcp-z/`
- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/customers-mcp-z/`
- `modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z/`

## npm package involved

`shx` — devDependency, used for the cross-platform fix only.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Comandos Unix (`rm -rf`, `chmod`)"
- ../../../troubleshooting/windows/conflicts.md §"Comandos Unix (`rm -rf`, `chmod`)"
-->
