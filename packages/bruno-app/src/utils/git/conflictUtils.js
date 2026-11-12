export const CONFLICT_RESOLUTION = Object.freeze({
  CURRENT: 'current',
  INCOMING: 'incoming',
  BOTH: 'both',
  CUSTOM: 'custom'
});

const isSeparatorLine = (line) => line === '=======' || line === '=======\r';

/**
 * Parses a file's text into alternating 'normal' and 'conflict' segments.
 * Supports both standard 2-way and diff3 (|||||||) conflict markers,
 * and preserves the file's original line ending (CRLF vs LF).
 */
export const parseConflictFile = (content = '') => {
  if (typeof content !== 'string' || !content.length) {
    return [];
  }

  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const segments = [];
  let normalLines = [];
  let conflictIndex = 0;

  let state = 'normal'; // 'normal' | 'current' | 'base' | 'incoming'
  let currentHeader = '';
  let incomingHeader = '';
  let currentLines = [];
  let baseLines = [];
  let incomingLines = [];
  let rawConflictLines = [];

  const flushNormal = () => {
    if (normalLines.length > 0) {
      segments.push({
        type: 'normal',
        id: `normal-${segments.length}`,
        eol,
        content: normalLines.join(eol)
      });
      normalLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (state === 'normal') {
      if (line.startsWith('<<<<<<<')) {
        flushNormal();
        state = 'current';
        currentHeader = line.slice(7).trim() || 'Current (Ours)';
        currentLines = [];
        baseLines = [];
        incomingLines = [];
        rawConflictLines = [line];
      } else {
        normalLines.push(line);
      }
    } else if (state === 'current') {
      rawConflictLines.push(line);
      if (line.startsWith('|||||||')) {
        state = 'base';
      } else if (isSeparatorLine(line)) {
        state = 'incoming';
      } else {
        currentLines.push(line);
      }
    } else if (state === 'base') {
      rawConflictLines.push(line);
      if (isSeparatorLine(line)) {
        state = 'incoming';
      } else {
        baseLines.push(line);
      }
    } else if (state === 'incoming') {
      rawConflictLines.push(line);
      if (line.startsWith('>>>>>>>')) {
        incomingHeader = line.slice(7).trim() || 'Incoming (Theirs)';
        segments.push({
          type: 'conflict',
          id: `conflict-${conflictIndex}`,
          index: conflictIndex,
          eol,
          currentHeader,
          incomingHeader,
          currentLineCount: currentLines.length,
          incomingLineCount: incomingLines.length,
          currentContent: currentLines.join(eol),
          baseContent: baseLines.join(eol),
          incomingContent: incomingLines.join(eol),
          rawContent: rawConflictLines.join(eol),
          resolution: null,
          resolvedContent: null,
          resolvedEmpty: false
        });
        conflictIndex += 1;
        state = 'normal';
      } else {
        incomingLines.push(line);
      }
    }
  }

  // If file ended mid-conflict (malformed markers), treat remaining lines as normal
  if (state !== 'normal' && rawConflictLines.length > 0) {
    normalLines.push(...rawConflictLines);
  }
  flushNormal();

  return segments;
};

export const computeResolvedHunkContent = (hunk, resolutionType, customContent = '') => {
  const eol = hunk?.eol || '\n';
  switch (resolutionType) {
    case CONFLICT_RESOLUTION.CURRENT:
      return hunk.currentContent;
    case CONFLICT_RESOLUTION.INCOMING:
      return hunk.incomingContent;
    case CONFLICT_RESOLUTION.BOTH: {
      const hasCurrent = (hunk.currentLineCount ?? (hunk.currentContent ? 1 : 0)) > 0;
      const hasIncoming = (hunk.incomingLineCount ?? (hunk.incomingContent ? 1 : 0)) > 0;
      if (!hasCurrent) return hunk.incomingContent;
      if (!hasIncoming) return hunk.currentContent;
      return `${hunk.currentContent}${eol}${hunk.incomingContent}`;
    }
    case CONFLICT_RESOLUTION.CUSTOM:
      return customContent;
    default:
      return null;
  }
};

const isResolutionZeroLines = (hunk, resolutionType) => {
  if (resolutionType === CONFLICT_RESOLUTION.CURRENT) {
    return (hunk.currentLineCount ?? (hunk.currentContent ? 1 : 0)) === 0;
  }
  if (resolutionType === CONFLICT_RESOLUTION.INCOMING) {
    return (hunk.incomingLineCount ?? (hunk.incomingContent ? 1 : 0)) === 0;
  }
  if (resolutionType === CONFLICT_RESOLUTION.BOTH) {
    const cCount = hunk.currentLineCount ?? (hunk.currentContent ? 1 : 0);
    const iCount = hunk.incomingLineCount ?? (hunk.incomingContent ? 1 : 0);
    return cCount === 0 && iCount === 0;
  }
  return false;
};

export const applyConflictResolution = (segments, conflictId, resolutionType, customContent = '') => {
  return (segments || []).map((segment) => {
    if (segment.type !== 'conflict' || segment.id !== conflictId) {
      return segment;
    }

    if (!resolutionType) {
      return {
        ...segment,
        resolution: null,
        resolvedContent: null,
        resolvedEmpty: false
      };
    }

    return {
      ...segment,
      resolution: resolutionType,
      resolvedContent: computeResolvedHunkContent(segment, resolutionType, customContent),
      resolvedEmpty: isResolutionZeroLines(segment, resolutionType)
    };
  });
};

export const applyResolutionToAllConflicts = (segments, resolutionType) => {
  return (segments || []).map((segment) => {
    if (segment.type !== 'conflict') {
      return segment;
    }
    return {
      ...segment,
      resolution: resolutionType,
      resolvedContent: computeResolvedHunkContent(segment, resolutionType),
      resolvedEmpty: isResolutionZeroLines(segment, resolutionType)
    };
  });
};

export const serializeConflictSegments = (segments = []) => {
  if (!segments.length) return '';
  const eol = segments[0]?.eol || '\n';

  return segments
    .filter((segment) => !(segment.type === 'conflict' && segment.resolution !== null && segment.resolvedEmpty))
    .map((segment) => {
      if (segment.type === 'normal') {
        return segment.content;
      }
      if (segment.resolution !== null && segment.resolvedContent !== null) {
        return segment.resolvedContent;
      }
      return segment.rawContent;
    })
    .join(eol);
};

export const hasUnresolvedConflicts = (content = '') => {
  if (typeof content !== 'string' || !content.length) return false;
  const segments = parseConflictFile(content);
  if (segments.some((s) => s.type === 'conflict')) {
    return true;
  }
  return /^(<{7}|={7}|\|{7}|>{7})(\r?\n|\s|$)/m.test(content);
};
