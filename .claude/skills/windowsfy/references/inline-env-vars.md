---
name: inline-env-vars
description: KEY=value prefix in npm scripts. Cross-platform fix via cross-env; CMD and PowerShell native fallbacks.
---

# Inline environment variables

## Problem

POSIX shells accept `KEY=value command …` as a one-shot environment assignment for the spawned process. Windows CMD and PowerShell do not — they interpret `KEY=value` as the command name itself and fail with "is not recognized as an internal or external command".

Triggers in the course material include `NODE_ENV=test node …`, `DB_NAME=customers node …`, `NODE_OPTIONS=… node …`.

## Primary fix — `cross-env` (cross-platform)

Install once:

```bash
npm install --save-dev cross-env
```

Prefix every script that sets an inline env var:

```diff
  "scripts": {
-   "start": "DB_NAME=customers node src/index.js",
-   "test":  "NODE_ENV=test node --test test/api.test.js"
+   "start": "cross-env DB_NAME=customers node src/index.js",
+   "test":  "cross-env NODE_ENV=test node --test test/api.test.js"
  }
```

Multi-variable form:

```json
"start": "cross-env NODE_ENV=production DB_NAME=customers node src/index.js"
```

### Edge case — don't double-wrap

If `cross-env` already precedes the `KEY=value` token (even after `&&`), the scanner skips the value. Manual edits should follow the same rule — a single `cross-env` covers all variables until the next command boundary.

## Shell-specific fallback — CMD

```diff
- "start": "DB_NAME=customers node src/index.js"
+ "start": "cmd /V:ON /C \"set DB_NAME=customers & node src/index.js\""
```

`/V:ON` enables delayed expansion; required when the script reads the variable later with `!DB_NAME!`. Scripts written this way break in PowerShell and Bash.

## Shell-specific fallback — PowerShell

```diff
- "start": "DB_NAME=customers node src/index.js"
+ "start": "$env:DB_NAME='customers'; node src/index.js"
```

Works in PS 5.1 and PS 7+. Breaks in CMD and Bash.

## Shell-specific fallback — Bash family

```diff
  "start": "DB_NAME=customers node src/index.js"
```

No change. Works in Bash, ZSH, WSL, Git Bash, and PowerShell 7+ when `npm` is configured with a POSIX-compatible script shell. Fails in CMD and PowerShell 5.1.

## Affected directories

- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/`
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-09-grafana-mcp/alumnus/_alumnus/`
- `modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/nodejs-fastify-mongodb-crud/`
- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/nodejs-fastify-mongodb-crud-z/`
- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/nodejs-fastify-mongodb-crud-z/`
- `modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/nodejs-fastify-mongodb-crud-z/`
- `modulo03-mcp-na-pratica/09-using-mcp-with-langchain/nodejs-fastify-mongodb-crud-z/`

## npm package involved

`cross-env` — devDependency, used for the cross-platform fix only.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Variáveis de ambiente em linha (`NODE_ENV=`, `DB_NAME=`)"
- ../../../troubleshooting/windows/conflicts.md §"Variáveis inline"
-->
