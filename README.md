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

## Palettes

`phosphor-green`, `terminal-amber`, `gameboy-dmg`, `teletext`, `chrome-98`, `dos-cobalt`, `paper-tape`, `vfd-cyan`, `dracula`, `gruvbox`, `solarized-dark`, `nord`, and `inherit`.

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
