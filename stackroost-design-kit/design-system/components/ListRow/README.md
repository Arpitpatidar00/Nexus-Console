The workhorse row: icon circle, title, mono subtitle, meta, status badge, trailing actions.

Used for hosts, containers, services, ports, files. shadcn: build rows as `div`s inside a `ScrollArea`; use `Table` only when columns must align across many rows.

- Subtitle and meta are mono (hosts, images, sizes). Status is always a `Badge` with words.
- Trailing actions are ghost icon buttons with labels, or one `DropdownMenu` (`Menu`).
