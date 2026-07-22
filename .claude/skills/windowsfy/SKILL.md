---
name: windowsfy
description: Invoked as "/windowsfy [path]" or when the user asks to "fix windows compatibility", "make package.json cross-platform", "windows portability", "run on windows", "cross-env", "shx", "PowerShell 5.1 error", "rm -rf on windows", "chmod on windows", "NODE_ENV not recognized", "glob not expanded on windows", "native binary on windows", "tfjs-node windows", "better-sqlite3 windows", "transformers windows", "token && is not a valid statement separator", "single quotes in npm scripts", or encounters npm script failures specific to Windows native shells. Path may be a directory, a single package.json file, or omitted (defaults to ./).
argument-hint: '[path]'
user-invocable: true
allowed-tools: [Read, Edit, Bash, Glob, Grep, AskUserQuestion]
metadata:
  author: wellwelwel
  version: '2026.5.12'
  source: engenharia-de-software-com-ia-aplicada course (troubleshooting/windows/commons.md, troubleshooting/windows/conflicts.md)
---

# windowsfy

Scans a Node.js project for Unix-only patterns in `package.json` scripts that fail on Windows native shells (CMD and PowerShell 5.1), then applies portable fixes after user confirmation. Each finding can be fixed in the recommended cross-platform style (using `cross-env`, `shx`, `glob`) or with a shell-specific fallback (CMD, PowerShell, or Bash-family native syntax).

## Categories

| Category       | Description                                                            | Reference                                                    |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `native-dep`   | C++ addon packages needing MS BuildTools (tfjs-node, better-sqlite3).  | [native-deps](references/native-deps.md)                     |
| `inline-env`   | `KEY=val node …` prefix unsupported by CMD and PowerShell.             | [inline-env-vars](references/inline-env-vars.md)             |
| `single-quote` | CMD passes single quotes literally — `--message 'text'` breaks.        | [single-quotes](references/single-quotes.md)                 |
| `unix-cmd`     | `rm -rf`, `chmod`, `cp -r`, `mv`, `mkdir -p` absent on Windows shells. | [unix-commands](references/unix-commands.md)                 |
| `glob-expand`  | CMD/PS don't expand `**/*.test.ts`; literal string reaches the binary. | [glob-patterns](references/glob-patterns.md)                 |
| `ps5-ampamp`   | PowerShell 5.1 rejects `&&` interactively (npm scripts still work).    | [powershell-5-operator](references/powershell-5-operator.md) |

## Platform requirement (HARD)

This skill **only runs on Windows native shells**:

- Supported: `cmd.exe`, `powershell.exe` (PS 5.1), `pwsh.exe` (PS 7+).
- Blocked: Linux, macOS, **WSL**, **Git Bash / MSYS2 / Cygwin**, mintty.

Blocked environments already provide POSIX shell semantics — the scripts in [troubleshooting/windows/commons.md](../../troubleshooting/windows/commons.md) execute correctly there, so running windowsfy would either add unneeded `devDependencies` or apply shell-locked fallbacks where none are required. There is no override flag.

## Invocation

```
/windowsfy [path]
```

