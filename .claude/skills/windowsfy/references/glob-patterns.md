---
name: glob-patterns
description: CMD and PowerShell don't expand globs. Cross-platform fixes via directory argument (Node 22+) or glob -c wrapper; no shell-level fallback.
---

# Glob `tests/**/*.test.ts`

## Problem

POSIX shells expand `tests/**/*.test.ts` into a list of matching files before invoking the command. Windows CMD and PowerShell do not perform this expansion — the literal string `tests/**/*.test.ts` is passed to `node` (or whichever program), which then fails to find any matching file.

## Primary fix A — point at the directory (Node 22+)

`node --test` performs its own recursive lookup starting from a directory argument (Node 22+). For projects already on Node 22 or 24, this is the cleanest option — no extra dependency.

```diff
  "scripts": {
-   "test":     "node --test tests/**/*.test.ts",
-   "test:dev": "node --inspect --test --watch tests/**/*.test.ts"
+   "test":     "node --test tests/",
+   "test:dev": "node --inspect --test --watch tests/"
  }
```

Limitation: only the Node built-in test runner honors directory arguments this way. Other tools (`vitest`, `jest`, `mocha`) need their own config or option B.

## Primary fix B — wrap with `glob -c`

Install once:

```bash
npm install --save-dev glob
```

`glob -c` expands the pattern in Node and then invokes the wrapped command with the file list:

```diff
- "test": "node --test tests/**/*.test.ts"
+ "test": "glob -c \"node --test\" \"tests/**/*.test.ts\""
```

Use option B when the test runner does not accept a directory argument or when finer-grained patterns are needed.

## Shell-specific fallback

None. [troubleshooting/windows/conflicts.md](../../../troubleshooting/windows/conflicts.md) does not document a CMD or PowerShell shell-level glob equivalent that works portably. For Windows-only projects, you can hard-code the file list, but that loses the spirit of a glob and creates maintenance overhead.

## Edge cases

- **Nested globs**: `src/**/__tests__/*.spec.ts` — both options A (directory) and B (`glob -c`) handle this. Option A requires a different root (`src/`).
- **Negation patterns**: `node --test tests/**/*.test.ts \"!tests/skip/**\"` — only `glob` supports the `!` prefix; the directory shortcut cannot exclude.
- **Symbolic links**: `glob` follows symlinks by default; pass `--no-follow` if that matters for the test corpus.

## Affected directories

- `modulo02-integracao-apis-llms/01-smart-model-router-gateway/`
- `modulo02-integracao-apis-llms/02-langchain-intro/`
- `modulo02-integracao-apis-llms/03-medical-appointment-template/`
- `modulo02-integracao-apis-llms/03-medical-appointment-z/`
- `modulo02-integracao-apis-llms/04-song-highlights-template/`
- `modulo02-integracao-apis-llms/04-song-highlights-z/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-template/`
- `modulo02-integracao-apis-llms/06-rag-neo4j-students-z/`
- `modulo02-integracao-apis-llms/07-doc-analysis/`
- `modulo03-mcp-na-pratica/02-google-trends-agent/`
- `modulo03-mcp-na-pratica/05-mcps-do-zero-template/`
- `modulo03-mcp-na-pratica/05-mcps-do-zero-z/`
- `modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-template/`
- `modulo03-mcp-na-pratica/06-your-legacy-api-as-mcp/customers-mcp-z/`
- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-template/customers-mcp-z/`
- `modulo03-mcp-na-pratica/07-api-security-auth-rate-limiting-z/customers-mcp-z/`
- `modulo03-mcp-na-pratica/08-publishing-mcps-private-npm/customers-mcp-z/`

## npm package involved

`glob` — devDependency, used for option B only.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Glob `tests/**/*.test.ts`"
-->
