import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { IconBrandGit, IconGitBranch } from '@tabler/icons';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { refreshCollectionGitData } from 'utils/git/actions';
import ToolHint from 'components/ToolHint';
import ActionIcon from 'ui/ActionIcon';

const CollectionGitButton = ({ collection }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!collection?.uid || !collection?.pathname) return;
    dispatch(refreshCollectionGitData(collection.uid));
  }, [dispatch, collection?.uid, collection?.pathname]);

  if (!collection?.uid) {
    return null;
  }

  const gitRootPath = collection?.git?.gitRootPath;
  const isGitRepo = Boolean(collection?.git?.isGitRepo || gitRootPath);
  const currentGitBranch = collection?.git?.currentGitBranch;
  const gitChangedCount = (collection?.git?.files?.staged?.length || 0)
    + (collection?.git?.files?.unstaged?.length || 0)
    + (collection?.git?.files?.conflicted?.length || 0);
  const gitHasConflicts = (collection?.git?.files?.conflicted?.length || 0) > 0;

  const openGitTab = () => {
    dispatch(
      addTab({
        uid: `${collection.uid}-git`,
        collectionUid: collection.uid,
        type: 'git'
      })
    );
  };

  if (isGitRepo) {
    return (
      <div
        className="migrate-yml-pill"
        data-testid="collection-git-button"
        title={gitHasConflicts ? 'Git merge conflicts detected' : `Git branch: ${currentGitBranch || 'main'}`}
      >
        <button type="button" className="pill-main" onClick={openGitTab}>
          <IconGitBranch size={13} strokeWidth={1.5} />
          <span className="pill-label">{currentGitBranch || 'main'}</span>
          {gitChangedCount > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{
                backgroundColor: gitHasConflicts ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.16)',
                color: gitHasConflicts ? '#f59e0b' : '#3b82f6'
              }}
            >
              {gitChangedCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <ToolHint text="Git" toolhintId="GitToolhintId" place="bottom">
      <ActionIcon onClick={openGitTab} aria-label="Git" size="sm" data-testid="collection-git-button">
        <IconBrandGit size={16} strokeWidth={1.5} />
      </ActionIcon>
    </ToolHint>
  );
};

export default CollectionGitButton;
