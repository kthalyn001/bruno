import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  IconBrandGit,
  IconGitBranch,
  IconRefresh,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconChevronDown,
  IconAlertTriangle,
  IconCopy,
  IconEdit,
  IconLoader2,
  IconArrowBackUp,
  IconWorld
} from '@tabler/icons';
import StyledWrapper from './StyledWrapper';
import GitDiffViewer from 'components/Git/GitDiffViewer';
import ConflictResolver from 'components/Git/ConflictResolver';
import { updateGitOperationProgress } from 'providers/ReduxStore/slices/app';
import {
  refreshCollectionGitData,
  initCollectionGit,
  stageGitChanges,
  unstageGitChanges,
  discardGitChanges,
  commitGitChanges,
  pushCollectionGit,
  pullCollectionGit,
  fetchCollectionGit,
  checkoutCollectionGitBranch,
  checkoutCollectionRemoteGitBranch,
  fetchCollectionRemoteBranches,
  addCollectionGitRemote,
  removeCollectionGitRemote,
  getCollectionGitFileDiff,
  createCollectionGitStash,
  applyCollectionGitStash,
  dropCollectionGitStash,
  getCollectionGitStashFiles,
  getCollectionGitStashFileDiff,
  getCollectionGitCommitFiles,
  getCollectionGitCommitFileDiff,
  continueCollectionGitMerge,
  abortCollectionGitMerge
} from 'utils/git/actions';

const getFileStatusCode = (file, isStaged) => {
  const raw = isStaged ? (file.index || file.working_dir) : (file.working_dir || file.index);
  if (!raw || raw === ' ') return 'M';
  if (raw === '?') return 'U';
  return raw.toUpperCase();
};

const normalizeStatusBadge = (file) => {
  const raw = String(file?.index || file?.status || '').trim().toLowerCase();
  if (file?.isUntracked || raw === '?' || raw === 'u' || raw === 'untracked') return 'U';
  if (raw === 'a' || raw === 'added') return 'A';
  if (raw === 'd' || raw === 'deleted') return 'D';
  if (raw === 'r' || raw === 'renamed') return 'R';
  if (raw === 'c' || raw === 'conflicted') return 'C';
  return 'M';
};

const handleRowKeyDown = (callback) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    callback();
  }
};

