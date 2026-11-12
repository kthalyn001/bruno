import React, { useState, useMemo } from 'react';
import isEqual from 'lodash/isEqual';
import get from 'lodash/get';
import styled from 'styled-components';
import { IconEye, IconCode } from '@tabler/icons';
import VisualDiffUrlBar from 'components/Git/VisualDiffViewer/VisualDiffUrlBar';
import VisualDiffParams from 'components/Git/VisualDiffViewer/VisualDiffParams';
import VisualDiffHeaders from 'components/Git/VisualDiffViewer/VisualDiffHeaders';
import VisualDiffAuth from 'components/Git/VisualDiffViewer/VisualDiffAuth';
import VisualDiffBody from 'components/Git/VisualDiffViewer/VisualDiffBody';
import VisualDiffContent from 'components/Git/VisualDiffViewer/VisualDiffContent/index';

const StyledDiffWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .diff-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.bg};
    flex-shrink: 0;
  }

  .diff-filepath {
    font-family: monospace;
    font-size: 12px;
    font-weight: 500;
    color: ${(props) => props.theme.text};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-mode-toggle {
    display: inline-flex;
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    overflow: hidden;

    button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      font-size: 11px;
      color: ${(props) => props.theme.colors.text.muted};
      background: transparent;
      border: none;
      cursor: pointer;

      &.active {
        background: ${(props) => props.theme.sidebar.bg};
        color: ${(props) => props.theme.text};
        font-weight: 500;
      }
    }
  }

  .diff-body-container {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  .text-diff-table {
    width: 100%;
    border-collapse: collapse;
    font-family: monospace;
    font-size: 12px;
    line-height: 1.5;
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    overflow: hidden;
  }

  .diff-line {
    display: flex;
    white-space: pre-wrap;
    word-break: break-all;
    padding: 1px 8px;

    &.added {
      background: rgba(34, 197, 94, 0.14);
      color: ${(props) => props.theme.status?.success?.text || '#22c55e'};
    }

    &.deleted {
      background: rgba(239, 68, 68, 0.14);
      color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
    }

    &.hunk {
      background: rgba(59, 130, 246, 0.1);
      color: ${(props) => props.theme.colors.text.muted};
      font-weight: 500;
      padding: 3px 8px;
    }

    &.meta {
      color: ${(props) => props.theme.colors.text.muted};
      opacity: 0.75;
    }
  }

  .line-num {
    width: 40px;
    flex-shrink: 0;
    user-select: none;
    opacity: 0.45;
    text-align: right;
    padding-right: 10px;
  }

  .line-content {
    flex: 1;
  }
`;

const gitDiffSectionDataPaths = {
  url: ['request.url', 'request.method'],
  params: 'request.params',
  headers: 'request.headers',
  auth: 'request.auth',
  body: 'request.body'
};

const gitSectionHasChanges = (sectionKey, oldData, newData) => {
  const paths = gitDiffSectionDataPaths[sectionKey];
  if (Array.isArray(paths)) {
    return paths.some((p) => !isEqual(get(oldData, p), get(newData, p)));
  }
  return !isEqual(get(oldData, paths), get(newData, paths));
};

const gitDiffHasContent = {
  url: (data) => Boolean(data?.request?.url || data?.request?.method),
  params: (data) => Boolean(data?.request?.params?.length > 0),
  headers: (data) => Boolean(data?.request?.headers?.length > 0),
  auth: (data) => Boolean(data?.request?.auth?.mode && data.request.auth.mode !== 'none'),
  body: (data) => {
    if (!data?.request?.body) return false;
    const mode = data.request.body.mode;
    if (!mode || mode === 'none') return false;
    return Boolean(
      data.request.body.json
      || data.request.body.text
      || data.request.body.xml
      || data.request.body.graphql
      || data.request.body.formUrlEncoded?.length > 0
      || data.request.body.multipartForm?.length > 0
    );
  }
};

const gitDiffSections = [
  { key: 'url', title: 'URL', Component: VisualDiffUrlBar, hasContent: gitDiffHasContent.url },
  { key: 'params', title: 'Parameters', Component: VisualDiffParams, hasContent: gitDiffHasContent.params },
  { key: 'headers', title: 'Headers', Component: VisualDiffHeaders, hasContent: gitDiffHasContent.headers },
  { key: 'auth', title: 'Authentication', Component: VisualDiffAuth, hasContent: gitDiffHasContent.auth },
  { key: 'body', title: 'Body', Component: VisualDiffBody, hasContent: gitDiffHasContent.body }
];

const parseUnifiedDiffLines = (textDiff = '') => {
  if (!textDiff) return [];
  const rawLines = textDiff.split('\n');
  let oldLine = 0;
  let newLine = 0;

  return rawLines.map((line, idx) => {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
      return { key: idx, type: 'meta', oldNum: '', newNum: '', text: line };
    }
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      return { key: idx, type: 'hunk', oldNum: '...', newNum: '...', text: line };
    }
    if (line.startsWith('+')) {
      const currentNew = newLine++;
      return { key: idx, type: 'added', oldNum: '', newNum: currentNew || '', text: line };
    }
    if (line.startsWith('-')) {
      const currentOld = oldLine++;
      return { key: idx, type: 'deleted', oldNum: currentOld || '', newNum: '', text: line };
    }
    const currentOld = oldLine ? oldLine++ : '';
    const currentNew = newLine ? newLine++ : '';
    return { key: idx, type: 'context', oldNum: currentOld, newNum: currentNew, text: line };
  });
};

const GitDiffViewer = ({ filePath, textDiff, visualDiff, oldLabel = 'Before', newLabel = 'After' }) => {
  const hasVisualDiff = Boolean(visualDiff?.oldParsed || visualDiff?.newParsed);
  const [viewMode, setViewMode] = useState('visual');

  const activeMode = hasVisualDiff && viewMode === 'visual' ? 'visual' : 'text';
  const parsedLines = useMemo(() => parseUnifiedDiffLines(textDiff), [textDiff]);

  return (
    <StyledDiffWrapper data-testid="git-diff-viewer">
      <div className="diff-toolbar">
        <span className="diff-filepath" title={filePath}>{filePath}</span>
        {hasVisualDiff && (
          <div className="diff-mode-toggle">
            <button
              type="button"
              className={activeMode === 'visual' ? 'active' : ''}
              onClick={() => setViewMode('visual')}
              data-testid="git-diff-mode-visual"
            >
              <IconEye size={13} strokeWidth={1.5} />
              <span>Visual</span>
            </button>
            <button
              type="button"
              className={activeMode === 'text' ? 'active' : ''}
              onClick={() => setViewMode('text')}
              data-testid="git-diff-mode-text"
            >
              <IconCode size={13} strokeWidth={1.5} />
              <span>Text</span>
            </button>
          </div>
        )}
      </div>

      <div className="diff-body-container">
        {activeMode === 'visual' ? (
          <VisualDiffContent
            oldData={visualDiff?.oldParsed}
            newData={visualDiff?.newParsed}
            sections={gitDiffSections}
            sectionHasChanges={gitSectionHasChanges}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        ) : parsedLines.length > 0 ? (
          <div className="text-diff-table" data-testid="git-text-diff">
            {parsedLines.map((row) => (
              <div key={row.key} className={`diff-line ${row.type}`}>
                <span className="line-num">{row.oldNum}</span>
                <span className="line-num">{row.newNum}</span>
                <span className="line-content">{row.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs opacity-60 py-8 text-center">No diff changes to display</div>
        )}
      </div>
    </StyledDiffWrapper>
  );
};

export default GitDiffViewer;
