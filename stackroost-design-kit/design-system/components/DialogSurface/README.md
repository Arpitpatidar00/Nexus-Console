The dialog card: opaque `popover`, 28 px corners, title, description, body, right-aligned actions.

shadcn: `DialogContent` = `rounded-[28px] bg-popover border shadow-float p-6`; the overlay is `bg-black/40 backdrop-blur-sm`.

- Use it for the prod typed-name step. The Rust native sheet still follows; the dialog never replaces it.
- The destructive action is on the right and names the target ("Restart on PROD").