- `[path]` may be a directory, a single `package.json`, or omitted.
- Omitted → `./` (current working directory, recursive scan).
- Directory → recursive scan from that directory.
- `package.json` file → scan only that file.
- Anything else (non-existent path, file that isn't `package.json`) → abort with a clear error.

## Step 0 — Environment guard (run FIRST, every time)

Before parsing the path, run:

```bash
node <skill-dir>/scripts/scan.mjs --check-env --json
```

Parse the JSON object: `{"env":"...","allowed":true|false,"reason":"..."}`.

- If `allowed === false`: print the detected `env` and `reason`, then stop. Do not parse the path. Do not invoke the scanner. Do not edit files.
- If `allowed === true`: continue to step 1.

The scanner also runs `detectEnv()` internally on every other mode, so even if this step is skipped, `--root`/`--file` will exit 2 with a stderr message.

## Step 0b — Ask which interactive shell the user uses

Once the env guard passes, use `AskUserQuestion` to ask which shell the user is sitting in. Three options, no auto-detect:

1. **CMD** (`cmd.exe`)
2. **Windows PowerShell 5.x** (`powershell.exe`) — default on Windows 10 and 11
3. **PowerShell 7+** (`pwsh.exe`)

Store the answer as `$SHELL_CHOICE` with values `cmd`, `ps5`, or `ps7`. Pass it to every subsequent `scan.mjs` invocation via `--shell $SHELL_CHOICE`.

The choice drives two things:

1. **Severity matrix in the scanner** — `ps5-ampamp` is reported as `info` only for `ps5`; for `cmd` and `ps7` it is silenced because `&&` works natively in both. All other categories remain `error` regardless of the choice, because `npm` on Windows spawns scripts via `cmd.exe` by default — the script runtime is CMD even when the user's interactive shell is PowerShell.
2. **Fallback ordering in Step 6** — the fallback matching `$SHELL_CHOICE` appears second (immediately after the cross-platform option), highlighted as the natural alternative.

### Per-shell severity matrix

| Category       | `cmd`    | `ps5` | `ps7`    |
| -------------- | -------- | ----- | -------- |
| `native-dep`   | info     | info  | info     |
| `inline-env`   | error    | error | error    |
| `single-quote` | error    | error | error    |
| `unix-cmd`     | error    | error | error    |
| `glob-expand`  | error    | error | error    |
| `ps5-ampamp`   | _silent_ | info  | _silent_ |

## Step 1 — Argument handling

1. Extract `[path]` from the user's invocation. If empty, treat as `./`.
2. Resolve to absolute path. Use `Bash` with `realpath` or `node -e "console.log(require('path').resolve(...))"`.
3. Classify the path:

   ```bash
   if [ -d "$P" ]; then echo dir
   elif [ -f "$P" ]; then echo file
   else echo missing
   fi
   ```

4. Apply (always include `--shell $SHELL_CHOICE`):
   - **dir** → `node <skill-dir>/scripts/scan.mjs --root <abs-path> --shell $SHELL_CHOICE --json`.
   - **file** → must be named `package.json`. `node <skill-dir>/scripts/scan.mjs --file <abs-path> --shell $SHELL_CHOICE --json`.
   - **missing** → print `windowsfy: path not found: <input>` and stop.

## Step 2 — Patterns detected

| #   | Category       | What fails on Windows                                                                                                                                    | Severity |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `native-dep`   | Packages with C++ addons need MS BuildTools to install (`@tensorflow/tfjs-node`, `better-sqlite3`, `@huggingface/transformers`, `@xenova/transformers`). | info     |
| 2   | `inline-env`   | `KEY=val node …` — Windows treats `KEY=val` as a command name.                                                                                           | error    |
| 3   | `single-quote` | `--message 'text'` — CMD passes single quotes literally.                                                                                                 | error    |
| 4   | `unix-cmd`     | `rm -rf`, `chmod`, `cp -r`, `mv`, `mkdir -p` — not present on Windows.                                                                                   | error    |
| 5   | `glob-expand`  | `tests/**/*.test.ts` — CMD/PS don't expand globs; the literal string is passed to the program.                                                           | error    |
| 6   | `ps5-ampamp`   | `&&` in PS 5.1 throws `ParserError: The token '&&' is not a valid statement separator`.                                                                  | info     |

## Step 3 — Detection workflow

1. Group findings from the scanner's `--json` output by `category`.
2. Build a summary table: `Category | Files affected | Severity`.
3. Print the summary to the user.
4. Skip the next steps for categories with zero findings.

## Step 4 — Confirm which categories to fix

Use `AskUserQuestion` to ask which categories the user wants fixed. Pre-explain:

- `native-dep` (info) → manual winget install steps from `references/native-deps.md`. No `package.json` edit.
- `ps5-ampamp` (info) → install PowerShell 7. No `package.json` edit by default (a PS-locked fallback exists).
- All other categories → auto-fixable.

## Step 5 — Pick fix style

For the categories the user confirmed in step 4, ask globally which style to apply (single `AskUserQuestion`). **Order the options based on `$SHELL_CHOICE`** so the fallback matching the user's shell appears second:

| `$SHELL_CHOICE` | Option order                                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| `cmd`           | 1. Cross-platform · 2. **CMD fallback** · 3. PowerShell fallback · 4. Per-finding |
| `ps5` or `ps7`  | 1. Cross-platform · 2. **PowerShell fallback** · 3. CMD fallback · 4. Per-finding |

Option descriptions:

1. **Cross-platform (recommended)** — `cross-env`, `shx`, `glob`. Works everywhere; adds devDependencies.
2. **CMD fallback** — `cmd /V:ON /C "set KEY=val & node …"`, `rmdir /S /Q`. Locks scripts to CMD.
3. **PowerShell fallback** — `$env:KEY='val'; node …`, `Remove-Item -Recurse -Force`. Locks scripts to PS.
4. **Per-finding** — prompt for each finding individually.

The Bash-family fallback is intentionally omitted on Windows-native (it makes no sense here — the user is running CMD or PowerShell). If a category has no fallback (e.g., `glob-expand`, `chmod` on CMD), silently downgrade to cross-platform for that category and note it in the output.

## Step 6 — Fix-style options table

| #   | Category              | Cross-platform (primary)              | CMD fallback                          | PowerShell fallback                  | Bash-family fallback    |
| --- | --------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------ | ----------------------- |
| 2   | `inline-env`          | `cross-env KEY=val node …`            | `cmd /V:ON /C "set KEY=val & node …"` | `$env:KEY='val'; node …`             | keep `KEY=val node …`   |
| 3   | `single-quote`        | escape `\"…\"`                        | escape `\"…\"` (CMD requires it)      | keep `'…'` or escape                 | keep `'…'`              |
| 4a  | `unix-cmd` (`rm -rf`) | `shx rm -rf folder`                   | `rmdir /S /Q folder`                  | `Remove-Item -Recurse -Force folder` | keep `rm -rf folder`    |
| 4b  | `unix-cmd` (`chmod`)  | `shx chmod 755 file` (no-op on Win)   | no native equivalent — downgrade      | no native equivalent — downgrade     | keep `chmod 755 file`   |
| 5   | `glob-expand`         | dir (Node 22+) or `glob -c "…" "…**"` | no fallback — downgrade               | no fallback — downgrade              | no fallback — downgrade |
| 6   | `ps5-ampamp`          | install PS 7 (manual)                 | n/a — `&&` works in CMD               | PS 5.1: `cmd1; if ($?) { cmd2 }`     | n/a — `&&` works        |

Full diffs and edge cases for each category live in `references/<topic>.md`.

## Step 7 — Apply fixes

For each affected `package.json`, fix categories in this order to avoid reflowing already-modified strings:

1. `unix-cmd`
2. `inline-env`
3. `single-quote`
4. `glob-expand`

Rules:

- Use `Edit`, one targeted edit per script value. No full-file rewrites.
- If the cross-platform style was chosen and the edit introduced a new tool, run `npm install --save-dev <pkg>` in that `package.json`'s directory, but only for tools not already in `dependencies`/`devDependencies`:
  - `inline-env` cross-platform → `cross-env`
  - `unix-cmd` cross-platform → `shx`
  - `glob-expand` option B → `glob`
- Shell-specific fallbacks never add a devDependency.

## Step 8 — Verify

Re-run the scanner with the same path/mode (`--root` or `--file`). Categories that were fixed must no longer appear. Residual findings are likely false positives (e.g., `sed` matched by `unix-cmd`); present them for manual review.

## Using the detection script directly

```
node scan.mjs --check-env [--json]
node scan.mjs [--root <dir> | --file <path/to/package.json>] [--shell <cmd|ps5|ps7>] [--json]
```

`--shell` defaults to `cmd` (strictest). Invalid values exit with code 64.

Exit codes:

- `0` success / env allowed
- `2` env not Windows-native, or path not found
- `64` invalid CLI arguments

Human-readable output format:

```
<rel-path>/package.json:<script-name>: [category] <snippet>
<rel-path>/package.json: [native-dep] @tensorflow/tfjs-node
```

JSON output: array of `{file, script, category, severity, snippet, fix}` (or the env object when `--check-env`).

## Example diffs

- [`examples/cross-env-before-after.json`](examples/cross-env-before-after.json)
- [`examples/shx-rm-rf-before-after.json`](examples/shx-rm-rf-before-after.json)
- [`examples/shx-chmod-before-after.json`](examples/shx-chmod-before-after.json)
- [`examples/single-quotes-before-after.json`](examples/single-quotes-before-after.json)
- [`examples/glob-directory-before-after.json`](examples/glob-directory-before-after.json)
- [`examples/native-deps-flag.json`](examples/native-deps-flag.json)

## Warnings & edge cases

- **`shx chmod` is a silent no-op on Windows.** The Windows file system has no executable bit. If the executable bit is needed for Linux CI/deploy, replace with a Node script using `fs.chmodSync` guarded by `process.platform`.
- **`@tensorflow/tfjs-node` requires Node 24 on Windows.** Node 22 is unsupported per [troubleshooting/windows/commons.md](../../troubleshooting/windows/commons.md). Migration: https://nodejs.org/en/blog/migrations/v22-to-v24
- **`&&` in PS 5.1 is not auto-fixable in `package.json`.** The scanner flags it as `info`, not `error`. Do not rewrite `&&` to `;` — that would break Unix execution. The PS-locked rewrite (`cmd1; if ($?) { cmd2 }`) is a fallback only.
- **False positives.** `sed`, URLs with single quotes, scripts intentionally Unix-only. The `--json` snippet field lets the user deselect findings before fixes are applied.
- **`cross-env` double-wrap guard.** The scanner skips values where `cross-env` appears before the `KEY=value` token. A chained `&& cross-env KEY=val node …` is recognized as already-handled.
- **Shell-locked fallbacks change portability.** If the user picks the CMD or PS fallback, `package.json` becomes tied to that shell — scripts will break on the others. Recommend documenting the chosen shell in the project README.
- **Mixed-style projects.** Avoid mixing primary and fallback styles in the same `package.json` unless the user explicitly chose "per-finding".
- **No override for the environment guard.** The skill cannot be coerced into running on Linux, macOS, WSL, Git Bash, MSYS2, or Cygwin. Apply diffs manually via `references/*.md` if needed from those environments.
- **npm's `script-shell` is `cmd.exe` by default on Windows.** Even when the user picks `ps5` or `ps7` in Step 0b, `single-quote` and `unix-cmd` remain `error` — those failures happen at script runtime (inside `cmd.exe` spawned by `npm run`), not in the interactive shell. The only category affected by the shell choice is `ps5-ampamp`, which becomes silent for `cmd` and `ps7` (where `&&` works natively). A user who has run `npm config set script-shell powershell.exe` (uncommon) would see different runtime behavior; the skill does not detect this.
