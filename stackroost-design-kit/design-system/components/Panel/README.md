A card: frosted glass over the ground, 28 px corners, 24 px padding.

Variants: `glass` (default), `solid` (opaque `popover`, for dense tables and reduced transparency), `inverse` (`primary` ground, at most one per screen, for the single thing that needs a decision).

shadcn: style `Card` with `glass rounded-[28px] p-6 gap-4`; `CardTitle` uses the `heading` type style.

- Never put glass inside glass (no cards in cards). Inside a panel, use rows, dividers (`hairline`) or plain content.
- The consumer provides the title, optional subtitle and an optional `action` element (a small glass button).
