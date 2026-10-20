Pill buttons; the inverse pill (`primary`) is the one main action in a view.

Variants map to shadcn `buttonVariants` (see the shadcn section): `primary` = `default`, `glass` = `secondary`, plus `ember`, `outline`, `ghost`, `destructive`.

- One `primary` per view. `ember` is for the action the warm signal is about (Deploy, Start workspace), not a second primary.
- `destructive` for stop / remove / anything on prod; prod actions still need the typed-name confirm (`DialogSurface`) and the native sheet in Rust.
- Sizes: `sm` 32 px, `md` 40 px, `lg` 48 px, `icon` 44 px circle (44 px is the minimum touch target).
