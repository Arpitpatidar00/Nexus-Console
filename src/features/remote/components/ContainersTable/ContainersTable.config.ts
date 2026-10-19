import type { Container } from '@/features/remote/api/remote.schema';
import type { ServiceStatus } from '@/shared/ui/StatusChip';

/** Docker state + health → the shared status chip's tone and an honest
 * label. Unhealthy and restarting are the only red ones. */
export function containerChip(c: Container): { status: ServiceStatus; label: string } {
  if (c.state === 'restarting') return { status: 'error', label: 'Restarting' };
  if (c.state === 'running') {
    if (c.health === 'unhealthy') return { status: 'error', label: 'Unhealthy' };
    if (c.health === 'starting') return { status: 'starting', label: 'Starting' };
    return { status: 'running', label: c.health === 'healthy' ? 'Healthy' : 'Running' };
  }
  if (c.state === 'exited') {
    return c.exitCode && c.exitCode !== 0
      ? { status: 'notInstalled', label: `Exited (${c.exitCode})` }
      : { status: 'stopped', label: 'Exited' };
  }
  if (c.state === 'dead') return { status: 'error', label: 'Dead' };
  return { status: 'stopped', label: c.state.charAt(0).toUpperCase() + c.state.slice(1) };
}
