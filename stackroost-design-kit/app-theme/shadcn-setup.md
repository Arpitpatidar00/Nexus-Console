# shadcn/ui setup

How to put Smoked Glass into the app (Tauri 2 + React 19 + Tailwind v4 + shadcn/ui). The app already uses `[data-theme]` on `<html>`, Radix primitives, `cva` and `tailwind-merge`, so this is a theme swap plus class recipes, not a rewrite.

## 1. globals.css (Tailwind v4)

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import '@fontsource-variable/outfit';
@import '@fontsource/geist-mono/400.css';
@import '@fontsource/geist-mono/500.css';

/* Keep the app's existing data-theme switch. */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root,
[data-theme='light'] {
  --radius: 1rem;
  --background: #e7e7ea;
  --foreground: #0c0c0e;
  --glow-warm: rgba(226, 96, 15, 0.1);
  --glow-cool: rgba(255, 255, 255, 0.7);
  --card: rgba(255, 255, 255, 0.62);
  --card-foreground: #0c0c0e;
  --glass-strong: rgba(255, 255, 255, 0.86);
  --hairline: rgba(12, 12, 14, 0.08);
  --popover: #ffffff;
  --popover-foreground: #0c0c0e;
  --primary: #0c0c0e;
  --primary-foreground: #ffffff;
  --secondary: rgba(255, 255, 255, 0.7);
  --secondary-foreground: #0c0c0e;
  --muted: rgba(12, 12, 14, 0.04);
  --muted-foreground: #5a5860;
  --accent: rgba(12, 12, 14, 0.06);
  --accent-foreground: #0c0c0e;
  --ember: #e2600f;
  --ember-foreground: #1a0f08;
  --ember-text: #9c3d08;
  --ember-soft: rgba(226, 96, 15, 0.12);
  --success: #11612e;
  --success-soft: rgba(17, 97, 46, 0.1);
  --warning: #7a4a00;
  --warning-soft: rgba(122, 74, 0, 0.1);
  --info: #17538c;
  --info-soft: rgba(23, 83, 140, 0.1);
  --destructive: #b3203a;
  --destructive-foreground: #ffffff;
  --danger-soft: rgba(179, 32, 58, 0.1);
  --border: rgba(12, 12, 14, 0.1);
  --input: rgba(12, 12, 14, 0.16);
  --ring: #e2600f;
  --chart-1: #e2600f;
  --chart-2: #0c0c0e;
  --chart-3: #5c7300;
  --chart-4: #17538c;
  --chart-5: #5b3fc4;
  --sidebar: rgba(255, 255, 255, 0.72);
  --sidebar-foreground: #5a5860;
  --sidebar-primary: #0c0c0e;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(12, 12, 14, 0.06);
  --sidebar-accent-foreground: #0c0c0e;
  --sidebar-border: rgba(12, 12, 14, 0.08);
  --sidebar-ring: #e2600f;
  --shadow-edge: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --shadow-float: 0 24px 60px rgba(28, 24, 32, 0.14);
  --shadow-ring-ember: 0 0 0 4px rgba(226, 96, 15, 0.18);
}

[data-theme='dark'] {
  --background: #141215;
  --foreground: #f4f1ec;
  --glow-warm: rgba(255, 122, 47, 0.16);
  --glow-cool: rgba(196, 178, 166, 0.1);
  --card: rgba(255, 255, 255, 0.06);
  --card-foreground: #f4f1ec;
  --glass-strong: rgba(255, 255, 255, 0.11);
  --hairline: rgba(255, 255, 255, 0.09);
  --popover: #1e1c20;
  --popover-foreground: #f4f1ec;
  --primary: #f4f1ec;
  --primary-foreground: #141215;
  --secondary: rgba(255, 255, 255, 0.08);
  --secondary-foreground: #f4f1ec;
  --muted: rgba(255, 255, 255, 0.05);
  --muted-foreground: #a8a3a0;
  --accent: rgba(255, 255, 255, 0.1);
  --accent-foreground: #f4f1ec;
  --ember: #ff7a2f;
  --ember-foreground: #1a0f08;
  --ember-text: #ff8a47;
  --ember-soft: rgba(255, 122, 47, 0.16);
  --success: #5be08f;
  --success-soft: rgba(91, 224, 143, 0.14);
  --warning: #f7c64b;
  --warning-soft: rgba(247, 198, 75, 0.14);
  --info: #7cc4ff;
  --info-soft: rgba(124, 196, 255, 0.14);
  --destructive: #ff5a5f;
  --destructive-foreground: #1a0b0c;
  --danger-soft: rgba(255, 90, 95, 0.14);
  --border: rgba(255, 255, 255, 0.1);
  --input: rgba(255, 255, 255, 0.14);
  --ring: #ff7a2f;
  --chart-1: #ff7a2f;
  --chart-2: #f4f1ec;
  --chart-3: #d9f26b;
  --chart-4: #7cc4ff;
  --chart-5: #b79cff;
  --sidebar: rgba(10, 9, 11, 0.72);
  --sidebar-foreground: #a8a3a0;
  --sidebar-primary: #ff7a2f;
  --sidebar-primary-foreground: #1a0f08;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #f4f1ec;
  --sidebar-border: rgba(255, 255, 255, 0.09);
  --sidebar-ring: #ff7a2f;
  --shadow-edge: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.45);
  --shadow-ring-ember: 0 0 0 4px rgba(255, 122, 47, 0.22);
}

