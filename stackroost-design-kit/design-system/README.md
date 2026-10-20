# Stackroost

Smoked glass for a developer's control room: one warm signal, everything else quiet.

Stackroost is a macOS menu-bar app for one developer's whole setup: local services, ports, their SSH servers, machine health, cleanup, Claude Code chats and a terminal. This system is its visual language, called **Smoked Glass**: frosted panels floating over a softly lit ground, big rounded shapes, an inverse pill for the main action, and a single ember accent. It replaces the flat "Nexus" look.

Read this page first, then `shadcn.md` (how to wire it into the app) and `layouts.md` (how screens are put together).

## Principles

1. **Atmosphere, then glass.** Every window has the ground (`background` + `glow-warm` + `glow-cool`). Surfaces that float over it are glass: `card` + `blur-md` + a `hairline` edge + `shadow-edge`. Glass never sits on glass: no cards inside cards.
2. **One warm signal.** `ember` marks what matters now: the active module, the main chart line, progress, the on state of a switch, focus. Keep it to about a tenth of any screen. Everything else is ivory, ink and greys.
3. **The inverse pill is the main action.** `primary` is ivory on smoked and ink on frost. One per view.
4. **Round everything.** Pills for controls (`radius-full`), 22 px rows, 28 px panels, 36 px rail and shell. No square corners except inside code.
5. **Status is words plus colour.** "Healthy", "Starting", "2 issues", "Not connected". Colour alone never carries meaning.
6. **Big numbers only when they are the answer.** The `metric` style is for a real measurement (disk 68.5 %, uptime 14 d). No decorative hero metrics, no fake "boost".
7. **Prod is never subtle.** `EnvBadge` PROD, `destructive` actions, the typed-name dialog, then the native sheet in Rust.
8. **Read-only by default.** Changes are explicit buttons; destructive ones are styled as destructive.

## Colour

Two themes from one token set: **Smoked** (dark, the default) and **Frost** (light). Names follow shadcn/ui so the theme drops straight into `globals.css`.

| Role        | Tokens                                                             | Smoked                               | Frost                              |
| ----------- | ------------------------------------------------------------------ | ------------------------------------ | ---------------------------------- |
| Ground      | `background`, `glow-warm`, `glow-cool`                             | #141215 with an ember haze top-right | #E7E7EA with a white haze          |
| Text        | `foreground`, `muted-foreground`                                   | #F4F1EC, #A8A3A0                     | #0C0C0E, #5A5860                   |
| Glass       | `card`, `glass-strong`, `hairline`, `secondary`, `muted`, `accent` | white at 6 / 11 / 9 / 8 / 5 / 10 %   | white at 62 / 86 %, ink at 8 %     |
| Opaque      | `popover`, `border`, `input`                                       | #1E1C20                              | #FFFFFF                            |
| Main action | `primary`, `primary-foreground`                                    | ivory pill, smoked text              | ink pill, white text               |
| Signal      | `ember`, `ember-foreground`, `ember-text`, `ember-soft`            | #FF7A2F                              | #E2600F (text #9C3D08)             |
| Status      | `success`, `warning`, `info`, `destructive` (+ `-soft`)            | #5BE08F, #F7C64B, #7CC4FF, #FF5A5F   | #11612E, #7A4A00, #17538C, #B3203A |
| Charts      | `chart-1`…`chart-5`                                                | ember, ivory, lime, sky, violet      | deeper versions                    |
| Rail        | `sidebar*`                                                         | darker glass, ember active           | white glass, ink active            |

Contrast: body and muted text pass 4.5:1 on `background` and on `card` in both themes; status colours pass 4.5:1 on their `-soft` grounds. Use `ember-text`, not `ember`, when ember is text on Frost.

## Type

- **Outfit** (Google Fonts, geometric) for display, UI and numbers: `display-xl` 56, `display-lg` 40, `title` 24, `heading` 18, `body` 15, `caption` 13, `label` 12, and `metric` 44 for measured numbers.
- **Geist Mono** for hosts, ports, paths, images, ids, kbd hints: `mono` 13, `mono-sm` 12.
- Sentence case everywhere; capitals only for `PROD`. Tight tracking on display sizes (−0.02 to −0.03 em), none on body.
- In the app, bundle the fonts locally (`@fontsource-variable/outfit`, `@fontsource/geist-mono`); the app must work offline.

## Space, radius, depth

- Spacing on a 4 px base: `space-3` 12 between rows, `space-5` 20 between panels, `space-6` 24 panel padding, `space-8` 32 window padding.
- Radius: `radius-full` controls, `radius-md` 16 inputs, `radius-lg` 22 rows and menus, `radius-xl` 28 panels and dialogs, `radius-2xl` 36 rail and window shell.
- Depth comes from blur and light, not stacked shadows: `shadow-edge` on all glass, `shadow-float` only for things above content (rail, dialog, menu, dial knob), `shadow-ring-ember` for the active rail item and focused inputs.
- Blur: `blur-sm` 12 for chips and glass buttons, `blur-md` 24 for panels and rows, `blur-lg` 48 for the rail and sheets.

## Iconography

Line icons, 24 px grid, 1.75 stroke, round caps, `currentColor`. In the app use `lucide-react` (already installed); the `Icon` component carries a matching subset for previews. Sizes: 20 in 44 px circles, 18 in rows and buttons, 16 in menus. Every icon-only control has an `aria-label` and a tooltip.

| Module       | Icon (lucide)        |
| ------------ | -------------------- |
| Services     | `activity`           |
| Packages     | `package`            |
| Sessions     | `clock`              |
| Ports        | `plug`               |
| Servers      | `server`             |
| Tunnels      | `waypoints`          |
| Containers   | `container`          |
| Databases    | `database`           |
| Doctor       | `shield-plus`        |
| Storage      | `hard-drive`         |
| Memory       | `cpu`                |
| Claude Chats | `message-square`     |
| Terminal     | `terminal-square`    |
| Settings     | `sliders-horizontal` |

## Logo

The mark is three stacked pills (the stack) with a warm dot roosting on top. Pills are `foreground` at 45 / 72 / 100 %; the dot is `ember`. Files are under Logos: the mark for dark and light grounds, the app icon (smoked glass squircle), an alternative app icon (the ivory dial knob from the radial-menu reference), and the menu-bar template (black only, macOS recolours it). The wordmark is lowercase `stackroost` in Outfit 600, set as live text next to the mark (the `Logo` component).

## Motion

160 ms ease-out for hover and press (buttons scale to 0.98), 240 ms for panels, sheets and the dial. Respect `prefers-reduced-motion` (no transitions) and `prefers-reduced-transparency` (glass becomes opaque `popover`). Never animate numbers counting up.

## Voice

Short, plain, honest. "Connect", "Restart on PROD", "Disk 68.5 % used", "Host key not trusted. Verify it in a terminal." No exclamation marks, no fake urgency, no "Boost". Say what was measured.

## Components

Logo, Mark, Icon, Button, Badge, EnvBadge, Panel, Metric, Sparkline, Progress, Segmented, Switch, Input, SearchField, NavRail, ListRow, DialogSurface, Menu, Tooltip, CommandDial. Each has guidelines and a live preview, and `shadcn.md` gives the matching shadcn/ui class recipes so the app keeps using its own Radix primitives.
