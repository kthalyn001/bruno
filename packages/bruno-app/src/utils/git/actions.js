import { findCollectionByUid } from 'utils/collections';
import { uuid } from 'utils/common';
import { updateCollectionGitData } from 'providers/ReduxStore/slices/collections';
import { removeGitOperationProgress } from 'providers/ReduxStore/slices/app';

const getCollectionAndGitRoot = (getState, collectionUid) => {
  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  if (!collection) {
    throw new Error('Collection not found');
  }
  const gitRootPath = collection.git?.gitRootPath || collection.pathname;
  return { collection, gitRootPath };
};

export const refreshCollectionGitData = (collectionUid) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  if (!ipcRenderer) return null;

  const state = getState();
  const collection = findCollectionByUid(state.collections.collections, collectionUid);
  if (!collection || !collection.pathname) return null;

  try {
    const gitData = await ipcRenderer.invoke('renderer:git-get-collection-data', collection.pathname);
    if (gitData) {
      dispatch(updateCollectionGitData({ collectionUid, gitData }));
    }
    return gitData;
  } catch (error) {
    console.error('Failed to refresh collection git data:', error);
    return null;
  }
};

export const initCollectionGit = (collectionUid) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { collection } = getCollectionAndGitRoot(getState, collectionUid);
  const gitData = await ipcRenderer.invoke('renderer:git-init', collection.pathname);
  if (gitData) {
    dispatch(updateCollectionGitData({ collectionUid, gitData }));
  }
  return gitData;
};

export const stageGitChanges = (collectionUid, files) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  await ipcRenderer.invoke('renderer:git-stage-changes', { gitRootPath, files });
  return dispatch(refreshCollectionGitData(collectionUid));
};

export const unstageGitChanges = (collectionUid, files) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  await ipcRenderer.invoke('renderer:git-unstage-changes', { gitRootPath, files });
  return dispatch(refreshCollectionGitData(collectionUid));
};

export const discardGitChanges = (collectionUid, files) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  await ipcRenderer.invoke('renderer:git-discard-changes', { gitRootPath, files });
  return dispatch(refreshCollectionGitData(collectionUid));
};

export const commitGitChanges = (collectionUid, message) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-commit-changes', { gitRootPath, message });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const pushCollectionGit = (collectionUid, { remote = 'origin', remoteBranch } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { collection, gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const branch = remoteBranch || collection.git?.currentGitBranch || 'main';
  const processUid = uuid();

  try {
    const result = await ipcRenderer.invoke('renderer:git-push', {
      gitRootPath,
      processUid,
      remote,
      remoteBranch: branch
    });
    await dispatch(refreshCollectionGitData(collectionUid));
    return result;
  } finally {
    dispatch(removeGitOperationProgress(processUid));
  }
};

