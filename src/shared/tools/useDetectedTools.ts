import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';

/** Mirrors Rust `services::tools::DetectedTool`. */
export const detectedToolSchema = z.object({
  id: z.string(),
  label: z.string(),
  installed: z.boolean(),
});
export type DetectedTool = z.infer<typeof detectedToolSchema>;

/** Installed developer tools — path checks in Rust, nothing executed. */
export function useDetectedTools() {
  return useQuery({
    queryKey: ['system', 'tools'],
    queryFn: () => ipc(CMD.SYSTEM_DETECT_TOOLS, undefined, z.array(detectedToolSchema)),
    staleTime: 5 * 60_000,
  });
}
