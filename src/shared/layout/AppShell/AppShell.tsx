import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { NavRail } from '@/shared/layout/NavRail';
import { Header } from '@/shared/layout/Header';
import { ActivityBar } from '@/shared/layout/ActivityBar';
import { CommandDialog } from '@/shared/layout/CommandDialog';

interface AppShellProps {
  /** Bottom slot (the terminal drawer) */
  footer?: ReactNode;
}

export const AppShell = ({ children, footer }: PropsWithChildren<AppShellProps>) => {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <div className="box-border flex h-screen min-h-screen w-screen gap-5 overflow-hidden p-4 font-sans text-foreground ground">
      {/* Floating 64px icon rail with top window controls clearance */}
      <div className="flex h-full shrink-0 flex-col">
        {/* Window drag spacer to clear native macOS traffic lights (close/minimize/zoom) */}
        <div data-tauri-drag-region className="h-8 w-16 shrink-0" />
        <NavRail />
      </div>

      {/* Main column: Header row + Content + Activity bar + Terminal drawer */}
      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* Smoked glass header with search pill & controls (drag region) */}
        <Header onOpenCommand={() => setCommandOpen(true)} />

        {/* Dynamic page content container */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
          <ActivityBar />
        </div>

        {/* Terminal drawer */}
        {footer}
      </main>

      {/* Global ⌘K Command Dialog with Command Dial */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
};
