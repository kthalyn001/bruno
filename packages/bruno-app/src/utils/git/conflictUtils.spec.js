import {
  CONFLICT_RESOLUTION,
  parseConflictFile,
  applyConflictResolution,
  applyResolutionToAllConflicts,
  serializeConflictSegments,
  hasUnresolvedConflicts
} from './conflictUtils';

const SAMPLE_CONFLICT_BRU = `meta {
  name: Get Users
  type: http
  seq: 1
}

get {
<<<<<<< HEAD
  url: https://api.staging.example.com/users
=======
  url: https://api.prod.example.com/users
>>>>>>> origin/main
  body: none
  auth: none
}`;

describe('conflictUtils', () => {
  it('detects unresolved conflict markers', () => {
    expect(hasUnresolvedConflicts(SAMPLE_CONFLICT_BRU)).toBe(true);
    expect(hasUnresolvedConflicts('meta {\n  name: Clean\n}')).toBe(false);
  });

  it('parses a conflicted file into normal and conflict segments', () => {
    const segments = parseConflictFile(SAMPLE_CONFLICT_BRU);
    const conflictSegments = segments.filter((s) => s.type === 'conflict');

    expect(conflictSegments).toHaveLength(1);
    expect(conflictSegments[0]).toMatchObject({
      currentHeader: 'HEAD',
      incomingHeader: 'origin/main',
      currentContent: '  url: https://api.staging.example.com/users',
      incomingContent: '  url: https://api.prod.example.com/users',
      resolution: null
    });
  });

  it('resolves conflict hunks with CURRENT, INCOMING, and BOTH', () => {
    const segments = parseConflictFile(SAMPLE_CONFLICT_BRU);
    const conflictId = segments.find((s) => s.type === 'conflict').id;

    const currentResolved = serializeConflictSegments(
      applyConflictResolution(segments, conflictId, CONFLICT_RESOLUTION.CURRENT)
    );
    expect(hasUnresolvedConflicts(currentResolved)).toBe(false);
    expect(currentResolved).toContain('url: https://api.staging.example.com/users');
    expect(currentResolved).not.toContain('url: https://api.prod.example.com/users');

    const incomingResolved = serializeConflictSegments(
      applyConflictResolution(segments, conflictId, CONFLICT_RESOLUTION.INCOMING)
    );
    expect(hasUnresolvedConflicts(incomingResolved)).toBe(false);
    expect(incomingResolved).toContain('url: https://api.prod.example.com/users');
    expect(incomingResolved).not.toContain('url: https://api.staging.example.com/users');

    const bothResolved = serializeConflictSegments(
      applyResolutionToAllConflicts(segments, CONFLICT_RESOLUTION.BOTH)
    );
    expect(hasUnresolvedConflicts(bothResolved)).toBe(false);
    expect(bothResolved).toContain('url: https://api.staging.example.com/users');
    expect(bothResolved).toContain('url: https://api.prod.example.com/users');
  });

  it('does not treat longer runs of equals signs (e.g. Markdown underlines) as conflict separators', () => {
    const markdownConflict = [
      '<<<<<<< HEAD',
      'Heading',
      '========',
      'Body line',
      '=======',
      'Incoming heading',
      '>>>>>>> branch'
    ].join('\n');

    const segments = parseConflictFile(markdownConflict);
    const conflict = segments.find((s) => s.type === 'conflict');
    expect(conflict.currentContent).toBe('Heading\n========\nBody line');
    expect(conflict.incomingContent).toBe('Incoming heading');

    const resolved = serializeConflictSegments(
      applyConflictResolution(segments, conflict.id, CONFLICT_RESOLUTION.CURRENT)
    );
    expect(resolved).toBe('Heading\n========\nBody line');
  });

  it('omits empty 0-line resolved side without inserting a blank line and preserves CRLF line endings', () => {
    const crlfEmptyCurrent = ['head', '<<<<<<< HEAD', '=======', 'middle', '>>>>>>> branch', 'tail'].join('\r\n');
    const segments = parseConflictFile(crlfEmptyCurrent);
    const conflict = segments.find((s) => s.type === 'conflict');

    const resolvedEmptySide = serializeConflictSegments(
      applyConflictResolution(segments, conflict.id, CONFLICT_RESOLUTION.CURRENT)
    );
    expect(resolvedEmptySide).toBe('head\r\ntail');

    const resolvedNonEmptySide = serializeConflictSegments(
      applyConflictResolution(segments, conflict.id, CONFLICT_RESOLUTION.INCOMING)
    );
    expect(resolvedNonEmptySide).toBe('head\r\nmiddle\r\ntail');
  });
});