@theme inline {
  --font-sans: 'Outfit Variable', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Outfit Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  /* Stackroost additions */
  --color-ember: var(--ember);
  --color-ember-foreground: var(--ember-foreground);
  --color-ember-text: var(--ember-text);
  --color-ember-soft: var(--ember-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-info: var(--info);
  --color-info-soft: var(--info-soft);
  --color-danger-soft: var(--danger-soft);
  --color-hairline: var(--hairline);
  --color-glass-strong: var(--glass-strong);

  --radius-sm: calc(var(--radius) - 4px); /* 12 menu items, tooltips */
  --radius-md: var(--radius); /* 16 inputs */
  --radius-lg: calc(var(--radius) + 6px); /* 22 rows, menus */
  --radius-xl: calc(var(--radius) + 12px); /* 28 panels, dialogs */
  --radius-2xl: calc(var(--radius) + 20px); /* 36 rail, shell */

  --shadow-edge: var(--shadow-edge);
  --shadow-float: var(--shadow-float);
  --shadow-ring-ember: var(--shadow-ring-ember);
}

@utility ground {
  background:
    radial-gradient(60% 70% at 88% 0%, var(--glow-warm), transparent 70%),
    radial-gradient(55% 65% at 0% 100%, var(--glow-cool), transparent 70%), var(--background);
}
@utility glass {
  background: var(--card);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(24px) saturate(140%);
  box-shadow: var(--shadow-edge);
}

@media (prefers-reduced-transparency: reduce) {
  .glass {
    backdrop-filter: none;
    background: var(--popover);
  }
}

@layer base {
  * {
    @apply border-border outline-ring/60;
  }
  body {
    @apply font-sans text-foreground antialiased ground;
  }
}
```

The app's current tokens (`bg-canvas`, `text-fg`, `text-accent`, `bg-paper`, `bg-list`) can be aliased to these during the move (`--canvas: var(--background)`, `--fg: var(--foreground)`, `--accent-text: var(--ember-text)` …) so screens migrate one at a time.

## 2. Component recipes

Keep shadcn's files; change their classes.

**Button** (`components/ui/button.tsx`)

```ts
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,color,transform] duration-150 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        ember: 'bg-ember text-ember-foreground hover:bg-ember/90',
        secondary: 'glass text-secondary-foreground hover:bg-glass-strong',
        outline: 'border border-input bg-transparent hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-ember-text underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-[18px]',
        sm: 'h-8 px-3.5 text-[13px] [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-11 [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
```

**Card**: `Card` = `glass rounded-xl p-6 flex flex-col gap-4 text-card-foreground`; `CardTitle` = `font-display text-lg font-semibold tracking-tight`; `CardDescription` = `text-[13px] text-muted-foreground`. Never nest a `Card` in a `Card`.

**Badge**: add tones

```ts
variant: {
  default: "bg-muted text-foreground border-hairline",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  info: "bg-info-soft text-info border-transparent",
  destructive: "bg-danger-soft text-destructive border-transparent",
  ember: "bg-ember-soft text-ember-text border-transparent",
  prod: "bg-danger-soft text-destructive border-destructive font-mono tracking-[.08em]",
}
// base: "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs font-medium"
```

**Tabs** (segmented): `TabsList` = `rounded-full bg-muted border border-hairline p-1 h-auto`; `TabsTrigger` = `rounded-full h-8 px-4 text-[13px] text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none`.

**Switch**: root `h-[26px] w-11 border border-input bg-muted data-[state=checked]:bg-ember data-[state=checked]:border-transparent`; thumb `size-5 bg-foreground data-[state=checked]:bg-ember-foreground data-[state=checked]:translate-x-[18px]`.

**Input**: `h-11 rounded-md bg-muted border-input px-4 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ember/20`; add `font-mono text-[13px]` for hosts, ports and paths.

**Dialog**: overlay `bg-black/40 backdrop-blur-sm`; content `rounded-xl bg-popover border shadow-float p-6 gap-3 max-w-[440px]`.

**DropdownMenu / ContextMenu**: content `rounded-lg p-1.5 bg-popover shadow-float min-w-[232px]`; item `rounded-sm h-9 gap-2.5 focus:bg-accent`; destructive item `text-destructive`.

**Tooltip**: content `rounded-sm bg-primary text-primary-foreground px-2.5 py-1.5 text-xs`.

**Progress**: root `h-2 rounded-full bg-muted border border-hairline`; indicator `bg-ember rounded-full`.

**Table / lists**: prefer rows (`glass rounded-lg min-h-14 px-3 py-2 flex items-center gap-3 hover:bg-glass-strong`) inside a `ScrollArea`. Use `Table` only when columns must line up across many rows; then put it in one `Card` with `hairline` row dividers.

**Command (⌘K)**: `CommandDialog` content as Dialog above; `CommandInput` uses the SearchField look; the radial `CommandDial` sits above the list when the query is empty.

**Sidebar**: do not use shadcn's wide `Sidebar`. Use the floating icon rail (`NavRail`): `glass rounded-2xl bg-sidebar p-2.5 flex flex-col gap-6` with 44 px round buttons and right-side tooltips.

## 3. Real glass on macOS (Tauri)

CSS blur only blurs what is inside the window. For the desktop to show through, make the window translucent and add native vibrancy:

- `tauri.conf.json`: on the main window set `"transparent": true`, and add `"macOSPrivateApi": true` under `app`. Private API is fine for the DMG you ship; it is not allowed on the Mac App Store.
- Rust: the `window-vibrancy` crate, `apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, Some(28.0))`.
- Then make `--background` slightly translucent in the dark theme (for example `rgba(20, 18, 21, 0.82)`) so the vibrancy shows through the ground.
- Careful with the startup contract in `CLAUDE.md`: the window starts hidden and `index.html` sets the theme before modules load. Keep that order, and change `backgroundColor` in `tauri.conf.json` to match the new ground, or the first frame will flash.
- `prefers-reduced-transparency` must turn glass opaque (the utility above does).
