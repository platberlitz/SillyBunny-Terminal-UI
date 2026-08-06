# SillyBunny Terminal UI

A command-first interface for [SillyBunny](https://github.com/SillyBunnyTeam/SillyBunny). It keeps the native chat prompt and slash-command system, then reduces the surrounding UI to a tmux-style statusline, flat transcript, and fzf-like command results.

## Screenshots

<table>
  <tr>
    <td colspan="2">
      <strong>Terminal Home</strong><br>
      <img src="screenshots/terminal-home.webp" alt="Terminal Home with the statusline, prompt, and scrollable command reference">
    </td>
  </tr>
  <tr>
    <td width="50%">
      <strong>Slash-command preview</strong><br>
      <img src="screenshots/slash-command-preview.webp" alt="Native slash-command preview above the Terminal Home prompt">
    </td>
    <td width="50%">
      <strong>Workspace navigation</strong><br>
      <img src="screenshots/workspace-navigation.webp" alt="SillyBunny API workspace styled by Terminal UI">
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <strong>Mobile Home</strong><br>
      <img src="screenshots/mobile-home.webp" alt="Terminal Home at a narrow mobile viewport" width="300">
    </td>
  </tr>
</table>

## Interaction

The normal SillyBunny composer remains the only prompt:

- Plain text sends chat.
- A leading `/` uses SillyBunny slash commands and autocomplete.
- `Alt+Up` and `Alt+Down` use native input history.
- `Ctrl+Space` opens or expands native command autocomplete.
- The native Home is replaced by a centered, prompt-only REPL in both interface densities; `/home` and `/hide-home` return to Terminal Home, while `/open-homepage` explicitly reveals SillyBunny's native Home when needed.
- The empty state keeps a compact, scrollable command reference next to the prompt; typing `/` still opens native slash autocomplete.
- The chat toolbar (Quick Replies, Guided Generations) and the bottom chat-management bar follow the interface: on in Full chrome (the default), stripped in Terminal density. Force either state with `/show-chat-topbar` / `/hide-chat-topbar`, `/show-bottom-bar` / `/hide-bottom-bar`, or the checkboxes in the extension drawer. Terminal UI preserves the native send control whenever SillyBunny exposes it, including for desktop users who disable Enter-to-send.
- Every visibility toggle is available three ways — a checkbox in the extension drawer, a slash command, and `/sbterm`. A toggle you have never touched follows the interface density; once set, it applies in both densities.
- The Moonlit Echoes theme extension is automatically muted while Terminal UI is active — the two restyle the same surfaces and conflict. Its stylesheets are switched back on the moment Terminal UI is turned off; no Moonlit settings are changed.

Full chrome is the default interface. Terminal density removes optional composer controls while retaining native send and conditional stop/script controls; switch with the Interface dropdown in the extension drawer or `/sbterm ui terminal`.

## `/sbterm`

Terminal UI adds `/sbterm` and `/home` and does not replace native commands such as `/api`, `/model`, `/preset`, `/theme`, `/chat-manager`, `/go`, or `/newchat`.

| Command | Action |
| --- | --- |
| `/sbterm status` | Show the live character/chat, API/model, run state, and last prompt token diagnostics |
| `/sbterm on` / `/sbterm off` | Enable or disable the interface without disabling the extension |
| `/sbterm ui terminal` / `/sbterm ui full` | Switch terminal density or full host chrome |
| `/sbterm palette <slug>` | Select one of the 13 palettes |
| `/sbterm crt on` / `/sbterm crt off` | Toggle the optional CRT overlay |
| `/sbterm <destination>` | Open a SillyBunny shell or workspace |
| `/home` | Return to the terminal Home screen (`/open-homepage` shows the native Home page) |

Destinations: `workspace`, `presets`, `api`, `sampling`, `formatting`, `agents`, `customize`, `settings`, `extensions`, `background`, `server`, `logs`, `characters`, `groups`, `editor`, `world-info`, `persona`, `import`, `search`, `chat-tools`, `appearance`, `home`, `conversation`, and `roleplay`.

Every destination also has a top-level alias: `/open-workspace`, `/open-presets`, `/open-api`, `/open-model`, and so on. Visibility toggles: `/hide-top-navbar`, `/show-top-navbar`, `/hide-home`, `/hide-avatar`, `/show-avatar`, `/show-chat-topbar`, `/hide-chat-topbar`, `/show-bottom-bar`, and `/hide-bottom-bar`.

The same slash-command autocomplete and `/sbterm` command work from Conversation Mode. Its existing `/selfie`, `/remind`, `/schedule`, `/summarize`, `/ooc`, and normal message behavior are left untouched.

## Statusline

The top line reports real host state, for example:

```text
run:idle | chat:Nahida/Rooftop Talk | api:openrouter/claude-3.7 | prompt:11.8k/32.8k
```

The run state comes first so it survives truncation. When disconnected, the line starts with `run:disconnected` and the adjacent **connect** button opens API settings. **more** reveals the complete status as a toast. Prompt tokens are counted from the last fully assembled request. Conversation Mode can use a scoped connection, so it reports `prompt:n/a` rather than showing stale Roleplay data.

## Boot splash

The loading screen follows the active palette and shows the Terminal UI bunny in place of the SillyBunny badge. The bunny is a CSS mask, so it takes the palette accent rather than a fixed colour, and the 30px backdrop blur is dropped.

<table>
  <tr>
    <td width="72%"><img src="screenshots/splash-desktop.webp" alt="Terminal UI boot splash on desktop"></td>
    <td width="28%"><img src="screenshots/splash-mobile.webp" alt="Terminal UI boot splash on mobile"></td>
  </tr>
</table>

## Palettes

`phosphor-green`, `terminal-amber`, `gameboy-dmg`, `teletext`, `chrome-98`, `dos-cobalt`, `paper-tape`, `vfd-cyan`, `dracula`, `gruvbox`, `solarized-dark`, `nord`, and `inherit`. See the [palette gallery](#palette-gallery) for all thirteen.

CRT scanlines are optional and off by default. Motion stops under `prefers-reduced-motion`; the overlay is removed under forced colors or increased contrast.

## Install

Clone or symlink the extension into:

```text
data/<user-handle>/extensions/SillyBunny-Terminal-UI
```

Reload SillyBunny, then configure it under **Extensions > Terminal UI**. Settings use SillyBunny's standard extension store.

## Development

```sh
npm test
npm run lint
```

The extension ships as native browser modules with no build step or runtime dependency.

## License

AGPL-3.0

## Palette gallery

Every palette, desktop and mobile, on the terminal Home screen. Captured from a running SillyBunny with no API connected, which is why the statusline reads `run:disconnected`.

### Phosphor Green

`phosphor-green`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/phosphor-green-desktop.webp" alt="Phosphor Green on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/phosphor-green-mobile.webp" alt="Phosphor Green on mobile"></td>
  </tr>
</table>

### Terminal Amber

`terminal-amber`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/terminal-amber-desktop.webp" alt="Terminal Amber on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/terminal-amber-mobile.webp" alt="Terminal Amber on mobile"></td>
  </tr>
</table>

### Game Boy DMG

`gameboy-dmg`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/gameboy-dmg-desktop.webp" alt="Game Boy DMG on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/gameboy-dmg-mobile.webp" alt="Game Boy DMG on mobile"></td>
  </tr>
</table>

### Teletext

`teletext`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/teletext-desktop.webp" alt="Teletext on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/teletext-mobile.webp" alt="Teletext on mobile"></td>
  </tr>
</table>

### Chrome 98

`chrome-98`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/chrome-98-desktop.webp" alt="Chrome 98 on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/chrome-98-mobile.webp" alt="Chrome 98 on mobile"></td>
  </tr>
</table>

### DOS Cobalt

`dos-cobalt`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/dos-cobalt-desktop.webp" alt="DOS Cobalt on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/dos-cobalt-mobile.webp" alt="DOS Cobalt on mobile"></td>
  </tr>
</table>

### Paper Tape

`paper-tape`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/paper-tape-desktop.webp" alt="Paper Tape on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/paper-tape-mobile.webp" alt="Paper Tape on mobile"></td>
  </tr>
</table>

### VFD Cyan

`vfd-cyan`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/vfd-cyan-desktop.webp" alt="VFD Cyan on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/vfd-cyan-mobile.webp" alt="VFD Cyan on mobile"></td>
  </tr>
</table>

### Dracula

`dracula`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/dracula-desktop.webp" alt="Dracula on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/dracula-mobile.webp" alt="Dracula on mobile"></td>
  </tr>
</table>

### Gruvbox

`gruvbox`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/gruvbox-desktop.webp" alt="Gruvbox on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/gruvbox-mobile.webp" alt="Gruvbox on mobile"></td>
  </tr>
</table>

### Solarized Dark

`solarized-dark`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/solarized-dark-desktop.webp" alt="Solarized Dark on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/solarized-dark-mobile.webp" alt="Solarized Dark on mobile"></td>
  </tr>
</table>

### Nord

`nord`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/nord-desktop.webp" alt="Nord on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/nord-mobile.webp" alt="Nord on mobile"></td>
  </tr>
</table>

### Inherit Active Theme

`inherit`

<table>
  <tr>
    <td width="72%"><img src="screenshots/palettes/inherit-desktop.webp" alt="Inherit Active Theme on desktop"></td>
    <td width="28%"><img src="screenshots/palettes/inherit-mobile.webp" alt="Inherit Active Theme on mobile"></td>
  </tr>
</table>
