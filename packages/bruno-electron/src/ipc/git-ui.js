const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const simpleGit = require('simple-git');
const { ipcMain } = require('electron');
const {
  getCollectionGitRootPath,
  initGit,
  getCollectionGitData,
  getCollectionGitBranches,
  getCurrentGitBranch,
  getDefaultGitBranch,
  getCollectionGitRepoUrl,
  getChangedFilesInCollectionGit,
  getAheadBehindCount,
  fetchRemotes,
  listStashes,
  stageChanges,
  unstageChanges,
  discardChanges,
  commitChanges,
  pushGitChanges,
  pullGitChanges,
  fetchChanges,
  checkoutGitBranch,
  checkoutRemoteGitBranch,
  fetchRemoteBranches,
  addRemote,
  removeRemote,
  getStagedFileDiff,
  getUnstagedFileDiff,
  getRenamedFileDiff,
  getWorkingFileContentForVisualDiff,
  createStash,
  applyStash,
  dropStash,
  getStashFiles,
  getStashFileDiff,
  getStashFileContentForVisualDiff,
  getCollectionGitLogs,
  getCommitFiles,
  getCommitFileDiff,
  getFileContentForVisualDiff
} = require('../utils/git');

const findCleanGitRootPath = (dirPath) => {
  if (!dirPath) return null;
  try {
    const resolved = path.resolve(dirPath);
    if (fs.existsSync(path.join(resolved, '.git'))) {
      return resolved;
    }
    const parent = path.dirname(resolved);
    if (parent === resolved) {
      return null;
    }
    return findCleanGitRootPath(parent);
  } catch {
    return null;
  }
};

const resolveGitRootPath = async (collectionPath) => {
  if (!collectionPath) return null;
  const direct = findCleanGitRootPath(collectionPath);
  if (direct) return direct;
  const fallback = await Promise.resolve(getCollectionGitRootPath?.(collectionPath)).catch(() => null);
  if (!fallback) return null;
  return fallback.replace(/[\\/]+$/, '');
};

const resolveGitMetadataPath = async (gitRootPath, relName) => {
  try {
    const raw = await simpleGit({ baseDir: gitRootPath }).revparse(['--git-path', relName]);
    const trimmed = String(raw || '').trim();
    if (trimmed) {
      return path.isAbsolute(trimmed) ? trimmed : path.resolve(gitRootPath, trimmed);
    }
  } catch {
    // Fall back to standard .git directory path
  }
  return path.join(gitRootPath, '.git', relName);
};

const isWithinRoot = (targetPath, rootPath) =>
  targetPath === rootPath || targetPath.startsWith(rootPath + path.sep);

const resolveCanonicalWithMissingTail = (targetPath) => {
  let current = path.resolve(targetPath);
  const missingSegments = [];

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(targetPath);
    }
    missingSegments.unshift(path.basename(current));
    current = parent;
  }

  const canonicalExisting = fs.realpathSync(current);
  return missingSegments.length > 0
    ? path.join(canonicalExisting, ...missingSegments)
    : canonicalExisting;
};

const resolvePathInGitRoot = (gitRootPath, filePath) => {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('File path is required');
  }
  const resolvedRoot = path.resolve(gitRootPath);
  const resolvedFile = path.resolve(gitRootPath, filePath);
  if (!isWithinRoot(resolvedFile, resolvedRoot)) {
    throw new Error('File path must be inside the Git repository');
  }

  if (fs.existsSync(resolvedRoot)) {
    const canonicalRoot = fs.realpathSync(resolvedRoot);
    const canonicalFile = resolveCanonicalWithMissingTail(resolvedFile);
    if (!isWithinRoot(canonicalFile, canonicalRoot)) {
      throw new Error('File path resolves outside the Git repository');
    }
  }

  return resolvedFile;
};

const toFullPaths = (gitRootPath, files = []) =>
  files.map((filePath) => resolvePathInGitRoot(gitRootPath, filePath));

const toRelativeGitPath = (gitRootPath, filePath) => {
  const fullPath = resolvePathInGitRoot(gitRootPath, filePath);
  const rel = path.relative(path.resolve(gitRootPath), fullPath);
  return rel.replace(/\\/g, '/');
};

const assertSafeGitRef = (value, label = 'Git reference') => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (trimmed.startsWith('-')) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
};

