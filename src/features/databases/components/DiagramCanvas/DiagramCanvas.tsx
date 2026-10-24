import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, Maximize2, Minus, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/Button';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useSaveExport } from '@/features/databases/api/useExplorer';
import type { Detail, Diagram } from '@/features/databases/utils/diagram';
import { renderSvg, SCREEN_PALETTE } from '@/features/databases/utils/diagramSvg';
import { diagramSvgFile, svgToPngBase64 } from '@/features/databases/utils/exportDiagram';

interface Props {
  diagram: Diagram;
  detail: Detail;
  onDetail: (d: Detail) => void;
  /** File name stem for exports, e.g. `fameo-dev-diagram`. */
  exportName: string;
  /** Title printed on exported files. */
  exportTitle: string;
  /** Mermaid text for the same tables. */
  mermaid: () => string;
  highlight?: ReadonlySet<string>;
  onOpenTable?: (id: string) => void;
  /** Extra controls on the toolbar's right (e.g. a "guessed links" switch). */
  aside?: ReactNode;
  /** One line under the toolbar: counts and legend. */
  footnote?: ReactNode;
}

interface View {
  x: number;
  y: number;
  k: number;
}

const clampK = (k: number) => Math.min(2.5, Math.max(0.08, k));
const itemCls =
  'flex w-full cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-list';

/** Pan (trackpad scroll or drag), pinch or ⌘-scroll to zoom, hover a table to
 * light up its links, click it to open. */
export const DiagramCanvas = ({
  diagram,
  detail,
  onDetail,
  exportName,
  exportTitle,
  mermaid,
  highlight,
  onOpenTable,
  aside,
  footnote,
}: Props) => {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [find, setFind] = useState('');
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );
  const save = useSaveExport();

  const svg = renderSvg(diagram, SCREEN_PALETTE, { highlight });

  const fit = () => {
    const el = box.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const k = clampK(Math.min(1, (cw - 24) / diagram.width, (ch - 24) / diagram.height));
    setView({ k, x: (cw - diagram.width * k) / 2, y: Math.max(12, (ch - diagram.height * k) / 2) });
  };

  // Refit whenever the picture itself changes (new tables, detail level).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [diagram.width, diagram.height]);

  // Wheel must be non-passive to stop the page scrolling behind the canvas.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      setView((v) => {
        if (e.ctrlKey || e.metaKey) {
          const k = clampK(v.k * Math.exp(-e.deltaY * 0.01));
          return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
        }
        return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const el = box.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const k = clampK(v.k * f);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  };

  const centerOn = (id: string) => {
    const n = diagram.nodes.find((x) => x.id === id);
    const el = box.current;
    if (!n || !el) return;
    const k = Math.max(view.k, 0.8);
    setView({
      k,
      x: el.clientWidth / 2 - (n.x + n.w / 2) * k,
      y: el.clientHeight / 2 - (n.y + n.h / 2) * k,
    });
    setHover(id);
  };

  const q = find.trim().toLowerCase();
  const matches = q ? diagram.nodes.filter((n) => n.id.toLowerCase().includes(q)).slice(0, 8) : [];

  const tableAt = (t: EventTarget | null) =>
    (t as Element | null)?.closest?.('[data-table]')?.getAttribute('data-table') ?? null;

  const save1 = (fileName: string, data: string, base64: boolean) =>
    save.mutate(
      { fileName, data, base64 },
      { onSuccess: (path) => toast.success('Saved to Downloads', { description: path }) },
    );

  const exportAs = async (kind: 'svg' | 'png' | 'mmd') => {
    try {
      if (kind === 'mmd') return save1(`${exportName}.mmd`, mermaid(), false);
      const file = diagramSvgFile(diagram, exportTitle);
      if (kind === 'svg') return save1(`${exportName}.svg`, file, false);
      const png = await svgToPngBase64(
        file,
        Math.ceil(diagram.width),
        Math.ceil(diagram.height + 36),
      );
      save1(`${exportName}.png`, png, true);
    } catch (e) {
      toast.error('Couldn’t export the diagram', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // Hover highlight in CSS: one rule per hovered table, no re-render of the SVG.
  const sel = hover ? CSS.escape(hover) : null;
  const hoverCss = sel
    ? `.sr-dg .sr-edge{opacity:.16}.sr-dg .sr-edge[data-from="${sel}"],.sr-dg .sr-edge[data-to="${sel}"]{opacity:1}` +
      `.sr-dg .sr-edge[data-from="${sel}"] path,.sr-dg .sr-edge[data-to="${sel}"] path{stroke:var(--ember)!important;stroke-width:2}` +
      `.sr-dg .sr-node[data-table="${sel}"] rect:first-of-type{stroke:var(--ember)!important;stroke-width:2}`
    : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5">
        <SegmentedControl<Detail>
          ariaLabel="Detail"
          value={detail}
          onChange={onDetail}
          options={[
            { value: 'all', label: 'All columns' },
            { value: 'keys', label: 'Keys' },
            { value: 'names', label: 'Names' },
          ]}
        />
        <div className="relative min-w-40 flex-1 basis-40">
          <label className="flex h-8 items-center gap-2 rounded-full border border-hairline bg-muted px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches[0]) {
                  centerOn(matches[0].id);
                  setFind('');
                }
                if (e.key === 'Escape') setFind('');
              }}
              placeholder="Find a table"
              aria-label="Find a table in the diagram"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted-foreground"
            />
          </label>
          {matches.length > 0 && (
            <ul className="absolute top-9 left-0 z-10 w-full overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      centerOn(m.id);
                      setFind('');
                    }}
                    className="w-full cursor-pointer truncate px-3 py-1.5 text-left font-mono text-xs text-fg hover:bg-accent"
                  >
                    {m.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {aside}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomBy(1 / 1.25)}
          >
            <Minus />
          </Button>
          <button
            type="button"
            onClick={() => zoomBy(1 / view.k)}
            title="Actual size"
            className="w-12 cursor-pointer text-center text-xs text-muted-foreground tabular-nums hover:text-fg"
          >
            {Math.round(view.k * 100)}%
          </button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomBy(1.25)}
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Fit to window"
            title="Fit to window"
            onClick={fit}
          >
            <Maximize2 />
          </Button>
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" disabled={save.isPending}>
              <Download />
              Export
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="nx-pop z-[var(--z-dropdown)] min-w-56 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <DropdownMenu.Item className={itemCls} onSelect={() => void exportAs('svg')}>
                SVG — sharp at any size
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemCls} onSelect={() => void exportAs('png')}>
                PNG — for docs and chat
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemCls} onSelect={() => void exportAs('mmd')}>
                Mermaid — renders on GitHub
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <p className="px-2.5 py-1 text-xs text-muted-foreground">
                Saved to your Downloads folder.
              </p>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {footnote && (
        <div className="shrink-0 border-b border-hairline px-4 py-1.5 text-xs text-muted-foreground">
          {footnote}
        </div>
      )}
      <div
        ref={box}
        className={cn(
          'sr-dg relative min-h-0 flex-1 overflow-hidden bg-canvas select-none',
          drag.current ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
            return;
          }
          const id = tableAt(e.target);
          if (id !== hover) setHover(id);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const id = tableAt(document.elementFromPoint(e.clientX, e.clientY));
            if (id && onOpenTable) onOpenTable(id);
          }
        }}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${exportTitle}: ${diagram.nodes.length} tables, ${diagram.edges.length} links`}
      >
        <style>{hoverCss}</style>
        <div
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
            transformOrigin: '0 0',
          }}
          // The SVG is built from escaped text only (renderSvg), never raw HTML.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
};
