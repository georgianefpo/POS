---
name: single-quotes
description: CMD passes single quotes literally. Cross-platform fix via escaped double quotes; remains error severity even for ps5/ps7 because npm spawns scripts via cmd.exe.
---

# Single quotes in arguments

## Problem

CMD treats single quotes (`'`) as literal characters, passing them along with the argument value. PowerShell and Bash-family shells strip them as expected. So `--message 'What is the version?'` arrives at the program as `'What`, `is`, `the`, `version?'` on CMD instead of one argument `What is the version?`.

## Primary fix — escape with double quotes (cross-platform)

In `package.json`, JSON string values use double quotes, so a double quote inside the value must be escaped as `\"`:

```diff
- "start": "browser-sync -w . --server --files 'index.html, data/*.json, js/*.js' --port 3000"
+ "start": "browser-sync -w . --server --files \"index.html, data/*.json, js/*.js\" --port 3000"
```

```diff
- "chat:admin": "node ... --message 'What is the version in the package.json?'"
+ "chat:admin": "node ... --message \"What is the version in the package.json?\""
```

The escaped form works in CMD, PowerShell 5/7, Bash, ZSH, WSL, and Git Bash. No npm package required.

## Why this is `error` for `ps5` and `ps7` too

`windowsfy` reports `single-quote` as `error` regardless of which shell the user picked in Step 0b. The reason is the same npm nuance covered in `powershell-5-operator.md`:

- npm on Windows spawns scripts via `cmd.exe` by default (`script-shell` config). The parser that processes the script string is CMD's, not the user's interactive shell's.
- CMD does not strip single quotes — it passes them as literal characters to the program.
- Therefore the script breaks at `npm run` time even when the user is sitting in PowerShell 5 or PowerShell 7.

A user who has run `npm config set script-shell powershell.exe` (or `pwsh.exe`) would not see this problem, because PS strips single quotes correctly. But that configuration is uncommon and the skill does not detect it.

## Shell-specific fallback — keep single quotes

Bash, ZSH, WSL, Git Bash, PowerShell 5, and PowerShell 7 all accept single quotes inside `package.json` script strings **when those strings are interpreted by the matching shell**. Only CMD breaks. If the user commits to never running the script through CMD — which on Windows requires overriding `npm config set script-shell` — the original form can remain:

```json
"chat:admin": "node ... --message 'What is the version in the package.json?'"
```

In practice, the cross-platform fix (`\"…\"`) is almost always preferable because npm on Windows uses `cmd.exe` by default.

## Edge cases

- **URLs and JSON-in-arg patterns**: `curl 'https://api.example.com/?q=foo'` triggers the single-quote rule. The escape fix works (`\"https://...\"`). False positives are rare but possible — review the snippet.
- **SQL strings, sed expressions**: `sed -i 's/old/new/g' file.txt` would be flagged. The fix is to either escape (loses semantics for `sed`'s `s///` delimiter) or replace `sed` with a Node script. See `references/unix-commands.md`.
- **Nested quotes**: `"echo \"It's \"working\"\""` requires careful tracking. The scanner flags the outer single quote; manual edits should preserve nesting.

## Affected directories

- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-template/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte01-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte02-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte03-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte04-…/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-01-ecommerce-recomendations-z/parte05-…/`
- `modulo02-integracao-apis-llms/05-safeguard-prompt-injection-template/`
- `modulo02-integracao-apis-llms/05-safeguard-prompt-injection-z/`

## npm package involved

None.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Aspas simples em argumentos"
- ../../../troubleshooting/windows/conflicts.md §"Aspas simples em argumentos"
-->
