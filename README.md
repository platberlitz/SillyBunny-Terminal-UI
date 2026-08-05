# SillyBunny Terminal UI

A [SillyBunny](https://github.com/SillyBunnyTeam/SillyBunny) extension that reskins the entire interface to look like a CLI terminal: monospace everything, flat colors, square corners, and messages framed as shell prompts.

![Chat view in the Phosphor Green palette](screenshot.png)

## Features

- **Full reskin** — every surface (chat, panels, drawers, popups, toasts, scrollbars) goes flat, borderless-shadowless, and monospace. Backgrounds and blur are removed.
- **Prompt-prefixed messages** — your messages render as `┌─[User@sillybunny]` / `└─$ …`, character replies as `└─> …`, system lines as `# …`. Done entirely with CSS attribute selectors, so no script ever touches message content.
- **Statusline top bar** — `user@sillybunny:~$` in the top bar, plus a `└─$` prompt beside the chat input.
- **13 palettes** — Phosphor Green (default), Terminal Amber, Game Boy DMG, Teletext, Chrome 98, DOS Cobalt, Paper Tape, VFD Cyan, Dracula, Gruvbox, Solarized Dark, Nord, and **Inherit Active Theme**, which follows whatever SillyBunny theme is selected. Dim text colors are tuned where canonical values fall below WCAG AA contrast.
- **CRT effects** — optional scanlines, phosphor glow, and subtle flicker. Off by default; flicker is disabled automatically under `prefers-reduced-motion`.
- **Instant toggle** — everything is gated on a single body class, so switching the skin on/off in settings applies immediately, with no page reload and no leftover styling.

## Install

Clone into your SillyBunny user extensions folder (or symlink a checkout there):

```
data/<user-handle>/extensions/SillyBunny-Terminal-UI
```

Reload the browser. The skin activates on load; configure it under **Extensions → Terminal UI** (enable toggle, palette picker, CRT toggle).

## Notes

- Loads late (`loading_order: 130`) so it wins over other theme extensions when both are enabled; disabling it restores their look untouched.
- On screens ≤768px the box-drawing frame lines collapse to keep messages readable; palettes and flatness still apply.
- Settings are stored in the standard extension settings and roam with your SillyBunny user.

## License

AGPL-3.0
