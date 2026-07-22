#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.next',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.turbo',
]);

const NATIVE_DEP_PACKAGES = Object.freeze([
  '@tensorflow/tfjs-node',
  'better-sqlite3',
  '@huggingface/transformers',
  '@xenova/transformers',
]);

const VALID_SHELLS = Object.freeze(['cmd', 'ps5', 'ps7']);

const SEVERITY_BY_SHELL = {
  cmd: {
    'native-dep': 'info',
    'inline-env': 'error',
    'single-quote': 'error',
    'unix-cmd': 'error',
    'glob-expand': 'error',
    'ps5-ampamp': 'silent',
  },
  ps5: {
    'native-dep': 'info',
    'inline-env': 'error',
    'single-quote': 'error',
    'unix-cmd': 'error',
    'glob-expand': 'error',
    'ps5-ampamp': 'info',
  },
  ps7: {
    'native-dep': 'info',
    'inline-env': 'error',
    'single-quote': 'error',
    'unix-cmd': 'error',
    'glob-expand': 'error',
    'ps5-ampamp': 'silent',
  },
};

const regex = {
  inlineEnv:
    /(?<![A-Za-z0-9_])([A-Z][A-Z0-9_]*)=(\S+)\s+(node|npm|npx|ts-node|tsx|deno|bun)\b/,
  unixCmd:
    /(?:^|[\s;&|`(])(rm\s+-[rf]+|chmod\s+[0-7]{3,4}|cp\s+-[rR]|mv\s+(?!\$)|mkdir\s+-p)\b/,
  glob: /\S*\*\*\/\S*/,
  ampamp: /&&/,
  singleQuote: /'[^']*'/,
  shxPrefix: /shx\s+$/,
};

const FIX = {
  nativeDep:
    'Install winget BuildTools/Python/VCRedist; consider swapping tfjs-node for tfjs; tfjs-node requires Node 24 on Windows.',
  inlineEnv: 'Prefix with cross-env.',
  unixCmd: 'Prefix with shx (rm/cp/mv/mkdir/chmod supported).',
  singleQuote: 'Replace with escaped double quotes \\"…\\".',
  globExpand:
    'Point at directory (Node 22+ recursive --test) or wrap in glob -c.',
  ps5Ampamp:
    'Install PowerShell 7+ via winget. Not auto-fixable in package.json.',
};

const fail = (message, exitCode = 2) => {
  process.stderr.write(`windowsfy: ${message}\n`);
  process.exit(exitCode);
};

const isWslKernel = async () => {
  try {
    const version = (await readFile('/proc/version', 'utf8')).toLowerCase();
    return version.includes('microsoft') || version.includes('wsl');
  } catch {
    return false;
  }
};

export const detectEnv = async () => {
  if (process.platform === 'linux')
    return (await isWslKernel()) ? 'wsl' : 'linux';
  if (process.platform === 'darwin') return 'darwin';

  if (process.platform === 'win32') {
    if (process.env.MSYSTEM) return 'git-bash';
    if ((process.env.OSTYPE || '').includes('cygwin')) return 'cygwin';
    if (process.env.TERM_PROGRAM === 'mintty') return 'git-bash';
    return 'windows-native';
  }

  return 'unknown';
};

const STATIC_REASONS = {
  'windows-native': 'Native Windows shell (CMD or PowerShell) detected.',
  wsl: 'WSL detected via /proc/version. POSIX shell semantics already apply — windowsfy is not needed.',
  cygwin:
    'Cygwin detected via OSTYPE. POSIX shell semantics already apply — windowsfy is not needed.',
  linux:
    'Native Linux detected. POSIX shell semantics already apply — windowsfy is not needed.',
  darwin:
    'macOS detected. POSIX shell semantics already apply — windowsfy is not needed.',
};

const describeEnv = (env) => {
  if (env === 'git-bash')
    return `Git Bash / MSYS2 detected (MSYSTEM=${process.env.MSYSTEM || 'mintty'}). POSIX shell semantics already apply — windowsfy is not needed.`;

  if (env === 'unknown')
    return `Unknown platform (${process.platform}). windowsfy targets Windows native shells only.`;

  return STATIC_REASONS[env];
};

export const envInfo = async () => {
  const env = await detectEnv();
  return {
    env,
    allowed: env === 'windows-native',
    reason: describeEnv(env),
  };
};

const requireWindowsNative = async () => {
  const info = await envInfo();
  if (info.allowed) return;
  fail(`refusing to run on ${info.env}.\n${info.reason}`);
};

export const walk = async (root, files = []) => {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(root, entry.name), files);
      continue;
    }

    if (entry.isFile() && entry.name === 'package.json')
      files.push(join(root, entry.name));
  }

  return files;
};

export const loadPackageJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `windowsfy: failed to parse ${path}: ${error.message}\n`
    );
    return null;
  }
};

export const findNativeDeps = (pkg) => {
  const findings = [];
  const allDeps = {
    ...(pkg.dependencies || Object.create(null)),
    ...(pkg.devDependencies || Object.create(null)),
  };

  for (const dep of NATIVE_DEP_PACKAGES) {
    if (dep in allDeps)
      findings.push({
        script: null,
        category: 'native-dep',
        severity: 'info',
        snippet: dep,
        fix: FIX.nativeDep,
      });
  }

  return findings;
};

export const tokenPrecedes = (value, token, matchIndex) =>
  value.slice(0, matchIndex).includes(token);

const collectInlineEnv = (script, value, findings) => {
  const match = value.match(regex.inlineEnv);
  if (!match || tokenPrecedes(value, 'cross-env', match.index)) return;

  findings.push({
    script,
    category: 'inline-env',
    severity: 'error',
    snippet: match[0],
    fix: FIX.inlineEnv,
  });
};

const collectUnixCmd = (script, value, findings) => {
  const match = value.match(regex.unixCmd);
  if (!match) return;

  const command = match[1];
  const commandStart = match.index + match[0].indexOf(command);
  const lookBehind = value.slice(Math.max(0, commandStart - 5), commandStart);
  if (regex.shxPrefix.test(lookBehind)) return;

  findings.push({
    script,
    category: 'unix-cmd',
    severity: 'error',
    snippet: command,
    fix: FIX.unixCmd,
  });
};

const collectSingleQuote = (script, value, findings) => {
  const match = value.match(regex.singleQuote);
  if (!match) return;

  findings.push({
    script,
    category: 'single-quote',
    severity: 'error',
    snippet: match[0],
    fix: FIX.singleQuote,
  });
};

const collectGlob = (script, value, findings) => {
  if (value.includes('glob -c')) return;

  const match = value.match(regex.glob);
  if (!match) return;

  findings.push({
    script,
    category: 'glob-expand',
    severity: 'error',
    snippet: match[0],
    fix: FIX.globExpand,
  });
};

const collectAmpamp = (script, value, findings) => {
  if (!regex.ampamp.test(value)) return;

  findings.push({
    script,
    category: 'ps5-ampamp',
    severity: 'info',
    snippet: '&&',
    fix: FIX.ps5Ampamp,
  });
};

export const scanScripts = (pkg) => {
  const findings = [];
  const scripts = pkg.scripts || Object.create(null);

  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== 'string') continue;

    collectInlineEnv(name, value, findings);
    collectUnixCmd(name, value, findings);
    collectSingleQuote(name, value, findings);
    collectGlob(name, value, findings);
    collectAmpamp(name, value, findings);
  }

  return findings;
};

export const scanPackageJson = async (absolutePath, rootForRelative) => {
  const pkg = await loadPackageJson(absolutePath);
  if (!pkg) return [];

  const relativePath = rootForRelative
    ? relative(rootForRelative, absolutePath)
    : absolutePath;
  const file = relativePath || basename(absolutePath);

  return [
    ...findNativeDeps(pkg).map((finding) => ({ file, ...finding })),
    ...scanScripts(pkg).map((finding) => ({ file, ...finding })),
  ];
};

export const applySeverity = (findings, shell) => {
  const matrix = SEVERITY_BY_SHELL[shell];
  const result = [];

  for (const finding of findings) {
    const severity = matrix[finding.category];
    if (severity === 'silent') continue;
    result.push({ ...finding, severity });
  }

  return result;
};

export const parseArgs = (argv) => {
  const args = {
    json: false,
    checkEnv: false,
    root: null,
    file: null,
    shell: 'cmd',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--json') {
      args.json = true;
      continue;
    }

    if (arg === '--check-env') {
      args.checkEnv = true;
      continue;
    }

    if (arg === '--root') {
      args.root = argv[++i];
      continue;
    }

    if (arg === '--file') {
      args.file = argv[++i];
      continue;
    }

    if (arg === '--shell') {
      const value = argv[++i];
      if (!VALID_SHELLS.includes(value))
        fail(
          `invalid --shell value: ${value}. Expected one of: ${VALID_SHELLS.join(', ')}.`,
          64
        );
      args.shell = value;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }

    fail(`unknown argument: ${arg}`, 64);
  }

  return args;
};

const HELP_TEXT = `Usage:
  node scan.mjs --check-env [--json]
  node scan.mjs [--root <dir> | --file <path/to/package.json>] [--shell <cmd|ps5|ps7>] [--json]

Flags:
  --check-env       Preflight only. Emits the env detection object.
  --root <dir>      Recursive scan from <dir>. Defaults to process.cwd().
  --file <path>     Scan a single package.json.
  --shell <name>    Severity matrix for the user's interactive shell.
                    One of: cmd, ps5, ps7. Default: cmd (strictest).
  --json            Emit JSON instead of human-readable lines.
  -h, --help        Show this help.

Exit codes:
  0  success (scan completed or env allowed)
  2  environment not Windows-native, or path missing
  64 invalid CLI arguments
`;

const printHelp = () => process.stdout.write(HELP_TEXT);

const formatFindingLine = (finding) =>
  finding.script
    ? `${finding.file}:${finding.script}: [${finding.category}] ${finding.snippet}\n`
    : `${finding.file}: [${finding.category}] ${finding.snippet}\n`;

const emitHuman = (findings) => {
  if (findings.length === 0) {
    process.stdout.write('windowsfy: no findings.\n');
    return;
  }

  for (const finding of findings)
    process.stdout.write(formatFindingLine(finding));
};

const emitJson = (value) =>
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');

const runCheckEnv = async (asJson) => {
  const info = await envInfo();

  if (asJson) process.stdout.write(JSON.stringify(info) + '\n');
  else
    process.stdout.write(
      `${info.env} (allowed=${info.allowed}): ${info.reason}\n`
    );

  process.exit(info.allowed ? 0 : 2);
};

const ensurePackageJsonFile = async (path) => {
  const absolute = resolve(path);

  if (basename(absolute) !== 'package.json')
    fail(`--file must point to a package.json (got: ${basename(absolute)})`);

  try {
    await stat(absolute);
  } catch {
    fail(`file not found: ${absolute}`);
  }

  return absolute;
};

const ensureDirectory = async (path) => {
  const absolute = resolve(path);

  try {
    if (!(await stat(absolute)).isDirectory())
      fail(`--root must be a directory: ${absolute}`);
  } catch {
    fail(`directory not found: ${absolute}`);
  }

  return absolute;
};

const collectFindings = async (args) => {
  if (args.file)
    return scanPackageJson(await ensurePackageJsonFile(args.file), null);

  const root = await ensureDirectory(args.root || process.cwd());
  const findings = [];

  for (const file of await walk(root))
    findings.push(...(await scanPackageJson(file, root)));

  return findings;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.checkEnv) {
    await runCheckEnv(args.json);
    return;
  }

  await requireWindowsNative();

  if (args.root && args.file)
    fail('--root and --file are mutually exclusive.', 64);

  const findings = applySeverity(await collectFindings(args), args.shell);

  if (args.json) emitJson(findings);
  else emitHuman(findings);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main().catch((error) => {
    process.stderr.write(`windowsfy: unexpected error: ${error.message}\n`);
    process.exit(1);
  });