const assertValidStashIndex = (stashIndex) => {
  const parsed = typeof stashIndex === 'number' ? stashIndex : Number(stashIndex);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Valid non-negative stash index is required');
  }
  return parsed;
};

const getConflictedFileContent = async (gitRootPath, filePath) => {
  const fullFilePath = resolvePathInGitRoot(gitRootPath, filePath);
  const content = await fs.promises.readFile(fullFilePath, 'utf8');
  return {
    path: filePath,
    content
  };
};

const resolveConflictedFile = async (gitRootPath, filePath, content, shouldStage = true) => {
  const fullFilePath = resolvePathInGitRoot(gitRootPath, filePath);
  await fs.promises.mkdir(path.dirname(fullFilePath), { recursive: true });
  await fs.promises.writeFile(fullFilePath, content, 'utf8');
  if (shouldStage) {
    await stageChanges(gitRootPath, [fullFilePath]);
  }
  return { path: filePath };
};

const getResilientCollectionGitData = async (gitRootPath, collectionPath) => {
  try {
    const data = await getCollectionGitData(gitRootPath, collectionPath);
    if (data && Object.keys(data).length > 0) {
      return data;
    }
  } catch {
    // Fallback for newly initialized repos with no commits or no origin remote
  }

  const [branches, currentGitBranch, defaultGitBranch, gitRepoUrl] = await Promise.all([
    Promise.resolve(getCollectionGitBranches?.(gitRootPath)).catch(() => []),
    Promise.resolve(getCurrentGitBranch?.(gitRootPath)).catch(() => null),
    Promise.resolve(getDefaultGitBranch?.(gitRootPath)).catch(() => 'main'),
    Promise.resolve(getCollectionGitRepoUrl?.(gitRootPath)).catch(() => '')
  ]);

  const logs = branches?.length ? await Promise.resolve(getCollectionGitLogs?.(gitRootPath)).catch(() => []) : [];

  return {
    gitRootPath,
    gitRepoUrl: gitRepoUrl || '',
    branches: branches || [],
    currentGitBranch: currentGitBranch || defaultGitBranch || 'main',
    defaultGitBranch: defaultGitBranch || 'main',
    logs: logs || []
  };
};

const buildCollectionGitState = async (collectionPath) => {
  if (!collectionPath) {
    return { isGitRepo: false, gitRootPath: null };
  }

  const gitRootPath = await resolveGitRootPath(collectionPath);
  if (!gitRootPath) {
    return { isGitRepo: false, gitRootPath: null };
  }

  let statusError = null;
  const [gitData, changedFiles, aheadBehind, remotes, stashes, mergeHeadPath, mergeMsgPath] = await Promise.all([
    getResilientCollectionGitData(gitRootPath, collectionPath),
    Promise.resolve(getChangedFilesInCollectionGit(gitRootPath, collectionPath)).catch((err) => {
      statusError = err?.message || 'Failed to read Git status';
      return {
        staged: [],
        unstaged: [],
        conflicted: [],
        totalFiles: 0,
        tooManyFiles: false
      };
    }),
    Promise.resolve(getAheadBehindCount(gitRootPath)).catch(() => ({
      ahead: 0,
      behind: 0,
      aheadCommits: [],
      behindCommits: []
    })),
    Promise.resolve(fetchRemotes(gitRootPath)).catch(() => []),
    Promise.resolve(listStashes(gitRootPath)).catch(() => []),
    resolveGitMetadataPath(gitRootPath, 'MERGE_HEAD'),
    resolveGitMetadataPath(gitRootPath, 'MERGE_MSG')
  ]);

  const isMerging = fs.existsSync(mergeHeadPath);
  let mergeMessage = '';
  if (isMerging && fs.existsSync(mergeMsgPath)) {
    try {
      mergeMessage = fs.readFileSync(mergeMsgPath, 'utf8').trim();
    } catch {
      mergeMessage = '';
    }
  }

  const normalizedConflicted = (changedFiles?.conflicted || []).map((item) =>
    typeof item === 'string' ? item : item.path
  );
  const normalizedStaged = (changedFiles?.staged || []).map((item) => ({
    ...item,
    index: item.index || item.fileIndex || 'M'
  }));
  const normalizedUnstaged = (changedFiles?.unstaged || []).map((item) => ({
    ...item,
    index: item.index || item.fileIndex || ' '
  }));

  const branches = gitData?.branches || gitData?.localBranches || [];
  const currentGitBranch = gitData?.currentGitBranch || gitData?.gitBranch || 'main';
  const logs = Array.isArray(gitData?.logs) ? gitData.logs : gitData?.logs?.latestLogs || [];

  return {
    isGitRepo: true,
    ...gitData,
    gitRootPath,
    currentGitBranch,
    localGitBranches: branches,
    branches,
    remoteUrl: gitData?.gitRepoUrl || gitData?.remoteUrl || '',
    ahead: aheadBehind?.ahead ?? gitData?.ahead ?? 0,
    behind: aheadBehind?.behind ?? gitData?.behind ?? 0,
    aheadBehind,
    files: {
      staged: normalizedStaged,
      unstaged: normalizedUnstaged,
      conflicted: normalizedConflicted
    },
    changedFiles,
    statusError,
    remotes: remotes || [],
    stashes: stashes || [],
    logs,
    isMerging,
    mergeMessage
  };
};

