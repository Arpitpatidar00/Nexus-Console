# Layouts

How Stackroost screens are composed. The window is 1280 × 840 by default and never smaller than 1000 × 660.

## The shell

- **Ground** fills the window (`ground`). Content sits in a padded shell: 16 px from the window edge, the macOS traffic lights in the top-left corner of the ground.
- **Rail** floats on the left (`NavRail`), full height minus 16 px top and bottom, 64 px wide. Module order follows the registry; Settings sits at the bottom.
- **Header row** to the right of the rail, 72 px tall: the page title in `display-xl` on the left; the search pill, the theme toggle and the notifications button (44 px glass circles) on the right. The header is a drag region.
- **Content** below the header: a bento grid of glass panels, 12 columns, 20 px gaps. Panels span 4, 6, 8 or 12 columns. Long lists scroll inside their own panel, never the whole page.
- **Terminal drawer**: a glass sheet (`blur-lg`, 28 px top corners) that slides up over the content, with tabs as pills.

## Master–detail

Servers, Services, Packages and Claude Chats are master–detail: a 4-column list panel of `ListRow`s on the left, an 8-column detail area on the right. The detail area header is `display-lg` (the host or service name), its `EnvBadge` and status `Badge`, then actions on the right (Connect is the inverse pill; Terminal is a glass button). Below it, a `Segmented` control switches the sections, and the sections are panels.

## Bento rules

- One inverse panel (`Panel variant="inverse"`) per screen at most, for the single thing that needs a decision (a deploy waiting, a prod issue).
- `Metric` panels sit in the top row only when the numbers answer the screen's question (disk, memory, load on a host). Never as decoration.
- Charts are thin lines (`Sparkline` or a chart using `chart-1`…`chart-5`) inside glass panels with a `Segmented` range picker in the panel's action slot.
- Empty states: the `Mark` at 56 px, one sentence, one primary action. No illustrations.

## The command dial (⌘K)

⌘K opens a centred dialog: the `CommandDial` on the left with the pinned modules around the knob, and a `SearchField` plus result list on the right. Typing filters actions from every module (restart a service, connect a host, open a tunnel). Arrow keys move around the dial when the query is empty. Esc closes.

## Menu bar

The menu-bar item is the template mark plus `running/total` services. Its menu is native macOS, not glass: a section per module with live state in words ("api-1 · Restarting"), Open Stackroost, Quit.

## Migration from the Nexus look

- `PRODUCT.md`'s "dark mode is flat, no shadows" rule is replaced by the glass and depth rules here; its honesty, accessibility and read-only rules stay as they are.
- Replace the wide sidebar with the rail; move per-tab toolbars into the header row or the panel action slot.
- Move screens one at a time behind the token aliases in `shadcn.md`; Services first (most used), then Servers, Ports, Doctor, Mac Clean, Claude Chats, Settings.
