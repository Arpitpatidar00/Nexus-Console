# Stackroost design kit — Smoked Glass

Everything from the Stackroost design system and the redesign canvas, offline.

## Open first

- `screens/index.html`: the redesigned screens (Brand, Servers, Services, Command dial ⌘K), drawn with the real components.
- `design-system/gallery.html`: all 20 components with their guidelines, with a dark/light switch.

Open them straight from the folder in any browser. Fonts (Outfit, Geist Mono) load from Google Fonts when you are online; offline they fall back to the system font.

## What is inside

| Folder           | Contents                                                                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-system/` | The brand book (`README.md`), screen rules (`layouts.md`), shadcn guide (`shadcn.md`), tokens (`tokens.json`, `tokens.css`), the components (`components/bundle.js`, `bundle.css`, `index.d.ts`, one `README.md` per component) and the logo SVGs (`assets/Logos/`). |
| `app-theme/`     | `globals.css` ready for your app (Tailwind v4 + shadcn/ui, keeps your `data-theme` switch) and the full setup guide with the Button / Badge / Card / Tabs / Switch / Input / Dialog / Menu recipes.                                                                  |
| `screens/`       | The four redesigned screens as HTML pages.                                                                                                                                                                                                                           |
| `vendor/`        | React 18.3.1, used only by the gallery and the screens.                                                                                                                                                                                                              |

## Using it in the app

1. Replace the app's theme CSS with `app-theme/globals.css` (Tailwind v4) and install the fonts locally: `@fontsource-variable/outfit` and `@fontsource/geist-mono`.
2. Restyle the shadcn components with the recipes in `app-theme/shadcn-setup.md`.
3. Use `design-system/assets/Logos/stackroost-app-icon.svg` for the `.icns` app icon and `stackroost-menubar-template.svg` for the tray icon.
4. Build screens following `design-system/layouts.md`; the HTML screens here are the visual reference.

The `components/<Name>/preview.html` files are made for the online design-system page (they expect it to preload the styles); use `gallery.html` to view the components offline.
