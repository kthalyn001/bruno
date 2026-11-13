#!/usr/bin/env node

/**
 * Bruno Fork & macOS Build Manager (TUI)
 *
 * Interactive terminal tool to:
 * 1. Sync & rebase this fork onto upstream/main (https://github.com/usebruno/bruno.git)
 * 2. Push rebased branch to origin with --force-with-lease
 * 3. Build workspace packages, React UI, and macOS Bruno.app bundle locally
 * 4. Install Bruno.app into /Applications/Bruno.app
 *
 * Usage:
 *   ./scripts/bruno-tui.js              # Launch interactive TUI
 *   ./scripts/bruno-tui.js --status     # Print repo & build status
 *   ./scripts/bruno-tui.js --rebase     # Fetch upstream & rebase local branch
 *   ./scripts/bruno-tui.js --build      # Build macOS Bruno.app bundle
 *   ./scripts/bruno-tui.js --install    # Copy built Bruno.app to /Applications
 *   ./scripts/bruno-tui.js --all        # Rebase + Build + Install
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const REPO_ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(REPO_ROOT, 'packages', 'bruno-electron');
const APP_DIR = path.join(REPO_ROOT, 'packages', 'bruno-app');
const UPSTREAM_URL = 'https://github.com/usebruno/bruno.git';
const INSTALL_TARGET = '/Applications/Bruno.app';

// ANSI escape codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
  black: '\x1b[30m'
};

function runQuiet(cmd, cwd = REPO_ROOT) {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

function runStreaming(cmd, args, options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const env = { ...process.env, ...(options.env || {}) };
  const display = [cmd, ...(args || [])].join(' ');
  console.log(`\n${c.dim}$ ${display}${c.reset}`);

  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: options.shell ?? false
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${display}`);
  }
}

function findBuiltAppBundle() {
  const outDir = path.join(ELECTRON_DIR, 'out');
  const candidates = [
    path.join(outDir, `mac-${process.arch}`, 'Bruno.app'),
    path.join(outDir, 'mac-arm64', 'Bruno.app'),
    path.join(outDir, 'mac-x64', 'Bruno.app'),
    path.join(outDir, 'mac-universal', 'Bruno.app'),
    path.join(outDir, 'mac', 'Bruno.app')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function formatTimestamp(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime.toLocaleString();
  } catch {
    return 'unknown';
  }
}

function hasDependenciesInstalled() {
  const electronBuilderBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'electron-builder');
  const pkgElectronBuilderBin = path.join(ELECTRON_DIR, 'node_modules', '.bin', 'electron-builder');
  return fs.existsSync(electronBuilderBin) || fs.existsSync(pkgElectronBuilderBin);
}

function isBrunoRunning() {
  const res = runQuiet('pgrep -x Bruno');
  return Boolean(res);
}

function getRepoStatus() {
  const branch = runQuiet('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const headShort = runQuiet('git rev-parse --short HEAD') || 'unknown';
  const originUrl = runQuiet('git remote get-url origin');
  const upstreamUrl = runQuiet('git remote get-url upstream');

  const porcelain = runQuiet('git status --porcelain') || '';
  const changedLines = porcelain ? porcelain.split('\n').filter(Boolean) : [];
  const isRebasing =
    fs.existsSync(path.join(REPO_ROOT, '.git', 'rebase-merge')) ||
    fs.existsSync(path.join(REPO_ROOT, '.git', 'rebase-apply'));

  let upstreamAhead = null;
  let upstreamBehind = null;
  let customCommits = [];
  const hasUpstreamMain = Boolean(runQuiet('git rev-parse --verify upstream/main'));

  if (hasUpstreamMain) {
    const counts = runQuiet('git rev-list --left-right --count upstream/main...HEAD');
    if (counts) {
      const [behind, ahead] = counts.split(/\s+/).map((n) => parseInt(n, 10));
      upstreamBehind = behind;
      upstreamAhead = ahead;
    }
    const logOut = runQuiet('git log --oneline upstream/main..HEAD');
    if (logOut) {
      customCommits = logOut.split('\n').filter(Boolean);
    }
  }

  let originAhead = null;
  let originBehind = null;
  const hasOriginBranch = Boolean(runQuiet(`git rev-parse --verify origin/${branch}`));
  if (hasOriginBranch) {
    const counts = runQuiet(`git rev-list --left-right --count origin/${branch}...HEAD`);
    if (counts) {
      const [behind, ahead] = counts.split(/\s+/).map((n) => parseInt(n, 10));
      originBehind = behind;
      originAhead = ahead;
    }
  }

  const builtAppPath = findBuiltAppBundle();
  const installedExists = fs.existsSync(INSTALL_TARGET);
  const depsInstalled = hasDependenciesInstalled();
  const running = isBrunoRunning();

  return {
    branch,
    headShort,
    originUrl,
    upstreamUrl,
    changedCount: changedLines.length,
    isRebasing,
    hasUpstreamMain,
    upstreamAhead,
    upstreamBehind,
    customCommits,
    hasOriginBranch,
    originAhead,
    originBehind,
    builtAppPath,
    installedExists,
    depsInstalled,
    running
  };
}

function printStatusBanner(status) {
  const line = '─'.repeat(68);
  console.log(`${c.cyan}╭${line}╮${c.reset}`);
  console.log(
    `${c.cyan}│${c.reset} ${c.bold}${c.yellow}🐶 Bruno Fork & macOS App Manager${c.reset}${' '.repeat(34)}${c.cyan}│${c.reset}`
  );
  console.log(`${c.cyan}╰${line}╯${c.reset}`);

  // Git section
  console.log(`\n${c.bold}Git Repository:${c.reset}`);
  console.log(`  Branch:        ${c.bold}${c.cyan}${status.branch}${c.reset} ${c.dim}(${status.headShort})${c.reset}`);

  if (status.isRebasing) {
    console.log(`  Working Tree:  ${c.red}${c.bold}⚠ REBASE IN PROGRESS${c.reset}`);
  } else if (status.changedCount === 0) {
    console.log(`  Working Tree:  ${c.green}✓ Clean${c.reset}`);
  } else {
    console.log(`  Working Tree:  ${c.yellow}● ${status.changedCount} uncommitted file(s)${c.reset}`);
  }

  if (status.hasUpstreamMain && status.upstreamBehind !== null) {
    const behindText =
      status.upstreamBehind === 0
        ? `${c.green}✓ Up to date with upstream/main${c.reset}`
        : `${c.yellow}↓ Behind upstream/main by ${status.upstreamBehind} commit(s)${c.reset}`;
    const aheadText = `${c.cyan}↑ ${status.upstreamAhead} custom commit(s)${c.reset}`;
    console.log(`  Upstream Sync: ${behindText}  (${aheadText})`);
  } else {
    console.log(`  Upstream Sync: ${c.dim}upstream/main not fetched yet${c.reset}`);
  }

  if (status.hasOriginBranch && status.originBehind !== null) {
    if (status.originBehind === 0 && status.originAhead === 0) {
      console.log(`  Origin Sync:   ${c.green}✓ Synced with origin/${status.branch}${c.reset}`);
    } else {
      console.log(
        `  Origin Sync:   ${c.yellow}↑ Ahead ${status.originAhead}, ↓ Behind ${status.originBehind} (origin/${status.branch})${c.reset}`
      );
    }
  }

  if (status.customCommits.length > 0) {
    console.log(`  Fork Patch(es) on top of upstream/main:`);
    for (const commit of status.customCommits.slice(0, 5)) {
      console.log(`    ${c.magenta}•${c.reset} ${commit}`);
    }
    if (status.customCommits.length > 5) {
      console.log(`    ${c.dim}...and ${status.customCommits.length - 5} more${c.reset}`);
    }
  }

  // Build & App section
  console.log(`\n${c.bold}macOS Build & Installation:${c.reset}`);
  console.log(
    `  Dependencies:  ${
      status.depsInstalled
        ? `${c.green}✓ Installed${c.reset}`
        : `${c.yellow}⚠ Not installed (will run setup automatically before build)${c.reset}`
    }`
  );
  console.log(
    `  Local Bundle:  ${
      status.builtAppPath
        ? `${c.green}✓ Built${c.reset} ${c.dim}(${path.relative(REPO_ROOT, status.builtAppPath)} @ ${formatTimestamp(
            status.builtAppPath
          )})${c.reset}`
        : `${c.dim}Not built yet${c.reset}`
    }`
  );
  console.log(
    `  /Applications: ${
      status.installedExists
        ? `${c.green}✓ Installed${c.reset} ${c.dim}(${INSTALL_TARGET} @ ${formatTimestamp(INSTALL_TARGET)})${c.reset}`
        : `${c.yellow}Not installed in /Applications${c.reset}`
    }${status.running ? ` ${c.cyan}[Running]${c.reset}` : ''}`
  );
  console.log('');
}

async function promptConfirm(question, defaultYes = true) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise((resolve) => {
    rl.question(`${c.cyan}?${c.reset} ${question} ${c.dim}${suffix}${c.reset} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultYes);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

async function waitForEnter(message = 'Press Enter to return to the menu...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(`\n${c.dim}${message}${c.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

// ============================================================================
// Step 1: Sync & Rebase Fork onto upstream/main
// ============================================================================
async function syncAndRebaseFork({ interactive = true, autoPush = false } = {}) {
  console.log(`\n${c.bold}${c.cyan}━━━ Step: Sync & Rebase Fork from Upstream ━━━${c.reset}`);

  // Ensure upstream remote is configured
  const currentUpstream = runQuiet('git remote get-url upstream');
  if (!currentUpstream) {
    console.log(`${c.yellow}Adding 'upstream' remote -> ${UPSTREAM_URL}${c.reset}`);
    runStreaming('git', ['remote', 'add', 'upstream', UPSTREAM_URL]);
  } else if (currentUpstream !== UPSTREAM_URL) {
    console.log(`${c.dim}Using upstream remote: ${currentUpstream}${c.reset}`);
  }

  // Check for uncommitted changes (ignoring untracked scripts/bruno-tui.js if untracked)
  const trackedChanges = runQuiet('git status --porcelain --untracked-files=no') || '';
  let didAutostash = false;

  if (trackedChanges) {
    if (interactive) {
      const shouldStash = await promptConfirm(
        'You have uncommitted tracked changes. Stash them before rebasing and pop afterward?',
        true
      );
      if (!shouldStash) {
        console.log(`${c.yellow}Aborted rebase due to uncommitted changes.${c.reset}`);
        return false;
      }
    }
    console.log(`${c.cyan}Stashing local changes...${c.reset}`);
    runStreaming('git', ['stash', 'push', '-m', 'bruno-tui-autostash']);
    didAutostash = true;
  }

  try {
    console.log(`${c.cyan}Fetching latest commits from upstream/main...${c.reset}`);
    runStreaming('git', ['fetch', 'upstream', 'main']);

    const status = getRepoStatus();
    if (status.upstreamBehind === 0) {
      console.log(`\n${c.green}✓ Already up to date with upstream/main!${c.reset}`);
    } else {
      console.log(
        `\n${c.yellow}Rebasing ${status.upstreamAhead || 0} fork commit(s) onto upstream/main (${
          status.upstreamBehind
        } new upstream commit(s))...${c.reset}`
      );
      runStreaming('git', ['rebase', 'upstream/main']);
      console.log(`\n${c.green}✓ Successfully rebased onto upstream/main!${c.reset}`);
    }
  } catch (err) {
    console.error(`\n${c.red}✗ Rebase encountered an error or conflict:${c.reset} ${err.message}`);
    console.error(
      `${c.yellow}Tip: Resolve conflicts and run 'git rebase --continue', or abort with 'git rebase --abort'.${c.reset}`
    );
    return false;
  } finally {
    if (didAutostash) {
      console.log(`${c.cyan}Restoring stashed changes...${c.reset}`);
      try {
        runStreaming('git', ['stash', 'pop']);
      } catch {
        console.warn(`${c.yellow}⚠ Could not auto-pop stash cleanly. Your changes remain in 'git stash list'.${c.reset}`);
      }
    }
  }

  // Check if origin push is needed
  const updatedStatus = getRepoStatus();
  if (updatedStatus.originAhead > 0 || updatedStatus.originBehind > 0) {
    let shouldPush = autoPush;
    if (interactive && !autoPush) {
      shouldPush = await promptConfirm(
        `Push rebased branch '${updatedStatus.branch}' to origin with --force-with-lease?`,
        true
      );
    }
    if (shouldPush) {
      await pushForkToOrigin();
    }
  }

  return true;
}

async function pushForkToOrigin() {
  const branch = runQuiet('git rev-parse --abbrev-ref HEAD') || 'main';
  console.log(`\n${c.cyan}Pushing '${branch}' to origin (--force-with-lease)...${c.reset}`);
  runStreaming('git', ['push', '--force-with-lease', 'origin', branch]);
  console.log(`\n${c.green}✓ Pushed '${branch}' to origin!${c.reset}`);
}

// ============================================================================
// Step 2: Build Workspace Libraries + Web App + macOS Bruno.app
// ============================================================================
function installDependenciesAndPlatformPackages() {
  console.log(`\n${c.bold}${c.cyan}━━━ Installing Dependencies ━━━${c.reset}`);
  runStreaming('npm', ['i', '--legacy-peer-deps']);

  if (process.platform === 'darwin') {
    const ptyPackages = ['@lydell/node-pty-darwin-arm64@1.1.0', '@lydell/node-pty-darwin-x64@1.1.0'];
    runStreaming('npm', ['i', '--legacy-peer-deps', '--no-save', '--force', ...ptyPackages]);
  }
}

function buildWorkspaceLibraries() {
  const workspaces = [
    ['build:graphql-docs', 'Building bruno-graphql-docs'],
    ['build:bruno-query', 'Building bruno-query'],
    ['build:bruno-common', 'Building bruno-common'],
    ['build:bruno-converters', 'Building bruno-converters'],
    ['build:bruno-requests', 'Building bruno-requests'],
    ['build:schema-types', 'Building bruno-schema-types'],
    ['build:bruno-filestore', 'Building bruno-filestore'],
    ['build:bruno-io', 'Building bruno-io'],
    ['build:bruno-sqlite', 'Building bruno-sqlite']
  ];

  for (const [script, label] of workspaces) {
    console.log(`\n${c.cyan}🔨 ${label}...${c.reset}`);
    runStreaming('npm', ['run', script]);
  }

  console.log(`\n${c.cyan}🔨 Bundling JS sandbox libraries...${c.reset}`);
  runStreaming('npm', ['run', 'sandbox:bundle-libraries', '--workspace=packages/bruno-js']);
}

function prepareElectronWebAssets() {
  const outDir = path.join(ELECTRON_DIR, 'out');
  const webDir = path.join(ELECTRON_DIR, 'web');
  const distDir = path.join(APP_DIR, 'dist');

  if (!fs.existsSync(distDir)) {
    throw new Error(`Expected built web assets at ${distDir}, but directory does not exist.`);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(webDir, { recursive: true, force: true });
  fs.mkdirSync(webDir, { recursive: true });

  // Copy packages/bruno-app/dist -> packages/bruno-electron/web
  fs.cpSync(distDir, webDir, { recursive: true });

  // Rewrite /static -> ./static in HTML files
  const rootFiles = fs.readdirSync(webDir);
  for (const file of rootFiles) {
    if (file.endsWith('.html')) {
      const htmlPath = path.join(webDir, file);
      const content = fs.readFileSync(htmlPath, 'utf8').replace(/\/static/g, './static');
      fs.writeFileSync(htmlPath, content, 'utf8');
    }
  }

  // Rewrite /static/font -> ../../static/font in CSS files
  const cssDir = path.join(webDir, 'static', 'css');
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir)) {
      if (file.endsWith('.css')) {
        const cssPath = path.join(cssDir, file);
        const content = fs.readFileSync(cssPath, 'utf8').replace(/\/static\/font/g, '../../static/font');
        fs.writeFileSync(cssPath, content, 'utf8');
      }
    }
  }

  // Delete .map files recursively inside packages/bruno-electron/web
  function deleteMapsRecursively(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deleteMapsRecursively(fullPath);
      } else if (entry.name.endsWith('.map')) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
  deleteMapsRecursively(webDir);
}

async function buildMacApp({ forceSetup = false } = {}) {
  console.log(`\n${c.bold}${c.cyan}━━━ Step: Build Bruno macOS Application ━━━${c.reset}`);

  if (process.platform !== 'darwin') {
    throw new Error('macOS app packaging is only supported on macOS (darwin).');
  }

  // 1. Ensure dependencies are installed
  if (forceSetup || !hasDependenciesInstalled()) {
    installDependenciesAndPlatformPackages();
  }

  // 2. Build workspace packages
  buildWorkspaceLibraries();

  // 3. Build React frontend (packages/bruno-app)
  console.log(`\n${c.cyan}🔨 Building Bruno React UI (packages/bruno-app)...${c.reset}`);
  runStreaming('npm', ['run', 'build:web']);

  // 4. Copy & patch static web bundle into packages/bruno-electron/web
  console.log(`\n${c.cyan}📂 Preparing Electron web assets...${c.reset}`);
  prepareElectronWebAssets();

  // 5. Generate local unsigned/ad-hoc electron-builder config so it builds only
  //    the unpacked .app bundle for the host architecture without requiring
  //    Anoop's Apple Developer certificate or notarization credentials.
  const baseConfigPath = path.join(ELECTRON_DIR, 'electron-builder-config.js');
  delete require.cache[require.resolve(baseConfigPath)];
  const baseConfig = require(baseConfigPath);
  const targetArch = process.arch === 'arm64' ? 'arm64' : 'x64';

  const localBuilderConfig = {
    ...baseConfig,
    afterSign: null,
    mac: {
      ...baseConfig.mac,
      identity: null,
      notarize: false,
      hardenedRuntime: false,
      requirements: null,
      entitlements: null,
      entitlementsInherit: null,
      target: [
        {
          target: 'dir',
          arch: [targetArch]
        }
      ]
    }
  };

  const tmpConfigPath = path.join(os.tmpdir(), `bruno-electron-builder-local-${process.pid}.json`);
  fs.writeFileSync(tmpConfigPath, JSON.stringify(localBuilderConfig, null, 2), 'utf8');

  try {
    console.log(`\n${c.cyan}📦 Packaging Bruno.app (${targetArch}) via electron-builder...${c.reset}`);
    const archFlag = targetArch === 'arm64' ? '--arm64' : '--x64';
    runStreaming('npx', ['electron-builder', '--mac', '--dir', archFlag, '--config', tmpConfigPath], {
      cwd: ELECTRON_DIR,
      env: {
        CSC_IDENTITY_AUTO_DISCOVERY: 'false'
      }
    });
  } finally {
    fs.rmSync(tmpConfigPath, { force: true });
  }

  const builtApp = findBuiltAppBundle();
  if (!builtApp) {
    throw new Error('Build completed, but Bruno.app could not be found in packages/bruno-electron/out.');
  }

  // Ad-hoc sign and strip quarantine attributes so macOS launches cleanly
  console.log(`\n${c.cyan}🔏 Applying ad-hoc signature to ${path.relative(REPO_ROOT, builtApp)}...${c.reset}`);
  runStreaming('codesign', ['--force', '--deep', '--sign', '-', builtApp]);
  runQuiet(`xattr -cr "${builtApp}"`);

  console.log(`\n${c.green}✓ Built macOS app bundle at: ${c.bold}${builtApp}${c.reset}`);
  return builtApp;
}

// ============================================================================
// Step 3: Install Bruno.app into /Applications
// ============================================================================
async function installToApplications({ interactive = true } = {}) {
  console.log(`\n${c.bold}${c.cyan}━━━ Step: Install Bruno.app to /Applications ━━━${c.reset}`);

  let builtApp = findBuiltAppBundle();
  if (!builtApp) {
    if (interactive) {
      const shouldBuildNow = await promptConfirm(
        'No built Bruno.app found in packages/bruno-electron/out. Build it now?',
        true
      );
      if (!shouldBuildNow) {
        return false;
      }
      builtApp = await buildMacApp();
    } else {
      throw new Error('No built Bruno.app found in packages/bruno-electron/out. Run with --build first.');
    }
  }

  // Check if Bruno is currently running
  if (isBrunoRunning()) {
    let shouldQuit = true;
    if (interactive) {
      shouldQuit = await promptConfirm('Bruno is currently running. Quit Bruno before replacing /Applications/Bruno.app?', true);
    }
    if (shouldQuit) {
      console.log(`${c.cyan}Stopping running Bruno instance...${c.reset}`);
      runQuiet('osascript -e \'tell application "Bruno" to quit\'');
      // Wait briefly for graceful shutdown, then fallback to killall if still running
      execSync('sleep 1');
      if (isBrunoRunning()) {
        runQuiet('killall Bruno');
      }
    }
  }

  if (fs.existsSync(INSTALL_TARGET)) {
    console.log(`${c.cyan}Removing existing ${INSTALL_TARGET}...${c.reset}`);
    fs.rmSync(INSTALL_TARGET, { recursive: true, force: true });
  }

  console.log(`${c.cyan}Copying ${path.relative(REPO_ROOT, builtApp)} -> ${INSTALL_TARGET}...${c.reset}`);
  // ditto preserves macOS bundle structure, symlinks, and permissions accurately
  runStreaming('ditto', [builtApp, INSTALL_TARGET]);
  runQuiet(`xattr -cr "${INSTALL_TARGET}"`);

  console.log(`\n${c.green}✓ Successfully installed Bruno to ${c.bold}${INSTALL_TARGET}${c.reset}!`);

  if (interactive) {
    const shouldLaunch = await promptConfirm('Launch Bruno now?', true);
    if (shouldLaunch) {
      runStreaming('open', ['-a', INSTALL_TARGET]);
    }
  }

  return true;
}

// ============================================================================
// Step 4: Export & Apply Git Patches for Team Sharing
// ============================================================================
async function promptInput(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const suffix = defaultValue ? `${c.dim}(default: ${defaultValue})${c.reset} ` : '';
  return new Promise((resolve) => {
    rl.question(`${c.cyan}?${c.reset} ${question} ${suffix}`, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue);
    });
  });
}

async function exportGitPatch({ outputFile = 'bruno-git-ui.patch', interactive = true } = {}) {
  console.log(`\n${c.bold}${c.cyan}━━━ Step: Export Git Patch for Team ━━━${c.reset}`);

  const hasUpstream = Boolean(runQuiet('git rev-parse --verify upstream/main'));
  if (!hasUpstream) {
    console.log(`${c.cyan}Fetching upstream/main first...${c.reset}`);
    runStreaming('git', ['fetch', 'upstream', 'main']);
  }

  let targetFile = outputFile;
  if (interactive) {
    targetFile = await promptInput('Output patch file path:', outputFile);
  }

  const resolvedPath = path.resolve(REPO_ROOT, targetFile);
  const patchContent = execSync('git format-patch upstream/main..HEAD --stdout', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });

  if (!patchContent.trim()) {
    console.log(`${c.yellow}⚠ No custom commits found between upstream/main and HEAD.${c.reset}`);
    return null;
  }

  fs.writeFileSync(resolvedPath, patchContent, 'utf8');
  const sizeKb = (Buffer.byteLength(patchContent, 'utf8') / 1024).toFixed(1);

  console.log(`\n${c.green}✓ Exported Git patch (${sizeKb} KB) to:${c.reset} ${c.bold}${resolvedPath}${c.reset}`);
  console.log(`\n${c.bold}How your team can apply this patch:${c.reset}`);
  console.log(`  ${c.cyan}git am -3 < ${path.basename(resolvedPath)}${c.reset}    ${c.dim}# Apply commits with 3-way merge${c.reset}`);
  console.log(`  ${c.cyan}git apply -3 ${path.basename(resolvedPath)}${c.reset}   ${c.dim}# Or apply as working-tree changes only${c.reset}`);
  return resolvedPath;
}

async function applyGitPatch({ patchFile = '', interactive = true } = {}) {
  console.log(`\n${c.bold}${c.cyan}━━━ Step: Apply Git Patch File ━━━${c.reset}`);

  let targetFile = patchFile;
  if (interactive && !targetFile) {
    targetFile = await promptInput('Path to .patch file to apply:', 'bruno-git-ui.patch');
  }

  const resolvedPath = path.resolve(REPO_ROOT, targetFile);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Patch file not found: ${resolvedPath}`);
  }

  console.log(`${c.cyan}Applying patch ${resolvedPath} with 3-way merge (git am -3)...${c.reset}`);
  runStreaming('git', ['am', '-3', resolvedPath]);
  console.log(`\n${c.green}✓ Successfully applied patch: ${c.bold}${resolvedPath}${c.reset}`);
  return true;
}

// ============================================================================
// Interactive TUI Menu
// ============================================================================
const MENU_ITEMS = [
  {
    key: '1',
    label: '🚀 Full Pipeline: Rebase Fork + Build + Install to /Applications',
    action: async () => {
      const ok = await syncAndRebaseFork({ interactive: true });
      if (!ok) return;
      await buildMacApp();
      await installToApplications({ interactive: true });
    }
  },
  {
    key: '2',
    label: '🔄 Sync & Rebase Fork onto upstream/main (usebruno/bruno)',
    action: async () => {
      await syncAndRebaseFork({ interactive: true });
    }
  },
  {
    key: '3',
    label: '📤 Push Rebased Fork to Origin (git push --force-with-lease)',
    action: async () => {
      await pushForkToOrigin();
    }
  },
  {
    key: '4',
    label: '🔨 Build macOS App Bundle (packages/bruno-electron -> Bruno.app)',
    action: async () => {
      await buildMacApp({ forceSetup: false });
    }
  },
  {
    key: '5',
    label: '📲 Install Built Bruno.app into /Applications/Bruno.app',
    action: async () => {
      await installToApplications({ interactive: true });
    }
  },
  {
    key: '6',
    label: '📦 Clean Setup: Reinstall Dependencies & Rebuild Libraries',
    action: async () => {
      installDependenciesAndPlatformPackages();
      buildWorkspaceLibraries();
      console.log(`\n${c.green}✓ Dependencies and workspace libraries built!${c.reset}`);
    }
  },
  {
    key: '7',
    label: '🩹 Export Git Patch for Team (upstream/main..HEAD -> .patch)',
    action: async () => {
      await exportGitPatch({ interactive: true });
    }
  },
  {
    key: '8',
    label: '📥 Apply a Git Patch File (git am -3)',
    action: async () => {
      await applyGitPatch({ interactive: true });
    }
  },
  {
    key: 'r',
    label: '🔍 Fetch Upstream & Refresh Status',
    action: async () => {
      console.log(`\n${c.cyan}Fetching upstream/main...${c.reset}`);
      runStreaming('git', ['fetch', 'upstream', 'main']);
    }
  },
  {
    key: 'q',
    label: '👋 Quit',
    action: async () => {
      process.exit(0);
    }
  }
];

async function selectMenuItemInteractive(selectedIndex = 0) {
  return new Promise((resolve) => {
    let idx = selectedIndex;

    function render() {
      console.clear();
      const status = getRepoStatus();
      printStatusBanner(status);

      console.log(`${c.bold}Select an action:${c.reset} ${c.dim}(Use ↑/↓ arrows or number keys, Enter to run, q to quit)${c.reset}\n`);
      MENU_ITEMS.forEach((item, i) => {
        const isSelected = i === idx;
        if (isSelected) {
          console.log(`  ${c.bgCyan}${c.black}${c.bold} ❯ [${item.key}] ${item.label} ${c.reset}`);
        } else {
          console.log(`    ${c.dim}[${item.key}]${c.reset} ${item.label}`);
        }
      });
      console.log('');
    }

    render();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    }

    function onKeypress(str, key) {
      if (!key) return;

      if ((key.ctrl && key.name === 'c') || key.name === 'escape' || str === 'q') {
        cleanup();
        resolve({ item: MENU_ITEMS[MENU_ITEMS.length - 1], idx });
        return;
      }

      if (key.name === 'up' || str === 'k') {
        idx = (idx - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
        render();
        return;
      }

      if (key.name === 'down' || str === 'j') {
        idx = (idx + 1) % MENU_ITEMS.length;
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve({ item: MENU_ITEMS[idx], idx });
        return;
      }

      // Direct shortcut key match (1-6, r, q)
      const directIndex = MENU_ITEMS.findIndex((item) => item.key === str);
      if (directIndex !== -1) {
        idx = directIndex;
        render();
        cleanup();
        resolve({ item: MENU_ITEMS[directIndex], idx });
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

async function runInteractiveLoop() {
  let selectedIdx = 0;
  while (true) {
    const { item, idx } = await selectMenuItemInteractive(selectedIdx);
    selectedIdx = idx;

    if (item.key === 'q') {
      console.log(`${c.dim}Bye!${c.reset}`);
      process.exit(0);
    }

    try {
      await item.action();
    } catch (err) {
      console.error(`\n${c.red}✗ Error:${c.reset} ${err.message}`);
    }

    await waitForEnter();
  }
}

function printHelp() {
  console.log(`
${c.bold}Bruno Fork & macOS App Manager${c.reset}

Usage:
  ./scripts/bruno-tui.js [options]

Options:
  (no args)              Launch interactive TUI menu
  --status               Show Git fork & macOS app build status
  --rebase               Fetch upstream/main and rebase current branch
  --push                 Push current branch to origin with --force-with-lease
  --setup                Install npm dependencies and build workspace packages
  --build                Build workspace libraries, React app, and macOS Bruno.app
  --install              Copy built Bruno.app into /Applications/Bruno.app
  --patch [file]         Export commits since upstream/main to a .patch file (default: bruno-git-ui.patch)
  --apply-patch <file>   Apply a .patch file using git am -3
  --all                  Run --rebase, --build, and --install in sequence
  --help, -h             Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.length === 0) {
    await runInteractiveLoop();
    return;
  }

  if (args.includes('--status')) {
    printStatusBanner(getRepoStatus());
  }

  const patchIdx = args.indexOf('--patch');
  if (patchIdx !== -1) {
    const nextArg = args[patchIdx + 1];
    const outFile = nextArg && !nextArg.startsWith('--') ? nextArg : 'bruno-git-ui.patch';
    await exportGitPatch({ outputFile: outFile, interactive: false });
  }

  const applyIdx = args.indexOf('--apply-patch');
  if (applyIdx !== -1) {
    const nextArg = args[applyIdx + 1];
    if (!nextArg || nextArg.startsWith('--')) {
      throw new Error('Please specify a patch file path after --apply-patch');
    }
    await applyGitPatch({ patchFile: nextArg, interactive: false });
  }

  if (args.includes('--all')) {
    const ok = await syncAndRebaseFork({ interactive: false, autoPush: args.includes('--push') });
    if (!ok) process.exit(1);
    await buildMacApp();
    await installToApplications({ interactive: false });
    return;
  }

  if (args.includes('--rebase')) {
    const ok = await syncAndRebaseFork({ interactive: false, autoPush: args.includes('--push') });
    if (!ok) process.exit(1);
  } else if (args.includes('--push')) {
    await pushForkToOrigin();
  }

  if (args.includes('--setup')) {
    installDependenciesAndPlatformPackages();
    buildWorkspaceLibraries();
  }

  if (args.includes('--build')) {
    await buildMacApp({ forceSetup: args.includes('--setup') });
  }

  if (args.includes('--install')) {
    await installToApplications({ interactive: false });
  }
}

main().catch((err) => {
  console.error(`\n${c.red}✗ Fatal error:${c.reset} ${err.message}`);
  process.exit(1);
});