const GitTab = ({ collection }) => {
  const dispatch = useDispatch();
  const git = collection?.git || {};
  const gitOperationProgress = useSelector((state) => state.app?.gitOperationProgress || []);

  const [activeSubTab, setActiveSubTab] = useState('changes'); // 'changes' | 'stashes' | 'history' | 'remotes'
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  // Branch popover state
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchMenuMode, setBranchMenuMode] = useState('local'); // 'local' | 'remote' | 'create'
  const [branchFilter, setBranchFilter] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [remoteBranches, setRemoteBranches] = useState([]);
  const [loadingRemoteBranches, setLoadingRemoteBranches] = useState(false);
  const branchPopoverRef = useRef(null);

  // Pull strategy state
  const [pullStrategy, setPullStrategy] = useState('--no-rebase');

  // Changes state
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedChange, setSelectedChange] = useState(null); // { path, scope: 'staged' | 'unstaged' | 'conflict', file }
  const [changeDiff, setChangeDiff] = useState(null);
  const [loadingChangeDiff, setLoadingChangeDiff] = useState(false);

  // Stashes state
  const [stashMessage, setStashMessage] = useState('');
  const [selectedStash, setSelectedStash] = useState(null);
  const [stashFiles, setStashFiles] = useState([]);
  const [selectedStashFile, setSelectedStashFile] = useState(null);
  const [stashFileDiff, setStashFileDiff] = useState(null);

  // History state
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [commitFiles, setCommitFiles] = useState([]);
  const [selectedCommitFile, setSelectedCommitFile] = useState(null);
  const [commitFileDiff, setCommitFileDiff] = useState(null);

  // Remotes state
  const [remoteNameInput, setRemoteNameInput] = useState('origin');
  const [remoteUrlInput, setRemoteUrlInput] = useState('');

  const files = git.files || { staged: [], unstaged: [], conflicted: [] };
  const stagedFiles = files.staged || [];
  const unstagedFiles = files.unstaged || [];
  const conflictedFiles = files.conflicted || [];
  const stashes = git.stashes || [];
  const logs = git.logs || [];
  const remotes = git.remotes || [];
  const localBranches = git.localGitBranches || [];
  const currentBranch = git.currentGitBranch || 'main';
  const aheadCount = git.ahead || 0;
  const behindCount = git.behind || 0;
  const isMerging = Boolean(git.isMerging || conflictedFiles.length > 0);

  // Refresh Git data on mount or collection change
  useEffect(() => {
    if (!collection?.uid) return;
    setSelectedChange(null);
    setChangeDiff(null);
    setSelectedStash(null);
    setSelectedStashFile(null);
    setStashFileDiff(null);
    setSelectedCommit(null);
    setSelectedCommitFile(null);
    setCommitFileDiff(null);
    setCommitMessage('');
    setIsRefreshing(true);
    dispatch(refreshCollectionGitData(collection.uid)).finally(() => {
      setIsRefreshing(false);
    });
  }, [dispatch, collection?.uid]);

  // Listen to Git operation progress updates while GitTab is mounted
  useEffect(() => {
    const { ipcRenderer } = window;
    if (!ipcRenderer?.on) return;
    const removeListener = ipcRenderer.on('main:update-git-operation-progress', (val) => {
      dispatch(updateGitOperationProgress(val));
    });
    return () => {
      removeListener?.();
    };
  }, [dispatch]);

  // Close branch menu on outside click
  useEffect(() => {
    if (!branchMenuOpen) return;
    const handleClickOutside = (event) => {
      if (branchPopoverRef.current && !branchPopoverRef.current.contains(event.target)) {
        setBranchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [branchMenuOpen]);

  // Auto-select first conflicted file if current selection is invalid or empty
  useEffect(() => {
    if (activeSubTab !== 'changes') return;

    const isValidSelection = selectedChange && (
      (selectedChange.scope === 'conflict' && conflictedFiles.includes(selectedChange.path))
      || (selectedChange.scope === 'staged' && stagedFiles.some((f) => f.path === selectedChange.path))
      || (selectedChange.scope === 'unstaged' && unstagedFiles.some((f) => f.path === selectedChange.path))
    );

    if (!isValidSelection) {
      if (conflictedFiles.length > 0) {
        setSelectedChange({ path: conflictedFiles[0], scope: 'conflict' });
      } else if (selectedChange) {
        setSelectedChange(null);
      }
    }
  }, [activeSubTab, conflictedFiles, stagedFiles, unstagedFiles, selectedChange]);

  // Load diff when selectedChange changes (for staged or unstaged)
  useEffect(() => {
    if (!collection?.uid || !selectedChange || selectedChange.scope === 'conflict') {
      setChangeDiff(null);
      return;
    }

    let cancelled = false;
    setLoadingChangeDiff(true);
    dispatch(
      getCollectionGitFileDiff(collection.uid, {
        filePath: selectedChange.path,
        type: selectedChange.scope,
        from: selectedChange.file?.from,
        to: selectedChange.file?.to
      })
    )
      .then((res) => {
        if (!cancelled) setChangeDiff(res);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load diff:', err);
        setChangeDiff(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingChangeDiff(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collection?.uid, selectedChange]);

  // Load stash files when selectedStash changes
  useEffect(() => {
    if (!collection?.uid || selectedStash === null || selectedStash === undefined) {
      setStashFiles([]);
      setSelectedStashFile(null);
      setStashFileDiff(null);
      return;
    }

    let cancelled = false;
    dispatch(getCollectionGitStashFiles(collection.uid, { stashIndex: selectedStash.index }))
      .then((list) => {
        if (cancelled) return;
        const nextFiles = list || [];
        setStashFiles(nextFiles);
        setSelectedStashFile(nextFiles[0] || null);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load stash files');
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collection?.uid, selectedStash]);

  // Load stash file diff when selectedStashFile changes
  useEffect(() => {
    if (!collection?.uid || !selectedStash || !selectedStashFile) {
      setStashFileDiff(null);
      return;
    }

    let cancelled = false;
    dispatch(
      getCollectionGitStashFileDiff(collection.uid, {
        stashIndex: selectedStash.index,
        filePath: selectedStashFile.path,
        isUntracked: Boolean(selectedStashFile.isUntracked)
      })
    )
      .then((res) => {
        if (!cancelled) setStashFileDiff(res);
      })
      .catch(() => {
        if (!cancelled) setStashFileDiff(null);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collection?.uid, selectedStash, selectedStashFile]);

  // Load commit files when selectedCommit changes
  useEffect(() => {
    if (!collection?.uid || !selectedCommit) {
      setCommitFiles([]);
      setSelectedCommitFile(null);
      setCommitFileDiff(null);
      return;
    }

    let cancelled = false;
    dispatch(getCollectionGitCommitFiles(collection.uid, { commitHash: selectedCommit.hash }))
      .then((res) => {
        if (cancelled) return;
        const list = res?.files || [];
        setCommitFiles(list);
        setSelectedCommitFile(list[0] || null);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load commit files');
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collection?.uid, selectedCommit]);

  // Load commit file diff when selectedCommitFile changes
  useEffect(() => {
    if (!collection?.uid || !selectedCommit || !selectedCommitFile) {
      setCommitFileDiff(null);
      return;
    }

    let cancelled = false;
    dispatch(
      getCollectionGitCommitFileDiff(collection.uid, {
        commitHash: selectedCommit.hash,
        filePath: selectedCommitFile.path
      })
    )
      .then((res) => {
        if (!cancelled) setCommitFileDiff(res);
      })
      .catch(() => {
        if (!cancelled) setCommitFileDiff(null);
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collection?.uid, selectedCommit, selectedCommitFile]);

  const filteredLocalBranches = useMemo(() => {
    const q = branchFilter.trim().toLowerCase();
    if (!q) return localBranches;
    return localBranches.filter((b) => b.toLowerCase().includes(q));
  }, [localBranches, branchFilter]);

  const filteredRemoteBranches = useMemo(() => {
    const q = branchFilter.trim().toLowerCase();
    if (!q) return remoteBranches;
    return remoteBranches.filter((b) => b.toLowerCase().includes(q));
  }, [remoteBranches, branchFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await dispatch(refreshCollectionGitData(collection.uid));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInitGit = async () => {
    setIsBusy(true);
    try {
      await dispatch(initCollectionGit(collection.uid));
      toast.success('Initialized Git repository');
    } catch (error) {
      toast.error(error?.message || 'Failed to initialize Git repository');
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadRemoteBranches = async () => {
    setLoadingRemoteBranches(true);
    try {
      const primaryRemote = remotes[0]?.name || 'origin';
      const branches = await dispatch(fetchCollectionRemoteBranches(collection.uid, { remote: primaryRemote }));
      setRemoteBranches(branches || []);
    } catch (error) {
      toast.error(error?.message || 'Failed to fetch remote branches');
    } finally {
      setLoadingRemoteBranches(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e?.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) {
      toast.error('Please enter a branch name');
      return;
    }
    setIsBusy(true);
    try {
      await dispatch(checkoutCollectionGitBranch(collection.uid, { branchName: trimmed, shouldCreate: true }));
      toast.success(`Created and switched to branch '${trimmed}'`);
      setNewBranchName('');
      setBranchMenuOpen(false);
    } catch (error) {
      toast.error(error?.message || 'Failed to create branch');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckoutLocalBranch = async (branchName) => {
    if (branchName === currentBranch) {
      setBranchMenuOpen(false);
      return;
    }
    setIsBusy(true);
    try {
      await dispatch(checkoutCollectionGitBranch(collection.uid, { branchName, shouldCreate: false }));
      toast.success(`Switched to branch '${branchName}'`);
      setBranchMenuOpen(false);
    } catch (error) {
      toast.error(error?.message || `Failed to switch to '${branchName}'`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckoutRemoteBranch = async (fullRemoteBranch) => {
    const primaryRemote = remotes[0]?.name || 'origin';
    const knownRemoteNames = new Set(remotes.map((r) => r.name).concat(primaryRemote));
    const slashIdx = fullRemoteBranch.indexOf('/');
    const candidateRemote = slashIdx > 0 ? fullRemoteBranch.slice(0, slashIdx) : '';
    const hasRemotePrefix = Boolean(candidateRemote && knownRemoteNames.has(candidateRemote));
    const remoteName = hasRemotePrefix ? candidateRemote : primaryRemote;
    const branchName = hasRemotePrefix ? fullRemoteBranch.slice(slashIdx + 1) : fullRemoteBranch;
    setIsBusy(true);
    try {
      await dispatch(checkoutCollectionRemoteGitBranch(collection.uid, { remoteName, branchName }));
      toast.success(`Checked out remote branch '${branchName}'`);
      setBranchMenuOpen(false);
    } catch (error) {
      toast.error(error?.message || 'Failed to checkout remote branch');
    } finally {
      setIsBusy(false);
    }
  };

  const handleStageFiles = async (filePaths, e) => {
    e?.stopPropagation();
    if (!filePaths?.length) return;
    try {
      await dispatch(stageGitChanges(collection.uid, filePaths));
    } catch (error) {
      toast.error(error?.message || 'Failed to stage changes');
    }
  };

  const handleUnstageFiles = async (filePaths, e) => {
    e?.stopPropagation();
    if (!filePaths?.length) return;
    try {
      await dispatch(unstageGitChanges(collection.uid, filePaths));
    } catch (error) {
      toast.error(error?.message || 'Failed to unstage changes');
    }
  };

  const handleDiscardFiles = async (filePaths, e) => {
    e?.stopPropagation();
    if (!filePaths?.length) return;
    try {
      await dispatch(discardGitChanges(collection.uid, filePaths));
      toast.success(filePaths.length === 1 ? `Discarded changes in ${filePaths[0]}` : `Discarded ${filePaths.length} files`);
      if (selectedChange && filePaths.includes(selectedChange.path)) {
        setSelectedChange(null);
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to discard changes');
    }
  };

  const handleCommit = async ({ pushAfterCommit = false } = {}) => {
    const msg = commitMessage.trim();
    if (!msg) {
      toast.error('Please enter a commit message');
      return;
    }

    if (conflictedFiles.length > 0) {
      toast.error('Please resolve all merge conflicts before committing');
      return;
    }

    setIsBusy(true);
    try {
      // If nothing is staged yet, stage all unstaged changes automatically
      if (stagedFiles.length === 0 && unstagedFiles.length > 0) {
        await dispatch(stageGitChanges(collection.uid, unstagedFiles.map((f) => f.path)));
      }
      await dispatch(commitGitChanges(collection.uid, msg));
      setCommitMessage('');
      setSelectedChange(null);
      toast.success('Changes committed');

      if (pushAfterCommit) {
        const primaryRemote = remotes[0]?.name || 'origin';
        try {
          await dispatch(pushCollectionGit(collection.uid, { remote: primaryRemote, remoteBranch: currentBranch }));
          toast.success(`Pushed to ${primaryRemote}/${currentBranch}`);
        } catch (pushError) {
          toast.error(pushError?.message || 'Changes committed locally, but push failed — please retry Push');
        }
      }
    } catch (error) {
      toast.error(error?.message || 'Commit failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleFetch = async () => {
    if (remotes.length === 0) {
      setActiveSubTab('remotes');
      toast.error('Connect a Git remote first');
      return;
    }
    setIsBusy(true);
    try {
      const primaryRemote = remotes[0]?.name || 'origin';
      await dispatch(fetchCollectionGit(collection.uid, { remote: primaryRemote }));
      toast.success(`Fetched from ${primaryRemote}`);
    } catch (error) {
      toast.error(error?.message || 'Fetch failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePull = async () => {
    if (remotes.length === 0) {
      setActiveSubTab('remotes');
      toast.error('Connect a Git remote first');
      return;
    }
    setIsBusy(true);
    try {
      const primaryRemote = remotes[0]?.name || 'origin';
      await dispatch(
        pullCollectionGit(collection.uid, {
          remote: primaryRemote,
          remoteBranch: currentBranch,
          strategy: pullStrategy
        })
      );
      toast.success(`Pulled from ${primaryRemote}/${currentBranch}`);
    } catch (error) {
      toast.error(error?.message || 'Pull encountered an issue (check for merge conflicts)');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePush = async () => {
    if (remotes.length === 0) {
      setActiveSubTab('remotes');
      toast.error('Connect a Git remote first to push changes');
      return;
    }
    setIsBusy(true);
    try {
      const primaryRemote = remotes[0]?.name || 'origin';
      await dispatch(
        pushCollectionGit(collection.uid, {
          remote: primaryRemote,
          remoteBranch: currentBranch
        })
      );
      toast.success(`Pushed to ${primaryRemote}/${currentBranch}`);
    } catch (error) {
      toast.error(error?.message || 'Push failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateStash = async (e) => {
    e?.preventDefault();
    setIsBusy(true);
    try {
      await dispatch(createCollectionGitStash(collection.uid, { message: stashMessage.trim() }));
      setStashMessage('');
      toast.success('Stashed local changes');
      setActiveSubTab('stashes');
    } catch (error) {
      toast.error(error?.message || 'Failed to create stash');
    } finally {
      setIsBusy(false);
    }
  };

  const handleApplyStash = async (stashIndex, dropAfterApply = false, e) => {
    e?.stopPropagation();
    setIsBusy(true);
    try {
      await dispatch(applyCollectionGitStash(collection.uid, { stashIndex, dropAfterApply }));
      toast.success(dropAfterApply ? `Popped stash@{${stashIndex}}` : `Applied stash@{${stashIndex}}`);
      if (dropAfterApply && selectedStash?.index === stashIndex) {
        setSelectedStash(null);
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to apply stash');
      setActiveSubTab('changes');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDropStash = async (stashIndex, e) => {
    e?.stopPropagation();
    setIsBusy(true);
    try {
      await dispatch(dropCollectionGitStash(collection.uid, { stashIndex }));
      toast.success(`Dropped stash@{${stashIndex}}`);
      if (selectedStash?.index === stashIndex) {
        setSelectedStash(null);
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to drop stash');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveRemote = async (e) => {
    e?.preventDefault();
    const name = remoteNameInput.trim();
    const url = remoteUrlInput.trim();
    if (!name || !url) {
      toast.error('Remote name and URL are required');
      return;
    }
    setIsBusy(true);
    try {
      await dispatch(addCollectionGitRemote(collection.uid, { remoteName: name, remoteUrl: url }));
      toast.success(`Saved remote '${name}'`);
      setRemoteUrlInput('');
    } catch (error) {
      toast.error(error?.message || 'Failed to save remote');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveRemote = async (remoteName) => {
    setIsBusy(true);
    try {
      await dispatch(removeCollectionGitRemote(collection.uid, { remoteName }));
      toast.success(`Removed remote '${remoteName}'`);
    } catch (error) {
      toast.error(error?.message || 'Failed to remove remote');
    } finally {
      setIsBusy(false);
    }
  };

  const handleContinueMerge = async () => {
    if (conflictedFiles.length > 0) {
      toast.error('Resolve all remaining conflicted files before completing merge');
      return;
    }
    setIsBusy(true);
    try {
      await dispatch(
        continueCollectionGitMerge(collection.uid, {
          conflictedFiles: [],
          commitMessage: commitMessage.trim() || undefined
        })
      );
      setCommitMessage('');
      toast.success('Merge completed');
    } catch (error) {
      toast.error(error?.message || 'Failed to complete merge');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAbortMerge = async () => {
    setIsBusy(true);
    try {
      await dispatch(abortCollectionGitMerge(collection.uid));
      setSelectedChange(null);
      toast.success('Merge aborted');
    } catch (error) {
      toast.error(error?.message || 'Failed to abort merge');
    } finally {
      setIsBusy(false);
    }
  };

  if (!git.isGitRepo) {
    return (
      <StyledWrapper data-testid="git-tab-uninitialized">
        <div className="git-empty-state">
          <div className="empty-icon">
            <IconBrandGit size={28} strokeWidth={1.5} />
          </div>
          <h3>This collection is not a Git repository yet</h3>
          <p>
            Initialize Git to track changes, create and switch branches, connect a remote repository, stash work, and resolve merge conflicts.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              className="git-btn primary"
              onClick={handleInitGit}
              disabled={isBusy}
              data-testid="git-init-button"
            >
              <IconBrandGit size={15} />
              <span>{isBusy ? 'Initializing...' : 'Initialize Git Repository'}</span>
            </button>
            <button
              type="button"
              className="git-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
              data-testid="git-refresh-button"
            >
              <IconRefresh size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  const totalChangedCount = stagedFiles.length + unstagedFiles.length + conflictedFiles.length;
  const canCommit = !isBusy && conflictedFiles.length === 0 && commitMessage.trim().length > 0 && (stagedFiles.length > 0 || unstagedFiles.length > 0);
  const latestProgressText = useMemo(() => {
    if (!gitOperationProgress) return null;
    if (Array.isArray(gitOperationProgress)) {
      const last = gitOperationProgress[gitOperationProgress.length - 1];
      if (!last) return null;
      return typeof last === 'string'
        ? last
        : `${last.stage || 'Running Git operation'} (${last.progress || 0}%)`;
    }
    const entries = Object.values(gitOperationProgress);
    if (!entries.length) return null;
    const lastEntry = entries[entries.length - 1];
    const lines = lastEntry?.progressData || [];
    const lastLine = lines[lines.length - 1]?.trim();
    return lastLine || 'Running Git operation...';
  }, [gitOperationProgress]);

  return (
    <StyledWrapper data-testid="git-tab">
      {/* Top Toolbar */}
      <div className="git-header">
        <div className="git-header-left">
          {/* Branch Selector & Creator */}
          <div className="branch-pill-wrapper" ref={branchPopoverRef}>
            <button
              type="button"
              className="git-btn"
              onClick={() => setBranchMenuOpen((prev) => !prev)}
              data-testid="git-branch-selector"
            >
              <IconGitBranch size={14} />
              <span>{currentBranch}</span>
              <IconChevronDown size={13} />
            </button>

            {branchMenuOpen && (
              <div className="branch-popover" data-testid="git-branch-popover">
                <div className="branch-popover-tabs">
                  <button
                    type="button"
                    className={branchMenuMode === 'local' ? 'active' : ''}
                    onClick={() => setBranchMenuMode('local')}
                    data-testid="git-branch-tab-local"
                  >
                    Local ({localBranches.length})
                  </button>
                  <button
                    type="button"
                    className={branchMenuMode === 'remote' ? 'active' : ''}
                    onClick={() => {
                      setBranchMenuMode('remote');
                      handleLoadRemoteBranches();
                    }}
                    data-testid="git-branch-tab-remote"
                  >
                    Remote
                  </button>
                  <button
                    type="button"
                    className={branchMenuMode === 'create' ? 'active' : ''}
                    onClick={() => setBranchMenuMode('create')}
                    data-testid="git-branch-tab-create"
                  >
                    + New Branch
                  </button>
                </div>

                {branchMenuMode === 'create' ? (
                  <form className="branch-input-row" onSubmit={handleCreateBranch}>
                    <input
                      type="text"
                      placeholder="New branch name (e.g. feat/auth)"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      autoFocus
                      data-testid="git-new-branch-input"
                    />
                    <button
                      type="submit"
                      className="git-btn primary"
                      disabled={isBusy || !newBranchName.trim()}
                      data-testid="git-create-branch-submit"
                    >
                      Create
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="branch-input-row">
                      <input
                        type="text"
                        placeholder={branchMenuMode === 'local' ? 'Filter local branches...' : 'Filter remote branches...'}
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        data-testid="git-branch-filter-input"
                      />
                    </div>

                    <div className="branch-list">
                      {branchMenuMode === 'local' ? (
                        filteredLocalBranches.length > 0 ? (
                          filteredLocalBranches.map((branch) => (
                            <button
                              key={branch}
                              type="button"
                              className={`branch-item ${branch === currentBranch ? 'current' : ''}`}
                              onClick={() => handleCheckoutLocalBranch(branch)}
                              data-testid={`git-local-branch-${branch}`}
                            >
                              <span>{branch}</span>
                              {branch === currentBranch && <IconCheck size={13} />}
                            </button>
                          ))
                        ) : (
                          <div className="text-xs opacity-60 p-2">No matching local branches</div>
                        )
                      ) : loadingRemoteBranches ? (
                        <div className="text-xs opacity-60 p-2 flex items-center gap-2">
                          <IconLoader2 size={13} className="animate-spin" />
                          <span>Loading remote branches...</span>
                        </div>
                      ) : filteredRemoteBranches.length > 0 ? (
                        filteredRemoteBranches.map((remoteBranch) => (
                          <button
                            key={remoteBranch}
                            type="button"
                            className="branch-item"
                            onClick={() => handleCheckoutRemoteBranch(remoteBranch)}
                            data-testid={`git-remote-branch-${remoteBranch}`}
                          >
                            <span>{remoteBranch}</span>
                          </button>
                        ))
                      ) : (
                        <div className="text-xs opacity-60 p-2">
                          {remotes.length === 0 ? 'No remote configured' : 'No remote branches found'}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Fetch / Pull / Push */}
          <button
            type="button"
            className="git-btn"
            onClick={handleFetch}
            disabled={isBusy}
            title="Fetch from remote"
            data-testid="git-fetch-button"
          >
            <span>Fetch</span>
          </button>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              className="git-btn"
              onClick={handlePull}
              disabled={isBusy}
              title={`Pull (${pullStrategy})`}
              data-testid="git-pull-button"
            >
              <span>Pull</span>
              {behindCount > 0 && <span className="count-pill">↓ {behindCount}</span>}
            </button>
            <select
              className="form-input"
              style={{ padding: '4px 6px', fontSize: 11 }}
              value={pullStrategy}
              onChange={(e) => setPullStrategy(e.target.value)}
              title="Pull strategy"
              data-testid="git-pull-strategy"
            >
              <option value="--no-rebase">Merge (--no-rebase)</option>
              <option value="--ff-only">Fast-forward (--ff-only)</option>
            </select>
          </div>

          <button
            type="button"
            className="git-btn"
            onClick={handlePush}
            disabled={isBusy}
            title="Push current branch to remote"
            data-testid="git-push-button"
          >
            <span>Push</span>
            {aheadCount > 0 && <span className="count-pill">↑ {aheadCount}</span>}
          </button>
        </div>

        <div className="git-header-right">
          <button
            type="button"
            className="git-btn"
            onClick={handleCreateStash}
            disabled={isBusy || (stagedFiles.length === 0 && unstagedFiles.length === 0)}
            title="Stash current uncommitted changes"
            data-testid="git-quick-stash-button"
          >
            <span>Stash Changes</span>
          </button>

          <button
            type="button"
            className="git-btn"
            onClick={() => setActiveSubTab('remotes')}
            data-testid="git-connect-remote-button"
          >
            <IconWorld size={14} />
            <span>{remotes.length > 0 ? `Remote: ${remotes[0].name}` : 'Connect Remote'}</span>
          </button>

          <button
            type="button"
            className="git-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Git status"
            data-testid="git-refresh-button"
          >
            <IconRefresh size={14} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Progress Banner */}
      {latestProgressText && (
        <div className="git-progress-bar" data-testid="git-operation-progress">
          <IconLoader2 size={13} className="animate-spin" />
          <span>{latestProgressText}</span>
        </div>
      )}

      {git.statusError && (
        <div className="conflict-banner" data-testid="git-status-error-banner">
          <div className="conflict-banner-title">
            <span className="inline-flex items-center gap-1.5">
              <IconAlertTriangle size={15} />
              <span>Git Status Error: {git.statusError}</span>
            </span>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="git-subtabs">
        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'changes' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('changes')}
          data-testid="git-subtab-changes"
        >
          <span>Changes</span>
          {totalChangedCount > 0 && (
            <span className={`subtab-badge ${conflictedFiles.length > 0 ? 'conflict' : ''}`}>
              {totalChangedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'stashes' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('stashes')}
          data-testid="git-subtab-stashes"
        >
          <span>Stashes</span>
          {stashes.length > 0 && <span className="subtab-badge">{stashes.length}</span>}
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('history')}
          data-testid="git-subtab-history"
        >
          <span>History</span>
          {logs.length > 0 && <span className="subtab-badge">{logs.length}</span>}
        </button>

        <button
          type="button"
          className={`subtab-btn ${activeSubTab === 'remotes' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('remotes')}
          data-testid="git-subtab-remotes"
        >
          <span>Remotes</span>
          {remotes.length > 0 && <span className="subtab-badge">{remotes.length}</span>}
        </button>
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'changes' && (
        <div className="git-workspace">
          <div className="git-left-pane">
            {/* Merge Conflict Resolution Section */}
            {isMerging && (
              <div className="conflict-banner" data-testid="git-conflict-banner">
                <div className="conflict-banner-title">
                  <span className="inline-flex items-center gap-1.5">
                    <IconAlertTriangle size={15} />
                    <span>
                      Merge Conflicts ({conflictedFiles.length} remaining)
                    </span>
                  </span>
                </div>

                {conflictedFiles.length > 0 && (
                  <div className="file-list">
                    {conflictedFiles.map((filePath) => (
                      <div
                        key={filePath}
                        role="button"
                        tabIndex={0}
                        className={`file-row ${selectedChange?.scope === 'conflict' && selectedChange?.path === filePath ? 'selected' : ''}`}
                        onClick={() => setSelectedChange({ path: filePath, scope: 'conflict' })}
                        onKeyDown={handleRowKeyDown(() => setSelectedChange({ path: filePath, scope: 'conflict' }))}
                        data-testid={`git-conflict-file-${filePath}`}
                      >
                        <div className="file-row-left">
                          <span className="file-status-badge C">!</span>
                          <span className="file-path" title={filePath}>{filePath}</span>
                        </div>
                        <div className="file-row-actions">
                          <button type="button" onClick={() => setSelectedChange({ path: filePath, scope: 'conflict' })}>Resolve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="git-btn primary"
                    disabled={isBusy || conflictedFiles.length > 0}
                    onClick={handleContinueMerge}
                    data-testid="git-complete-merge-button"
                  >
                    <IconCheck size={13} />
                    <span>Complete Merge</span>
                  </button>
                  <button
                    type="button"
                    className="git-btn danger"
                    disabled={isBusy}
                    onClick={handleAbortMerge}
                    data-testid="git-abort-merge-button"
                  >
                    <IconX size={13} />
                    <span>Abort Merge</span>
                  </button>
                </div>
              </div>
            )}

            {/* Add & Commit Box */}
            <div className="git-section">
              <div className="commit-box">
                <textarea
                  placeholder="Commit message..."
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  data-testid="git-commit-message-input"
                />
                <div className="commit-actions">
                  <button
                    type="button"
                    className="git-btn primary"
                    disabled={!canCommit}
                    onClick={() => handleCommit({ pushAfterCommit: false })}
                    data-testid="git-commit-button"
                  >
                    <IconCheck size={13} />
                    <span>
                      {stagedFiles.length > 0
                        ? `Commit Staged (${stagedFiles.length})`
                        : `Stage All & Commit (${unstagedFiles.length})`}
                    </span>
                  </button>
                  {remotes.length > 0 && (
                    <button
                      type="button"
                      className="git-btn"
                      disabled={!canCommit}
                      onClick={() => handleCommit({ pushAfterCommit: true })}
                      data-testid="git-commit-and-push-button"
                    >
                      <span>Commit & Push</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Staged Changes */}
            <div className="git-section">
              <div className="git-section-header">
                <span>Staged Changes ({stagedFiles.length})</span>
                {stagedFiles.length > 0 && (
                  <div className="section-actions">
                    <button
                      type="button"
                      className="git-btn"
                      style={{ padding: '2px 6px', fontSize: 10 }}
                      onClick={(e) => handleUnstageFiles(stagedFiles.map((f) => f.path), e)}
                      data-testid="git-unstage-all-button"
                    >
                      Unstage All
                    </button>
                  </div>
                )}
              </div>

              {stagedFiles.length > 0 ? (
                <div className="file-list" data-testid="git-staged-list">
                  {stagedFiles.map((file) => {
                    const statusCode = getFileStatusCode(file, true);
                    const isSelected = selectedChange?.scope === 'staged' && selectedChange?.path === file.path;
                    return (
                      <div
                        key={`staged-${file.path}`}
                        role="button"
                        tabIndex={0}
                        className={`file-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedChange({ path: file.path, scope: 'staged', file })}
                        onKeyDown={handleRowKeyDown(() => setSelectedChange({ path: file.path, scope: 'staged', file }))}
                        data-testid={`git-staged-file-${file.path}`}
                      >
                        <div className="file-row-left">
                          <span className={`file-status-badge ${statusCode}`}>{statusCode}</span>
                          <span className="file-path" title={file.path}>{file.path}</span>
                        </div>
                        <div className="file-row-actions">
                          <button
                            type="button"
                            onClick={(e) => handleUnstageFiles([file.path], e)}
                            title="Unstage file"
                            data-testid={`git-unstage-file-${file.path}`}
                          >
                            -
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs opacity-50 py-1">No staged changes</div>
              )}
            </div>

            {/* Unstaged Changes */}
            <div className="git-section" style={{ borderBottom: 'none' }}>
              <div className="git-section-header">
                <span>Changes ({unstagedFiles.length})</span>
                {unstagedFiles.length > 0 && (
                  <div className="section-actions">
                    <button
                      type="button"
                      className="git-btn"
                      style={{ padding: '2px 6px', fontSize: 10 }}
                      onClick={(e) => handleStageFiles(unstagedFiles.map((f) => f.path), e)}
                      data-testid="git-stage-all-button"
                    >
                      Stage All
                    </button>
                    <button
                      type="button"
                      className="git-btn danger"
                      style={{ padding: '2px 6px', fontSize: 10 }}
                      onClick={(e) => handleDiscardFiles(unstagedFiles.map((f) => f.path), e)}
                      data-testid="git-discard-all-button"
                    >
                      Discard All
                    </button>
                  </div>
                )}
              </div>

              {unstagedFiles.length > 0 ? (
                <div className="file-list" data-testid="git-unstaged-list">
                  {unstagedFiles.map((file) => {
                    const statusCode = getFileStatusCode(file, false);
                    const isSelected = selectedChange?.scope === 'unstaged' && selectedChange?.path === file.path;
                    return (
                      <div
                        key={`unstaged-${file.path}`}
                        role="button"
                        tabIndex={0}
                        className={`file-row ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedChange({ path: file.path, scope: 'unstaged', file })}
                        onKeyDown={handleRowKeyDown(() => setSelectedChange({ path: file.path, scope: 'unstaged', file }))}
                        data-testid={`git-unstaged-file-${file.path}`}
                      >
                        <div className="file-row-left">
                          <span className={`file-status-badge ${statusCode}`}>{statusCode}</span>
                          <span className="file-path" title={file.path}>{file.path}</span>
                        </div>
                        <div className="file-row-actions">
                          <button
                            type="button"
                            onClick={(e) => handleDiscardFiles([file.path], e)}
                            title="Discard changes"
                            data-testid={`git-discard-file-${file.path}`}
                          >
                            <IconArrowBackUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleStageFiles([file.path], e)}
                            title="Stage file"
                            data-testid={`git-stage-file-${file.path}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs opacity-50 py-1">Working tree clean</div>
              )}
            </div>
          </div>

          <div className="git-right-pane">
            {selectedChange?.scope === 'conflict' ? (
              <ConflictResolver
                collectionUid={collection.uid}
                filePath={selectedChange.path}
                onResolved={() => setSelectedChange(null)}
              />
            ) : selectedChange ? (
              loadingChangeDiff ? (
                <div className="p-6 text-xs opacity-60">Loading diff...</div>
              ) : (
                <GitDiffViewer
                  filePath={selectedChange.path}
                  textDiff={changeDiff?.textDiff || ''}
                  visualDiff={changeDiff?.visualDiff}
                  oldLabel={selectedChange.scope === 'staged' ? 'HEAD' : 'Index / HEAD'}
                  newLabel={selectedChange.scope === 'staged' ? 'Staged' : 'Working Tree'}
                />
              )
            ) : (
              <div className="git-empty-state">
                <p>Select a changed or conflicted file on the left to inspect its diff or resolve merge conflicts.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'stashes' && (
        <div className="git-workspace">
          <div className="git-left-pane">
            <div className="git-section">
              <div className="git-section-header">
                <span>Create Stash</span>
              </div>
              <form className="flex gap-2" onSubmit={handleCreateStash}>
                <input
                  type="text"
                  className="form-input flex-1"
                  placeholder="Optional stash message..."
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                  data-testid="git-stash-message-input"
                />
                <button
                  type="submit"
                  className="git-btn primary"
                  disabled={isBusy || (stagedFiles.length === 0 && unstagedFiles.length === 0)}
                  data-testid="git-create-stash-button"
                >
                  Stash
                </button>
              </form>
            </div>

            <div className="git-section" style={{ borderBottom: 'none' }}>
              <div className="git-section-header">
                <span>Saved Stashes ({stashes.length})</span>
              </div>
              {stashes.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="git-stash-list">
                  {stashes.map((stash) => {
                    const isSelected = selectedStash?.index === stash.index;
                    return (
                      <div
                        key={`stash-${stash.index}-${stash.hash}`}
                        role="button"
                        tabIndex={0}
                        className={`list-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedStash(stash)}
                        onKeyDown={handleRowKeyDown(() => setSelectedStash(stash))}
                        data-testid={`git-stash-item-${stash.index}`}
                      >
                        <div className="card-title">
                          stash@{'{'}
                          {stash.index}
                          {'}'}: {stash.message}
                        </div>
                        <div className="card-meta">
                          <span>{stash.branch || ''}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="git-btn"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={(e) => handleApplyStash(stash.index, false, e)}
                              data-testid={`git-stash-apply-${stash.index}`}
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              className="git-btn"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={(e) => handleApplyStash(stash.index, true, e)}
                              data-testid={`git-stash-pop-${stash.index}`}
                            >
                              Pop
                            </button>
                            <button
                              type="button"
                              className="git-btn danger"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={(e) => handleDropStash(stash.index, e)}
                              data-testid={`git-stash-drop-${stash.index}`}
                            >
                              <IconTrash size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs opacity-50 py-2">No stashes saved</div>
              )}
            </div>
          </div>

          <div className="git-right-pane">
            {selectedStash ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="git-section" style={{ flexShrink: 0 }}>
                  <div className="git-section-header">
                    <span>
                      Files in stash@{'{'}
                      {selectedStash.index}
                      {'}'} ({stashFiles.length})
                    </span>
                  </div>
                  <div className="file-list" style={{ maxHeight: 140, overflowY: 'auto' }}>
                    {stashFiles.map((file) => {
                      const badge = normalizeStatusBadge(file);
                      return (
                        <div
                          key={file.path}
                          role="button"
                          tabIndex={0}
                          className={`file-row ${selectedStashFile?.path === file.path ? 'selected' : ''}`}
                          onClick={() => setSelectedStashFile(file)}
                          onKeyDown={handleRowKeyDown(() => setSelectedStashFile(file))}
                        >
                          <div className="file-row-left">
                            <span className={`file-status-badge ${badge}`}>{badge}</span>
                            <span className="file-path">{file.path}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {selectedStashFile ? (
                    <GitDiffViewer
                      filePath={selectedStashFile.path}
                      textDiff={stashFileDiff?.textDiff || ''}
                      visualDiff={stashFileDiff?.visualDiff}
                      oldLabel="Base"
                      newLabel={`stash@{${selectedStash.index}}`}
                    />
                  ) : (
                    <div className="p-6 text-xs opacity-60">Select a file in the stash to view its diff.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="git-empty-state">
                <p>Select a stash on the left to inspect its stashed files, or apply/pop it to your working tree.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'history' && (
        <div className="git-workspace">
          <div className="git-left-pane">
            <div className="git-section" style={{ borderBottom: 'none' }}>
              <div className="git-section-header">
                <span>Recent Commits ({logs.length})</span>
              </div>
              {logs.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="git-history-list">
                  {logs.map((commit) => {
                    const isSelected = selectedCommit?.hash === commit.hash;
                    return (
                      <div
                        key={commit.hash}
                        role="button"
                        tabIndex={0}
                        className={`list-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedCommit(commit)}
                        onKeyDown={handleRowKeyDown(() => setSelectedCommit(commit))}
                        data-testid={`git-commit-item-${commit.hash.slice(0, 7)}`}
                      >
                        <div className="card-title">{commit.message}</div>
                        <div className="card-meta">
                          <span>{commit.author_name}</span>
                          <span className="font-mono">{commit.hash.slice(0, 7)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs opacity-50 py-2">No commits yet</div>
              )}
            </div>
          </div>

          <div className="git-right-pane">
            {selectedCommit ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="git-section" style={{ flexShrink: 0 }}>
                  <div className="git-section-header">
                    <span>
                      Commit {selectedCommit.hash.slice(0, 7)} — {commitFiles.length} file(s)
                    </span>
                  </div>
                  <div className="file-list" style={{ maxHeight: 140, overflowY: 'auto' }}>
                    {commitFiles.map((file) => {
                      const badge = normalizeStatusBadge(file);
                      return (
                        <div
                          key={file.path}
                          role="button"
                          tabIndex={0}
                          className={`file-row ${selectedCommitFile?.path === file.path ? 'selected' : ''}`}
                          onClick={() => setSelectedCommitFile(file)}
                          onKeyDown={handleRowKeyDown(() => setSelectedCommitFile(file))}
                        >
                          <div className="file-row-left">
                            <span className={`file-status-badge ${badge}`}>{badge}</span>
                            <span className="file-path">{file.path}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  {selectedCommitFile ? (
                    <GitDiffViewer
                      filePath={selectedCommitFile.path}
                      textDiff={commitFileDiff?.textDiff || ''}
                      visualDiff={commitFileDiff?.visualDiff}
                      oldLabel={`${selectedCommit.hash.slice(0, 7)}~1`}
                      newLabel={selectedCommit.hash.slice(0, 7)}
                    />
                  ) : (
                    <div className="p-6 text-xs opacity-60">Select a file from this commit to view its diff.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="git-empty-state">
                <p>Select a commit on the left to inspect its changed files and visual diffs.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'remotes' && (
        <div className="git-workspace">
          <div className="git-left-pane">
            <div className="git-section" style={{ borderBottom: 'none' }}>
              <div className="git-section-header">
                <span>Connect / Update Remote</span>
              </div>
              <form className="flex flex-col gap-2" onSubmit={handleSaveRemote}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Remote name (e.g. origin)"
                  value={remoteNameInput}
                  onChange={(e) => setRemoteNameInput(e.target.value)}
                  data-testid="git-remote-name-input"
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Remote URL (https://... or git@...)"
                  value={remoteUrlInput}
                  onChange={(e) => setRemoteUrlInput(e.target.value)}
                  data-testid="git-remote-url-input"
                />
                <button
                  type="submit"
                  className="git-btn primary justify-center"
                  disabled={isBusy || !remoteNameInput.trim() || !remoteUrlInput.trim()}
                  data-testid="git-save-remote-button"
                >
                  <IconPlus size={13} />
                  <span>Save Remote</span>
                </button>
              </form>
            </div>
          </div>

          <div className="git-right-pane">
            <div className="git-section" style={{ borderBottom: 'none' }}>
              <div className="git-section-header">
                <span>Configured Remotes ({remotes.length})</span>
              </div>
              {remotes.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="git-remotes-list">
                  {remotes.map((remote) => {
                    const url = remote?.refs?.fetch || remote?.refs?.push || '';
                    return (
                      <div key={remote.name} className="list-card" data-testid={`git-remote-item-${remote.name}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs">{remote.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="git-btn"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => {
                                navigator.clipboard?.writeText(url);
                                toast.success('Copied remote URL');
                              }}
                              title="Copy URL"
                            >
                              <IconCopy size={11} />
                            </button>
                            <button
                              type="button"
                              className="git-btn"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => {
                                setRemoteNameInput(remote.name);
                                setRemoteUrlInput(url);
                              }}
                              title="Edit remote"
                            >
                              <IconEdit size={11} />
                            </button>
                            <button
                              type="button"
                              className="git-btn danger"
                              style={{ padding: '2px 6px', fontSize: 10 }}
                              onClick={() => handleRemoveRemote(remote.name)}
                              data-testid={`git-remove-remote-${remote.name}`}
                              title="Remove remote"
                            >
                              <IconTrash size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs font-mono opacity-75 break-all">{url}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs opacity-60 py-4">
                  No Git remotes configured yet. Add an <code>origin</code> remote on the left to push, pull, and fetch branches.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </StyledWrapper>
  );
};

export default GitTab;
