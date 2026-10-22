import { useAppDispatch } from '@/shared/state/hooks';
import { openTerminal } from '@/shared/state/terminalsSlice';
import { useIpcEvent } from '@/shared/tauri';

interface WorkspaceCommand {
  name: string;
  command: string;
  projectPath: string;
}

/** Starting a workspace emits one event per saved command — Rust reported
 * them as "Launched terminal" while nothing listened. Open each as a tab. */
export function useWorkspaceTerminals() {
  const dispatch = useAppDispatch();
  useIpcEvent<WorkspaceCommand>('workspace_open_terminal', ({ payload }) => {
    dispatch(
      openTerminal({
        target: { type: 'workspace', command: payload.command, projectPath: payload.projectPath },
        title: payload.name,
      }),
    );
  });
}
