import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  color: ${(props) => props.theme.text};
  background: ${(props) => props.theme.bg};

  .git-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px;
    text-align: center;
    gap: 12px;

    .empty-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${(props) => props.theme.sidebar.bg};
      border: 1px solid ${(props) => props.theme.border.border1};
    }

    h3 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    p {
      font-size: 13px;
      color: ${(props) => props.theme.colors.text.muted};
      max-width: 420px;
      margin: 0;
    }
  }

  .git-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.sidebar.bg};
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .git-header-left,
  .git-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .branch-pill-wrapper {
    position: relative;
  }

  .git-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 500;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.bg};
    color: ${(props) => props.theme.text};
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;

    &:hover:not(:disabled) {
      border-color: ${(props) => props.theme.border.border2};
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &.primary {
      background: ${(props) => props.theme.primary.solid};
      border-color: ${(props) => props.theme.primary.solid};
      color: #fff;
    }

    &.danger {
      color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
      border-color: rgba(239, 68, 68, 0.35);
    }

    .count-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 1px 5px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(59, 130, 246, 0.15);
      color: #3b82f6;
    }
  }

  .branch-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;
    width: 320px;
    background: ${(props) => props.theme.bg};
    border: 1px solid ${(props) => props.theme.border.border1};
    border-radius: ${(props) => props.theme.border.radius.base};
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .branch-popover-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid ${(props) => props.theme.border.border1};
      padding-bottom: 6px;

      button {
        flex: 1;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 500;
        border-radius: 4px;
        border: none;
        background: transparent;
        color: ${(props) => props.theme.colors.text.muted};
        cursor: pointer;

        &.active {
          background: ${(props) => props.theme.sidebar.bg};
          color: ${(props) => props.theme.text};
        }
      }
    }

    .branch-input-row {
      display: flex;
      gap: 6px;

      input {
        flex: 1;
        font-size: 12px;
        padding: 5px 8px;
        border: 1px solid ${(props) => props.theme.input.border};
        border-radius: 4px;
        background: ${(props) => props.theme.input.bg};
        color: ${(props) => props.theme.text};
        outline: none;

        &:focus {
          border-color: ${(props) => props.theme.input.focusBorder};
        }
      }
    }

    .branch-list {
      max-height: 200px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .branch-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        border: none;
        background: transparent;
        color: ${(props) => props.theme.text};
        text-align: left;

        &:hover {
          background: ${(props) => props.theme.sidebar.bg};
        }

        &.current {
          font-weight: 600;
          color: ${(props) => props.theme.primary.solid};
        }
      }
    }
  }

  .git-subtabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 16px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    background: ${(props) => props.theme.bg};
    flex-shrink: 0;

    .subtab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 12px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: ${(props) => props.theme.colors.text.muted};
      cursor: pointer;

      &:hover {
        color: ${(props) => props.theme.text};
      }

      &.active {
        color: ${(props) => props.theme.text};
        border-bottom-color: ${(props) => props.theme.primary.solid};
      }

      .subtab-badge {
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 10px;
        background: ${(props) => props.theme.sidebar.bg};
        border: 1px solid ${(props) => props.theme.border.border1};

        &.conflict {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.35);
        }
      }
    }
  }

  .git-progress-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    font-size: 11px;
    background: rgba(59, 130, 246, 0.08);
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    color: ${(props) => props.theme.text};
  }

  .git-workspace {
    display: grid;
    grid-template-columns: 360px 1fr;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .git-left-pane {
    border-right: 1px solid ${(props) => props.theme.border.border1};
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    background: ${(props) => props.theme.bg};
  }

  .git-right-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: ${(props) => props.theme.bg};
  }

  .git-section {
    padding: 12px;
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .git-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: ${(props) => props.theme.colors.text.muted};

    .section-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }

  .commit-box {
    display: flex;
    flex-direction: column;
    gap: 8px;

    textarea {
      width: 100%;
      min-height: 68px;
      padding: 8px;
      font-size: 12px;
      border-radius: ${(props) => props.theme.border.radius.base};
      border: 1px solid ${(props) => props.theme.input.border};
      background: ${(props) => props.theme.input.bg};
      color: ${(props) => props.theme.text};
      resize: vertical;
      outline: none;

      &:focus {
        border-color: ${(props) => props.theme.input.focusBorder};
      }
    }

    .commit-actions {
      display: flex;
      gap: 6px;

      button {
        flex: 1;
        justify-content: center;
      }
    }
  }

  .conflict-banner {
    background: rgba(245, 158, 11, 0.08);
    border-bottom: 1px solid rgba(245, 158, 11, 0.35);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .conflict-banner-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: #f59e0b;
    }
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;

    &:hover {
      background: ${(props) => props.theme.sidebar.bg};
    }

    &.selected {
      background: ${(props) => props.theme.sidebar.bg};
      outline: 1px solid ${(props) => props.theme.border.border2};
    }

    .file-row-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }

    .file-path {
      font-family: monospace;
      font-size: 11.5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-status-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;

      &.M {
        background: rgba(245, 158, 11, 0.16);
        color: #f59e0b;
      }
      &.A,
      &.U {
        background: rgba(34, 197, 94, 0.16);
        color: #22c55e;
      }
      &.D {
        background: rgba(239, 68, 68, 0.16);
        color: #ef4444;
      }
      &.R {
        background: rgba(59, 130, 246, 0.16);
        color: #3b82f6;
      }
      &.C {
        background: rgba(245, 158, 11, 0.22);
        color: #f59e0b;
      }
    }

    .file-row-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 5px;
        font-size: 11px;
        border-radius: 3px;
        border: 1px solid ${(props) => props.theme.border.border1};
        background: ${(props) => props.theme.bg};
        color: ${(props) => props.theme.text};
        cursor: pointer;

        &:hover {
          border-color: ${(props) => props.theme.border.border2};
        }
      }
    }
  }

  .list-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.border.border1};
    cursor: pointer;

    &:hover {
      background: ${(props) => props.theme.sidebar.bg};
    }

    &.selected {
      background: ${(props) => props.theme.sidebar.bg};
      border-color: ${(props) => props.theme.primary.solid};
    }

    .card-title {
      font-size: 12px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: ${(props) => props.theme.colors.text.muted};
      gap: 6px;
    }
  }

  .form-input {
    font-size: 12px;
    padding: 6px 8px;
    border-radius: ${(props) => props.theme.border.radius.base};
    border: 1px solid ${(props) => props.theme.input.border};
    background: ${(props) => props.theme.input.bg};
    color: ${(props) => props.theme.text};
    outline: none;

    &:focus {
      border-color: ${(props) => props.theme.input.focusBorder};
    }
  }
`;

export default StyledWrapper;
