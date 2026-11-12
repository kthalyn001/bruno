import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { IconCheck, IconAlertTriangle, IconCode, IconEye, IconRotateClockwise } from '@tabler/icons';
import {
  CONFLICT_RESOLUTION,
  parseConflictFile,
  applyConflictResolution,
  applyResolutionToAllConflicts,
  serializeConflictSegments,
  hasUnresolvedConflicts
} from 'utils/git/conflictUtils';
import { getCollectionConflictedFile, resolveCollectionConflictedFile } from 'utils/git/actions';

const StyledConflictWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .conflict-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.bg};
    flex-wrap: wrap;
  }

  .conflict-file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;

    .filepath {
      font-family: monospace;
      font-weight: 600;
    }

    .conflict-count-badge {
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;

      &.resolved {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }
    }
  }

  .conflict-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .conflict-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.sidebar.bg};
    color: ${(props) => props.theme.text};
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.border.border2};
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.primary {
      background: #22c55e;
      border-color: #16a34a;
      color: #fff;
      font-weight: 500;
    }
  }

  .conflict-body {
    flex: 1;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .normal-segment {
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    padding: 8px 10px;
    background: ${(props) => props.theme.sidebar.bg};
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    opacity: 0.8;
  }

  .conflict-card {
    border: 1px solid rgba(245, 158, 11, 0.45);
    border-radius: ${(props) => props.theme.border.radius.base};
    overflow: hidden;

    &.is-resolved {
      border-color: rgba(34, 197, 94, 0.45);
    }
  }

  .conflict-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    background: rgba(245, 158, 11, 0.1);
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    font-size: 11px;

    &.is-resolved {
      background: rgba(34, 197, 94, 0.1);
    }
  }

  .conflict-panes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: ${(props) => props.theme.border.border1};
  }

  .conflict-pane {
    background: ${(props) => props.theme.bg};
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .pane-label {
      font-size: 11px;
      font-weight: 600;
      opacity: 0.75;
    }

    pre {
      margin: 0;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
      padding: 6px;
      border-radius: 4px;
    }

    &.current pre {
      background: rgba(59, 130, 246, 0.1);
    }

    &.incoming pre {
      background: rgba(168, 85, 247, 0.1);
    }
  }

  .resolved-preview {
    padding: 8px 10px;
    background: rgba(34, 197, 94, 0.08);
    border-top: 1px solid ${(props) => props.theme.border.border1};

    .preview-label {
      font-size: 11px;
      font-weight: 600;
      color: #22c55e;
      margin-bottom: 4px;
    }

    pre {
      margin: 0;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }

  .raw-editor {
    width: 100%;
    height: 100%;
    min-height: 320px;
    font-family: monospace;
    font-size: 12px;
    padding: 10px;
    background: ${(props) => props.theme.sidebar.bg};
    color: ${(props) => props.theme.text};
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    resize: none;
  }
`;

const ConflictResolver = ({ collectionUid, filePath, onResolved }) => {
  const dispatch = useDispatch();
  const [segments, setSegments] = useState([]);
  const [rawContent, setRawContent] = useState('');
  const [editorMode, setEditorMode] = useState('visual'); // 'visual' | 'raw'
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!collectionUid || !filePath) return;
    let cancelled = false;
    setIsLoading(true);
    dispatch(getCollectionConflictedFile(collectionUid, { filePath }))
      .then((res) => {
        if (cancelled) return;
        const content = res?.content || '';
        setRawContent(content);
        setSegments(parseConflictFile(content));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load conflicted file');
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, collectionUid, filePath]);

  const conflictSegments = useMemo(
    () => segments.filter((s) => s.type === 'conflict'),
    [segments]
  );

  const resolvedConflictCount = useMemo(
    () => conflictSegments.filter((s) => s.resolution !== null).length,
    [conflictSegments]
  );

  const allVisualResolved = conflictSegments.length > 0 && resolvedConflictCount === conflictSegments.length;
  const canSave = editorMode === 'visual'
    ? (conflictSegments.length === 0 || allVisualResolved)
    : !hasUnresolvedConflicts(rawContent);

  const handleChooseHunk = (conflictId, resolutionType) => {
    setSegments((prev) => {
      const next = applyConflictResolution(prev, conflictId, resolutionType);
      setRawContent(serializeConflictSegments(next));
      return next;
    });
  };

  const handleChooseAll = (resolutionType) => {
    setSegments((prev) => {
      const next = applyResolutionToAllConflicts(prev, resolutionType);
      setRawContent(serializeConflictSegments(next));
      return next;
    });
  };

  const handleSwitchMode = (nextMode) => {
    if (nextMode === 'raw' && editorMode === 'visual') {
      setRawContent(serializeConflictSegments(segments));
    } else if (nextMode === 'visual' && editorMode === 'raw') {
      setSegments(parseConflictFile(rawContent));
    }
    setEditorMode(nextMode);
  };

  const handleSaveResolved = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    try {
      const finalContent = editorMode === 'visual' ? serializeConflictSegments(segments) : rawContent;
      await dispatch(
        resolveCollectionConflictedFile(collectionUid, {
          filePath,
          content: finalContent,
          stage: true
        })
      );
      toast.success(`Resolved conflicts in ${filePath}`);
      onResolved?.(filePath);
    } catch (error) {
      toast.error(error?.message || 'Failed to save resolved file');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <StyledConflictWrapper>
        <div className="p-6 text-xs opacity-60">Loading conflict details...</div>
      </StyledConflictWrapper>
    );
  }

  return (
    <StyledConflictWrapper data-testid="git-conflict-resolver">
      <div className="conflict-toolbar">
        <div className="conflict-file-info">
          <IconAlertTriangle size={15} className="text-amber-500" />
          <span className="filepath">{filePath}</span>
          {editorMode === 'visual' && conflictSegments.length > 0 && (
            <span className={`conflict-count-badge ${allVisualResolved ? 'resolved' : ''}`}>
              {resolvedConflictCount} / {conflictSegments.length} resolved
            </span>
          )}
        </div>

        <div className="conflict-actions">
          {editorMode === 'visual' && conflictSegments.length > 0 && (
            <>
              <button
                type="button"
                className="conflict-btn"
                onClick={() => handleChooseAll(CONFLICT_RESOLUTION.CURRENT)}
                data-testid="conflict-accept-all-current"
              >
                Accept All Current
              </button>
              <button
                type="button"
                className="conflict-btn"
                onClick={() => handleChooseAll(CONFLICT_RESOLUTION.INCOMING)}
                data-testid="conflict-accept-all-incoming"
              >
                Accept All Incoming
              </button>
              <button
                type="button"
                className="conflict-btn"
                onClick={() => handleChooseAll(CONFLICT_RESOLUTION.BOTH)}
                data-testid="conflict-accept-all-both"
              >
                Accept All Both
              </button>
            </>
          )}

          <button
            type="button"
            className="conflict-btn"
            onClick={() => handleSwitchMode(editorMode === 'visual' ? 'raw' : 'visual')}
            data-testid="conflict-toggle-editor-mode"
          >
            {editorMode === 'visual' ? (
              <>
                <IconCode size={13} />
                <span>Raw Editor</span>
              </>
            ) : (
              <>
                <IconEye size={13} />
                <span>Visual Editor</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="conflict-btn primary"
            disabled={!canSave || isSaving}
            onClick={handleSaveResolved}
            data-testid="conflict-save-resolved"
          >
            <IconCheck size={13} />
            <span>{isSaving ? 'Saving...' : 'Mark as Resolved'}</span>
          </button>
        </div>
      </div>

      <div className="conflict-body">
        {editorMode === 'raw' ? (
          <textarea
            className="raw-editor"
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            spellCheck={false}
            data-testid="conflict-raw-textarea"
          />
        ) : (
          segments.map((segment) => {
            if (segment.type === 'normal') {
              return (
                <div key={segment.id} className="normal-segment">
                  {segment.content}
                </div>
              );
            }

            const isResolved = segment.resolution !== null;

            return (
              <div
                key={segment.id}
                className={`conflict-card ${isResolved ? 'is-resolved' : ''}`}
                data-testid={`conflict-hunk-${segment.index}`}
              >
                <div className={`conflict-card-header ${isResolved ? 'is-resolved' : ''}`}>
                  <span className="font-semibold">
                    Conflict #{segment.index + 1}
                    {isResolved ? ` — Resolved (${segment.resolution})` : ' — Unresolved'}
                  </span>
                  <div className="conflict-actions">
                    <button
                      type="button"
                      className="conflict-btn"
                      onClick={() => handleChooseHunk(segment.id, CONFLICT_RESOLUTION.CURRENT)}
                      data-testid={`conflict-hunk-${segment.index}-accept-current`}
                    >
                      Accept Current
                    </button>
                    <button
                      type="button"
                      className="conflict-btn"
                      onClick={() => handleChooseHunk(segment.id, CONFLICT_RESOLUTION.INCOMING)}
                      data-testid={`conflict-hunk-${segment.index}-accept-incoming`}
                    >
                      Accept Incoming
                    </button>
                    <button
                      type="button"
                      className="conflict-btn"
                      onClick={() => handleChooseHunk(segment.id, CONFLICT_RESOLUTION.BOTH)}
                      data-testid={`conflict-hunk-${segment.index}-accept-both`}
                    >
                      Accept Both
                    </button>
                    {isResolved && (
                      <button
                        type="button"
                        className="conflict-btn"
                        onClick={() => handleChooseHunk(segment.id, null)}
                        title="Reset resolution"
                      >
                        <IconRotateClockwise size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="conflict-panes">
                  <div className="conflict-pane current">
                    <div className="pane-label">Current ({segment.currentHeader})</div>
                    <pre>{segment.currentContent || '(empty)'}</pre>
                  </div>
                  <div className="conflict-pane incoming">
                    <div className="pane-label">Incoming ({segment.incomingHeader})</div>
                    <pre>{segment.incomingContent || '(empty)'}</pre>
                  </div>
                </div>

                {isResolved && (
                  <div className="resolved-preview" data-testid={`conflict-hunk-${segment.index}-resolved`}>
                    <div className="preview-label">Result</div>
                    <pre>{segment.resolvedContent}</pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </StyledConflictWrapper>
  );
};

export default ConflictResolver;