const registerGitUiIpc = (mainWindow) => {
  ipcMain.handle('renderer:git-get-collection-data', async (event, collectionPath) => {
    return buildCollectionGitState(collectionPath);
  });

  ipcMain.handle('renderer:git-init', async (event, collectionPath) => {
    if (!collectionPath) {
      throw new Error('Collection path is required');
    }
    await initGit(collectionPath);
    return buildCollectionGitState(collectionPath);
  });

  ipcMain.handle('renderer:git-stage-changes', async (event, { gitRootPath, files }) => {
    if (!Array.isArray(files) || files.length === 0) return true;
    const fullPaths = toFullPaths(gitRootPath, files);
    await stageChanges(gitRootPath, fullPaths);
    return true;
  });

  ipcMain.handle('renderer:git-unstage-changes', async (event, { gitRootPath, files }) => {
    if (!Array.isArray(files) || files.length === 0) return true;
    const fullPaths = toFullPaths(gitRootPath, files);
    try {
      await unstageChanges(gitRootPath, fullPaths);
    } catch {
      const git = simpleGit({ baseDir: gitRootPath });
      await git
        .reset(['HEAD', '--', ...fullPaths])
        .catch(() => git.raw(['rm', '--cached', '-r', '--', ...fullPaths]));
    }
    return true;
  });

  ipcMain.handle('renderer:git-discard-changes', async (event, { gitRootPath, files }) => {
    if (!Array.isArray(files) || files.length === 0) {
      return { trackedFilesDiscarded: 0, untrackedFilesDeleted: 0 };
    }
    const fullPaths = toFullPaths(gitRootPath, files);
    return discardChanges(gitRootPath, fullPaths);
  });

  ipcMain.handle('renderer:git-commit-changes', async (event, { gitRootPath, message }) => {
    if (!message || !message.trim()) {
      throw new Error('Commit message is required');
    }
    return commitChanges(gitRootPath, message.trim());
  });

  ipcMain.handle('renderer:git-push', async (event, { gitRootPath, processUid, remote = 'origin', remoteBranch }) => {
    const safeRemote = assertSafeGitRef(remote, 'Remote name');
    const safeBranch = assertSafeGitRef(remoteBranch, 'Branch name');
    return pushGitChanges(mainWindow, { gitRootPath, processUid, remote: safeRemote, remoteBranch: safeBranch });
  });

  ipcMain.handle(
    'renderer:git-pull',
    async (event, { gitRootPath, processUid, remote = 'origin', remoteBranch, strategy = '--no-rebase' }) => {
      const safeRemote = assertSafeGitRef(remote, 'Remote name');
      const safeBranch = assertSafeGitRef(remoteBranch, 'Branch name');
      return pullGitChanges(mainWindow, {
        gitRootPath,
        processUid,
        remote: safeRemote,
        remoteBranch: safeBranch,
        strategy
      });
    }
  );

  ipcMain.handle('renderer:git-fetch', async (event, { gitRootPath, remote = 'origin' }) => {
    const safeRemote = assertSafeGitRef(remote, 'Remote name');
    return fetchChanges(gitRootPath, safeRemote);
  });

  ipcMain.handle(
    'renderer:git-checkout-branch',
    async (event, { gitRootPath, branchName, processUid, shouldCreate = false }) => {
      const trimmedBranch = assertSafeGitRef(branchName, 'Branch name');
      return checkoutGitBranch(mainWindow, {
        gitRootPath,
        branchName: trimmedBranch,
        processUid,
        shouldCreate: Boolean(shouldCreate)
      });
    }
  );

  ipcMain.handle(
    'renderer:git-checkout-remote-branch',
    async (event, { gitRootPath, remoteName = 'origin', branchName, processUid }) => {
      const safeRemote = assertSafeGitRef(remoteName, 'Remote name');
      const safeBranch = assertSafeGitRef(branchName, 'Branch name');
      return checkoutRemoteGitBranch(mainWindow, {
        gitRootPath,
        remoteName: safeRemote,
        branchName: safeBranch,
        processUid
      });
    }
  );

  ipcMain.handle('renderer:git-fetch-remote-branches', async (event, { gitRootPath, remote = 'origin' }) => {
    const safeRemote = assertSafeGitRef(remote, 'Remote name');
    const list = await fetchRemoteBranches({ gitRootPath, remote: safeRemote });
    return (list || [])
      .map((b) => String(b).trim())
      .filter((b) => b && !b.includes('->') && b !== 'HEAD');
  });

  ipcMain.handle('renderer:git-get-remotes', async (event, { gitRootPath }) => {
    return fetchRemotes(gitRootPath);
  });

  ipcMain.handle('renderer:git-add-remote', async (event, { gitRootPath, remoteName = 'origin', remoteUrl }) => {
    const trimmedName = assertSafeGitRef(remoteName, 'Remote name');
    const trimmedUrl = assertSafeGitRef(remoteUrl, 'Remote URL');
    const existing = await Promise.resolve(fetchRemotes(gitRootPath)).catch(() => []);
    if (existing.some((r) => r.name === trimmedName)) {
      await simpleGit({ baseDir: gitRootPath }).remote(['set-url', trimmedName, trimmedUrl]);
      return fetchRemotes(gitRootPath);
    }
    return addRemote({ gitRootPath, remoteName: trimmedName, remoteUrl: trimmedUrl });
  });

  ipcMain.handle('renderer:git-remove-remote', async (event, { gitRootPath, remoteName }) => {
    const safeRemote = assertSafeGitRef(remoteName, 'Remote name');
    return removeRemote({ gitRootPath, remoteName: safeRemote });
  });

  ipcMain.handle('renderer:git-get-file-diff', async (event, { gitRootPath, filePath, type = 'unstaged', from, to }) => {
    const relativePath = toRelativeGitPath(gitRootPath, filePath);
    const fullPath = path.join(gitRootPath, relativePath);

    let textDiff = '';
    if ((type === 'renamed' || type === 'staged') && from && to) {
      const safeFrom = toRelativeGitPath(gitRootPath, from);
      const safeTo = toRelativeGitPath(gitRootPath, to);
      textDiff = await getRenamedFileDiff(gitRootPath, { from: safeFrom, to: safeTo }).catch(() => '');
    } else if (type === 'staged') {
      textDiff = await getStagedFileDiff(gitRootPath, fullPath).catch(() => '');
    } else {
      textDiff = await getUnstagedFileDiff(gitRootPath, fullPath).catch(() => '');
    }

    const diffType = type === 'staged' || type === 'renamed' ? 'staged' : 'unstaged';
    const visualDiff = await getWorkingFileContentForVisualDiff(gitRootPath, relativePath, diffType).catch(() => null);

    return {
      textDiff,
      visualDiff
    };
  });

  ipcMain.handle('renderer:git-create-stash', async (event, { gitRootPath, message = '' }) => {
    const stashMessage = message.trim() || `Stash on ${new Date().toLocaleString()}`;
    return createStash(gitRootPath, stashMessage);
  });

  ipcMain.handle('renderer:git-list-stashes', async (event, { gitRootPath }) => {
    return listStashes(gitRootPath);
  });

  ipcMain.handle('renderer:git-apply-stash', async (event, { gitRootPath, stashIndex, dropAfterApply = false }) => {
    const safeIdx = assertValidStashIndex(stashIndex);
    await applyStash(gitRootPath, safeIdx);
    if (dropAfterApply) {
      await dropStash(gitRootPath, safeIdx);
    }
    return true;
  });

  ipcMain.handle('renderer:git-drop-stash', async (event, { gitRootPath, stashIndex }) => {
    const safeIdx = assertValidStashIndex(stashIndex);
    return dropStash(gitRootPath, safeIdx);
  });

  ipcMain.handle('renderer:git-get-stash-files', async (event, { gitRootPath, stashIndex }) => {
    const safeIdx = assertValidStashIndex(stashIndex);
    return getStashFiles(gitRootPath, safeIdx);
  });

  ipcMain.handle(
    'renderer:git-get-stash-file-diff',
    async (event, { gitRootPath, stashIndex, filePath, isUntracked = false }) => {
      const safeIdx = assertValidStashIndex(stashIndex);
      const relativePath = toRelativeGitPath(gitRootPath, filePath);
      const [textDiff, visualDiff] = await Promise.all([
        getStashFileDiff(gitRootPath, safeIdx, relativePath, isUntracked).catch(() => ''),
        getStashFileContentForVisualDiff(gitRootPath, safeIdx, relativePath, isUntracked).catch(() => null)
      ]);
      return { textDiff, visualDiff };
    }
  );

  ipcMain.handle('renderer:git-get-logs', async (event, { gitRootPath }) => {
    return getCollectionGitLogs(gitRootPath);
  });

  ipcMain.handle('renderer:git-get-commit-files', async (event, { gitRootPath, commitHash }) => {
    const safeHash = assertSafeGitRef(commitHash, 'Commit hash');
    const res = await getCommitFiles(gitRootPath, safeHash);
    const files = Array.isArray(res) ? res : res?.files || [];
    return { files };
  });

  ipcMain.handle('renderer:git-get-commit-file-diff', async (event, { gitRootPath, commitHash, filePath }) => {
    const safeHash = assertSafeGitRef(commitHash, 'Commit hash');
    const relativePath = toRelativeGitPath(gitRootPath, filePath);
    const [textDiff, visualDiff] = await Promise.all([
      getCommitFileDiff(gitRootPath, safeHash, relativePath).catch(() => ''),
      getFileContentForVisualDiff(gitRootPath, safeHash, relativePath).catch(() => null)
    ]);
    return { textDiff, visualDiff };
  });

  ipcMain.handle('renderer:git-get-conflicted-file', async (event, { gitRootPath, filePath }) => {
    const relativePath = toRelativeGitPath(gitRootPath, filePath);
    return getConflictedFileContent(gitRootPath, relativePath);
  });

  ipcMain.handle(
    'renderer:git-resolve-conflict-file',
    async (event, { gitRootPath, filePath, content, stage = true }) => {
      const relativePath = toRelativeGitPath(gitRootPath, filePath);
      return resolveConflictedFile(gitRootPath, relativePath, content, stage);
    }
  );

  ipcMain.handle('renderer:git-continue-merge', async (event, { gitRootPath, conflictedFiles = [], commitMessage }) => {
    const [mergeHeadPath, mergeMsgPath] = await Promise.all([
      resolveGitMetadataPath(gitRootPath, 'MERGE_HEAD'),
      resolveGitMetadataPath(gitRootPath, 'MERGE_MSG')
    ]);
    const hasMergeHead = fs.existsSync(mergeHeadPath);
    if (hasMergeHead) {
      if (Array.isArray(conflictedFiles) && conflictedFiles.length > 0) {
        for (const file of conflictedFiles) {
          await resolveConflictedFile(gitRootPath, file.path, file.content, true);
        }
      }
      if (commitMessage && commitMessage.trim()) {
        await fs.promises.writeFile(mergeMsgPath, commitMessage.trim(), 'utf8');
      }
      return new Promise((resolve, reject) => {
        exec('git -c core.editor=: merge --continue', { cwd: gitRootPath }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
    }
    if (commitMessage && commitMessage.trim()) {
      return commitChanges(gitRootPath, commitMessage.trim());
    }
    return 'Conflicts resolved';
  });

  ipcMain.handle('renderer:git-abort-merge', async (event, { gitRootPath }) => {
    const mergeHeadPath = await resolveGitMetadataPath(gitRootPath, 'MERGE_HEAD');
    const hasMergeHead = fs.existsSync(mergeHeadPath);
    if (hasMergeHead) {
      return new Promise((resolve, reject) => {
        exec('git merge --abort', { cwd: gitRootPath }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
    }
    return new Promise((resolve, reject) => {
      exec('git reset --merge', { cwd: gitRootPath }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  });
};

module.exports = {
  registerGitUiIpc,
  buildCollectionGitState,
  getConflictedFileContent,
  resolveConflictedFile,
  resolvePathInGitRoot
};
