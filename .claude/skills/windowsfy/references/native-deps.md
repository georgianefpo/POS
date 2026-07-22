---
name: native-deps
description: C++ addon packages (tfjs-node, better-sqlite3, transformers) that need MS BuildTools on Windows. winget setup; Node 24 requirement for tfjs-node.
---

# Native binary dependencies

## Problem

`npm install` / `npm ci` fails for packages that compile C++ addons (native bindings) without a Windows C++ toolchain configured. Affected packages used in the course material:

- `@tensorflow/tfjs-node`
- `better-sqlite3`
- `@huggingface/transformers`
- `@xenova/transformers`

## Primary fix — install the toolchain (winget)

Run in PowerShell **before** `npm install`:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools
winget install --id Python.Python.3.14
winget install --id Microsoft.VCRedist.2015+.x64
# winget install --id Microsoft.VCRedist.2015+.x86
# winget install --id Microsoft.VCRedist.2015+.arm64
```

After install, restart the shell and re-run `npm install`.

## Hard requirement — Node 24 for `@tensorflow/tfjs-node` on Windows

`@tensorflow/tfjs-node` does **not** support Node.js 22 on Windows. Use Node 24 when the package is required.

- Migration notes: <https://nodejs.org/en/blog/migrations/v22-to-v24>

## Alternative — drop the native package

If the toolchain still fails (some distros / processors don't ship binaries), swap `@tensorflow/tfjs-node` for `@tensorflow/tfjs` (pure JavaScript, browser-oriented). Performance is lower and some floating-point operations may diverge, but no native toolchain is required.

```diff
- "@tensorflow/tfjs-node": "^4.22.0"
+ "@tensorflow/tfjs": "^4.22.0"
```

Code-level adjustment:

```diff
- import * as tf from '@tensorflow/tfjs-node';
+ import * as tf from '@tensorflow/tfjs';
```

## Shell-specific fallback — per-arch binary loading pattern

From [troubleshooting/windows/conflicts.md](../../../troubleshooting/windows/conflicts.md) §Binários. When a package publishes one artifact per platform × architecture, load it dynamically:

```js
require(`@esbuild/${process.platform}-${process.arch}`);

// require('@esbuild/linux-x64')
// require('@esbuild/darwin-arm64')
// require('@esbuild/win32-x64')
```

This is only useful when the package itself follows that publishing convention (esbuild, swc, etc.). It is not a fix for the four packages listed above, which use `node-gyp`-style compilation rather than per-arch artifacts.

## Affected directories

- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-template/` (`@tensorflow/tfjs-node`)
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-00-z/` (`@tensorflow/tfjs-node`)
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-08-context7/nextjs-better-auth-demo/` (`better-sqlite3`)
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j-template/` (`@huggingface/transformers`, `@xenova/transformers`)
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-12-embeddings-neo4j/` (`@huggingface/transformers`, `@xenova/transformers`)
- `modulo01-fundamentos-de-ia-e-llms-para-programadores/exemplo-13-embeddings-neo4j-rag/` (`@huggingface/transformers`, `@xenova/transformers`)
- `modulo02-integracao-apis-llms/04-song-highlights-template/` (`better-sqlite3`, `@huggingface/transformers`, `@xenova/transformers`)
- `modulo02-integracao-apis-llms/04-song-highlights-z/` (`better-sqlite3`, `@huggingface/transformers`, `@xenova/transformers`)

## npm packages involved

None to install via the skill — this is a system-level setup, not a `package.json` change.

<!--
Source references:
- ../../../troubleshooting/windows/commons.md §"Dependências nativas (binários)"
- ../../../troubleshooting/windows/conflicts.md §"Binários"
-->
