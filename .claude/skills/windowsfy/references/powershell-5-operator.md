---
name: powershell-5-operator
description: PS 5.1 fails to parse &&/|| interactively. Primary fix is installing PowerShell 7; PS 5.1 manual rewrite is interactive-only and never applied to package.json.
---

# PowerShell 5.1 `&&` operator

## Problem

The chaining operators `&&`, `||`, and `;` are standard in POSIX shells and PowerShell 7+. **PowerShell 5.1** — the version shipped by default on Windows 10 and Windows 11 — does not recognize `&&` or `||` and fails interactive invocations with:

```
ParserError: The token '&&' is not a valid statement separator in this version.
```

## Important nuance

`npm run` spawns its scripts via `cmd.exe` by default on Windows, regardless of the user's interactive shell. So a `package.json` script with `&&` works correctly even when the user is sitting in PowerShell 5.1, because npm hands the script off to CMD (which does support `&&`). The failure only manifests when the user types the chained command directly into a PowerShell 5.1 prompt.

This is why the scanner flags `&&` as `info` rather than `error`, and why the primary fix is to upgrade the interactive shell, not to edit `package.json`.

## When this matters (per-shell behavior in `windowsfy`)

The `windowsfy` skill asks the user in Step 0b which shell they use. The `ps5-ampamp` category is reported based on that choice:

| User's shell | `ps5-ampamp` severity | Rationale                                                                                                         |
| ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `cmd`        | _silent_              | CMD supports `&&` natively. No warning needed.                                                                    |
| `ps5`        | `info`                | PS 5.1 fails on `&&` when typed interactively, even though npm scripts still work because they run under cmd.exe. |
| `ps7`        | _silent_              | PS 7+ supports `&&` natively. No warning needed.                                                                  |

So a `ps5-ampamp` finding only shows up when the user explicitly says they use PS 5.1. In all three cases, the `&&` inside the `package.json` script itself runs fine via `npm run` because npm always spawns cmd.exe (unless the user has overridden `npm config set script-shell`, which is uncommon).

## Primary fix — install PowerShell 7+

```powershell
winget install --id Microsoft.PowerShell
```

Verify the version (use `pwsh.exe`, not `powershell.exe`):

```powershell
$PSVersionTable.PSVersion
```

After install, switch terminals (or set `pwsh.exe` as the default in Windows Terminal). Scripts that use `&&` from `package.json` and ad-hoc interactive commands both work without further edits.

## Shell-specific fallback — PS 5.1 manual rewrite

If the user must stay on PS 5.1 and a chain like `cd dir && npm publish` is being typed interactively, rewrite using `$?`:

| POSIX / PS 7+    | PS 5.1                        |
| ---------------- | ----------------------------- |
| `cmd1 && cmd2`   | `cmd1; if ($?) { cmd2 }`      |
| `cmd1 \|\| cmd2` | `cmd1; if (-not $?) { cmd2 }` |
| `cmd1; cmd2`     | `cmd1; cmd2` (unchanged)      |

**Do not apply this rewrite inside `package.json` scripts**: the rewritten form breaks on Bash, ZSH, WSL, Git Bash, and even PS 7+ in some contexts. Reserve the rewrite for interactive command-line use during a PS 5.1 session.

## Edge cases

- `cd dir && npm publish` — when typed interactively in PS 5.1, fails. When placed in a `package.json` script and run via `npm run …`, succeeds because npm spawns CMD.
- Mixed chains `cmd1 && cmd2 || cmd3` need explicit nesting in PS 5.1: `cmd1; if ($?) { cmd2 } else { cmd3 }`.
- Some CI runners pin PS 5.1; if scripts call each other across `npm run` boundaries, the chain inside each script runs through CMD but the orchestration shell may still be PS 5.1.

## Affected directories

Per [troubleshooting/windows/commons.md](../../../troubleshooting/windows/commons.md):

- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-template/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-z/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-template/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte01-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte02-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte03-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte04-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte05-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/_template/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte01/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-02-vencendo-qualquer-jogo/DuckHunt-JS-parte02/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-template/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-z/`
- `modulo03-mcp-na-pratica/01-multiple-mcp-tools-template/`
- `modulo03-mcp-na-pratica/01-multiple-mcp-tools-z/`
- `modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/nodejs-fastify-mongodb-crud/`
- `modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z/`
- `modulo03-mcp-na-pratica/09-using-mcp-with-langchain/01-multiple-mcp-tools-z/`

## npm package involved

None — primary fix is a system install.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Operador `&&` no PowerShell 5.1"
- ../../../troubleshooting/windows/conflicts.md §"Operadores lógicos (`&&`, `||`, `;`)"
-->
