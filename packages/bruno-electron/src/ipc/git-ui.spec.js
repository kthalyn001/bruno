jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }));
jest.mock('../utils/git', () => ({
  getCollectionGitRootPath: jest.fn(),
  initGit: jest.fn(),
  getCollectionGitData: jest.fn(),
  getChangedFilesInCollectionGit: jest.fn(),
  getAheadBehindCount: jest.fn(),
  fetchRemotes: jest.fn(),
  listStashes: jest.fn(),
  stageChanges: jest.fn(),
  unstageChanges: jest.fn(),
  discardChanges: jest.fn(),
  commitChanges: jest.fn(),
  pushGitChanges: jest.fn(),
  pullGitChanges: jest.fn(),
  fetchChanges: jest.fn(),
  checkoutGitBranch: jest.fn(),
  checkoutRemoteGitBranch: jest.fn(),
  fetchRemoteBranches: jest.fn(),
  addRemote: jest.fn(),
  removeRemote: jest.fn(),
  getStagedFileDiff: jest.fn(),
  getUnstagedFileDiff: jest.fn(),
  getRenamedFileDiff: jest.fn(),
  getWorkingFileContentForVisualDiff: jest.fn(),
  createStash: jest.fn(),
  applyStash: jest.fn(),
  dropStash: jest.fn(),
  getStashFiles: jest.fn(),
  getStashFileDiff: jest.fn(),
  getStashFileContentForVisualDiff: jest.fn(),
  getCollectionGitLogs: jest.fn(),
  getCommitFiles: jest.fn(),
  getCommitFileDiff: jest.fn(),
  getFileContentForVisualDiff: jest.fn(),
  getConflictedFileContent: jest.fn(),
  resolveConflictedFile: jest.fn(),
  continueMerge: jest.fn(),
  abortConflictResolution: jest.fn()
}));

const { ipcMain } = require('electron');
const {
  getCollectionGitRootPath,
  getCollectionGitData,
  getChangedFilesInCollectionGit,
  getAheadBehindCount,
  fetchRemotes,
  listStashes
} = require('../utils/git');
const { registerGitUiIpc, buildCollectionGitState } = require('./git-ui');

describe('buildCollectionGitState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns isGitRepo: false when collection is not in a git repository', async () => {
    getCollectionGitRootPath.mockReturnValue(null);

    const state = await buildCollectionGitState('/tmp/non-git-collection');
    expect(state.isGitRepo).toBe(false);
    expect(state.gitRootPath).toBeNull();
  });

  it('aggregates git status, files, remotes, stashes, logs, and ahead/behind counts', async () => {
    getCollectionGitRootPath.mockReturnValue('/tmp/repo');
    getCollectionGitData.mockResolvedValue({
      gitRootPath: '/tmp/repo',
      gitRepoUrl: 'https://github.com/org/repo.git',
      branches: ['main', 'feat/git-ui'],
      currentGitBranch: 'feat/git-ui',
      defaultGitBranch: 'main',
      logs: [{ hash: 'def5678', message: 'Initial commit' }]
    });
    getChangedFilesInCollectionGit.mockResolvedValue({
      staged: [{ path: 'req.bru', type: 'staged', fileIndex: 'M', working_dir: ' ' }],
      unstaged: [],
      conflicted: [{ path: 'conflict.bru', type: 'conflicted', fileIndex: 'U', working_dir: 'U' }],
      totalFiles: 2,
      tooManyFiles: false
    });
    getAheadBehindCount.mockResolvedValue({
      ahead: 2,
      behind: 1,
      aheadCommits: [],
      behindCommits: []
    });
    fetchRemotes.mockResolvedValue([{ name: 'origin', refs: { fetch: 'https://github.com/org/repo.git' } }]);
    listStashes.mockResolvedValue([{ index: 0, message: 'WIP', hash: 'abc1234' }]);

    const state = await buildCollectionGitState('/tmp/repo');
    expect(state.isGitRepo).toBe(true);
    expect(state.currentGitBranch).toBe('feat/git-ui');
    expect(state.localGitBranches).toEqual(['main', 'feat/git-ui']);
    expect(state.ahead).toBe(2);
    expect(state.behind).toBe(1);
    expect(state.files.staged[0].path).toBe('req.bru');
    expect(state.files.conflicted).toEqual(['conflict.bru']);
  });
});

describe('registerGitUiIpc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers all git UI IPC handlers on ipcMain', () => {
    registerGitUiIpc({});
    const registeredChannels = ipcMain.handle.mock.calls.map(([channel]) => channel);

    expect(registeredChannels).toEqual(
      expect.arrayContaining([
        'renderer:git-get-collection-data',
        'renderer:git-init',
        'renderer:git-stage-changes',
        'renderer:git-unstage-changes',
        'renderer:git-discard-changes',
        'renderer:git-commit-changes',
        'renderer:git-push',
        'renderer:git-pull',
        'renderer:git-fetch',
        'renderer:git-checkout-branch',
        'renderer:git-checkout-remote-branch',
        'renderer:git-fetch-remote-branches',
        'renderer:git-get-remotes',
        'renderer:git-add-remote',
        'renderer:git-remove-remote',
        'renderer:git-get-file-diff',
        'renderer:git-create-stash',
        'renderer:git-list-stashes',
        'renderer:git-apply-stash',
        'renderer:git-drop-stash',
        'renderer:git-get-stash-files',
        'renderer:git-get-stash-file-diff',
        'renderer:git-get-logs',
        'renderer:git-get-commit-files',
        'renderer:git-get-commit-file-diff',
        'renderer:git-get-conflicted-file',
        'renderer:git-resolve-conflict-file',
        'renderer:git-continue-merge',
        'renderer:git-abort-merge'
      ])
    );
  });
});