export const pullCollectionGit = (collectionUid, { remote = 'origin', remoteBranch, strategy = '--no-rebase' } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { collection, gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const branch = remoteBranch || collection.git?.currentGitBranch || 'main';
  const processUid = uuid();

  try {
    const result = await ipcRenderer.invoke('renderer:git-pull', {
      gitRootPath,
      processUid,
      remote,
      remoteBranch: branch,
      strategy
    });
    await dispatch(refreshCollectionGitData(collectionUid));
    return result;
  } catch (error) {
    // Even if pull fails (e.g., due to merge conflicts), refresh git state so conflicts appear in UI
    await dispatch(refreshCollectionGitData(collectionUid));
    throw error;
  } finally {
    dispatch(removeGitOperationProgress(processUid));
  }
};

export const fetchCollectionGit = (collectionUid, { remote = 'origin' } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-fetch', { gitRootPath, remote });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const checkoutCollectionGitBranch = (collectionUid, { branchName, shouldCreate = false }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const processUid = uuid();

  try {
    const result = await ipcRenderer.invoke('renderer:git-checkout-branch', {
      gitRootPath,
      branchName,
      processUid,
      shouldCreate
    });
    await dispatch(refreshCollectionGitData(collectionUid));
    return result;
  } finally {
    dispatch(removeGitOperationProgress(processUid));
  }
};

export const checkoutCollectionRemoteGitBranch = (collectionUid, { remoteName = 'origin', branchName }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const processUid = uuid();

  try {
    const result = await ipcRenderer.invoke('renderer:git-checkout-remote-branch', {
      gitRootPath,
      remoteName,
      branchName,
      processUid
    });
    await dispatch(refreshCollectionGitData(collectionUid));
    return result;
  } finally {
    dispatch(removeGitOperationProgress(processUid));
  }
};

export const fetchCollectionRemoteBranches = (collectionUid, { remote = 'origin' } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-fetch-remote-branches', { gitRootPath, remote });
};

export const addCollectionGitRemote = (collectionUid, { remoteName = 'origin', remoteUrl }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const state = getState();
  const { collection, gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const remotes = await ipcRenderer.invoke('renderer:git-add-remote', { gitRootPath, remoteName, remoteUrl });

  // Also sync workspace git remote if this is 'origin' and workspace is available
  const activeWorkspace = state.workspaces?.workspaces?.find((w) => w.uid === state.workspaces.activeWorkspaceUid);
  if (remoteName === 'origin' && activeWorkspace?.pathname && activeWorkspace.type !== 'default') {
    await ipcRenderer
      .invoke('renderer:connect-collection-to-git', activeWorkspace.pathname, collection.pathname, remoteUrl)
      .catch(() => null);
  }

  await dispatch(refreshCollectionGitData(collectionUid));
  return remotes;
};

export const removeCollectionGitRemote = (collectionUid, { remoteName }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const state = getState();
  const { collection, gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const remotes = await ipcRenderer.invoke('renderer:git-remove-remote', { gitRootPath, remoteName });

  const activeWorkspace = state.workspaces?.workspaces?.find((w) => w.uid === state.workspaces.activeWorkspaceUid);
  if (remoteName === 'origin' && activeWorkspace?.pathname && activeWorkspace.type !== 'default') {
    await ipcRenderer
      .invoke('renderer:disconnect-collection-from-git', activeWorkspace.pathname, collection.pathname)
      .catch(() => null);
  }

  await dispatch(refreshCollectionGitData(collectionUid));
  return remotes;
};

export const getCollectionGitFileDiff = (collectionUid, { filePath, type = 'unstaged', from, to }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-file-diff', { gitRootPath, filePath, type, from, to });
};

export const createCollectionGitStash = (collectionUid, { message = '' } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-create-stash', { gitRootPath, message });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const applyCollectionGitStash = (collectionUid, { stashIndex, dropAfterApply = false }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  try {
    const result = await ipcRenderer.invoke('renderer:git-apply-stash', {
      gitRootPath,
      stashIndex,
      dropAfterApply
    });
    await dispatch(refreshCollectionGitData(collectionUid));
    return result;
  } catch (error) {
    // Refresh in case applying stash produced merge conflicts
    await dispatch(refreshCollectionGitData(collectionUid));
    throw error;
  }
};

export const dropCollectionGitStash = (collectionUid, { stashIndex }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-drop-stash', { gitRootPath, stashIndex });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const getCollectionGitStashFiles = (collectionUid, { stashIndex }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-stash-files', { gitRootPath, stashIndex });
};

export const getCollectionGitStashFileDiff = (collectionUid, { stashIndex, filePath, isUntracked = false }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-stash-file-diff', {
    gitRootPath,
    stashIndex,
    filePath,
    isUntracked
  });
};

export const getCollectionGitCommitFiles = (collectionUid, { commitHash }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-commit-files', { gitRootPath, commitHash });
};

export const getCollectionGitCommitFileDiff = (collectionUid, { commitHash, filePath }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-commit-file-diff', {
    gitRootPath,
    commitHash,
    filePath
  });
};

export const getCollectionConflictedFile = (collectionUid, { filePath }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  return ipcRenderer.invoke('renderer:git-get-conflicted-file', { gitRootPath, filePath });
};

export const resolveCollectionConflictedFile = (collectionUid, { filePath, content, stage = true }) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-resolve-conflict-file', {
    gitRootPath,
    filePath,
    content,
    stage
  });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const continueCollectionGitMerge = (collectionUid, { conflictedFiles = [], commitMessage } = {}) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-continue-merge', {
    gitRootPath,
    conflictedFiles,
    commitMessage
  });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};

export const abortCollectionGitMerge = (collectionUid) => async (dispatch, getState) => {
  const { ipcRenderer } = window;
  const { gitRootPath } = getCollectionAndGitRoot(getState, collectionUid);
  const result = await ipcRenderer.invoke('renderer:git-abort-merge', { gitRootPath });
  await dispatch(refreshCollectionGitData(collectionUid));
  return result;
};
