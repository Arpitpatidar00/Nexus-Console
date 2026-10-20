import type { RemoteHost } from '@/features/remote/api/remote.schema';

export interface HostListProps {
  hosts: RemoteHost[];
  activeId: string | null;
  isLoading?: boolean;
  onSelect: (id: string) => void;
}
