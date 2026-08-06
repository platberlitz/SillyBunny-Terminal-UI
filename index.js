const MODULE = 'SillyBunny-Terminal-UI';
const DRAWER_ID = 'sbterm-settings-drawer';
const BANNER_ID = 'sbterm-banner';
const STATUS_ID = 'sbterm-statusline';
const STATUS_DETAILS_ID = 'sbterm-status-details';
const BOTTOM_BAR_VISIBILITY_KEY = 'sb-bottom-chat-bar-visible';
const COMMAND_NAME = 'sbterm';
const HOME_COMMAND_NAME = 'home';
const HOME_VISIBLE_CLASS = 'sbterm-home-visible';
const BUNNY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M30 40C28 26 27 12 33 9C39 6 42 20 42 34C44 33 52 33 54 34C54 20 57 6 63 9C69 12 68 26 66 40C74 46 78 54 78 63C78 78 65 88 48 88C31 88 18 78 18 63C18 54 22 46 30 40ZM34 15C32 22 32 29 35 33C38 29 38 20 37 14C36 12 35 13 34 15ZM59 14C58 20 58 29 61 33C64 29 64 22 62 15C61 13 60 12 59 14ZM34 60a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M53 60a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M45 69l6 0l-3 4.5z"/></svg>';

const PALETTES = [
    ['phosphor-green', 'Phosphor Green'],
    ['terminal-amber', 'Terminal Amber'],
    ['gameboy-dmg', 'Game Boy DMG'],
    ['teletext', 'Teletext'],
    ['chrome-98', 'Chrome 98'],
    ['dos-cobalt', 'DOS Cobalt'],
    ['paper-tape', 'Paper Tape'],
    ['vfd-cyan', 'VFD Cyan'],
    ['dracula', 'Dracula'],
    ['gruvbox', 'Gruvbox'],
    ['solarized-dark', 'Solarized Dark'],
    ['nord', 'Nord'],
    ['inherit', 'Inherit Active Theme'],
];

const PALETTE_IDS = PALETTES.map(([id]) => id);
const DEFAULTS = { version: 2, enabled: true, palette: 'phosphor-green', crt: false, minimal: true, topbarVisible: false, avatarVisible: true, chatTopbarVisible: false, bottomBarVisible: false };

/* The Moonlit Echoes theme extension restyles the same surfaces this reskin
   owns and the two fight; while Terminal UI is on, its stylesheets are turned
   off in place (sheet.disabled — nothing is persisted, so turning Terminal UI
   off brings Moonlit straight back). */
const MOONLIT_STYLE_IDS = [
    'MoonlitEchosTheme-style',
    'MoonlitEchosTheme-extension',
    'MoonlitEchosTheme-chat-styles',
    'dynamic-theme-styles',
    'moonlit-raw-css',
    'moonlit-disable-chat-surface-reset',
    'third-party_SillyBunny-MoonlitEchoesTheme-css',
];
let moonlitObserver = null;

function syncMoonlitSuppression(enabled) {
    if (typeof document === 'undefined') return;
    for (const id of MOONLIT_STYLE_IDS) {
        const sheet = document.getElementById(id);
        if (sheet && 'disabled' in sheet) sheet.disabled = enabled;
    }
    if (enabled && !moonlitObserver && typeof MutationObserver !== 'undefined' && document.head) {
        moonlitObserver = new MutationObserver(() => syncMoonlitSuppression(true));
        moonlitObserver.observe(document.head, { childList: true });
    } else if (!enabled) {
        moonlitObserver?.disconnect();
        moonlitObserver = null;
    }
}

const SHELL_DESTINATIONS = {
    workspace: ['left'],
    presets: ['left', 'presets'],
    api: ['left', 'api'],
    'open-api': ['left', 'api'],
    'open-model': ['left', 'api'],
    sampling: ['left', 'sampling'],
    formatting: ['left', 'advanced-formatting'],
    agents: ['left', 'agents'],
    customize: ['right'],
    settings: ['right', 'settings'],
    extensions: ['right', 'extensions'],
    background: ['right', 'background'],
    server: ['right', 'server'],
    logs: ['right', 'console-logs'],
    characters: ['characters', 'characters'],
    groups: ['characters', 'groups'],
    editor: ['characters', 'editor'],
    'world-info': ['characters', 'world-info'],
    persona: ['characters', 'persona'],
    import: ['characters', 'import'],
};

const destinationLabel = destination => destination.replace(/^open-/, '').replaceAll('-', ' ');

const COMMAND_OPTIONS = [
    ['status', 'Show the current terminal and connection status'],
    ['on', 'Enable Terminal UI'],
    ['off', 'Disable Terminal UI without disabling the extension'],
    ['ui terminal', 'Use command-first terminal density'],
    ['ui full', 'Show the complete host chrome'],
    ['crt on', 'Enable the optional CRT overlay'],
    ['crt off', 'Disable the CRT overlay'],
    ...PALETTES.map(([id, name]) => [`palette ${id}`, `Use the ${name} palette`]),
    ...Object.keys(SHELL_DESTINATIONS)
        .filter(destination => !destination.startsWith('open-'))
        .map(destination => [destination, `Open ${destinationLabel(destination)}`]),
    ['search', 'Open global search'],
    ['chat-tools', 'Open recent chat tools'],
    ['open-chats', 'Open recent chats'],
    ['appearance', 'Open appearance settings'],
    ['home', 'Return to the terminal Home'],
    ['conversation', 'Open Conversation Mode'],
    ['roleplay', 'Return to Roleplay Mode'],
];

/* Top-level /open-* aliases for every page destination. The native /api and
   /model commands stay untouched; their aliases are /open-api and /open-model,
   and every other destination gets an /open-<name> command too. */
const openCommandName = destination => (destination === 'api' || destination.startsWith('open-') ? destination : `open-${destination}`);
const TOGGLE_COMMANDS = ['hide-topbar', 'open-nav-topbar', 'hide-home', 'hide-avatar', 'show-avatar', 'show-chat-topbar', 'hide-chat-topbar', 'show-bottom-bar', 'hide-bottom-bar'];
const CONVERSATION_COMMANDS = new Set(['selfie', 'remind', 'schedule', 'summarize', 'ooc']);
const TOGGLE_CONFIG = {
    'hide-topbar': { patch: { topbarVisible: false }, success: 'Top bar hidden.' },
    'open-nav-topbar': { patch: { topbarVisible: true }, success: 'Top bar shown.' },
    'hide-avatar': { patch: { avatarVisible: false }, success: 'Avatars hidden.' },
    'show-avatar': { patch: { avatarVisible: true }, success: 'Avatars shown.' },
    'show-chat-topbar': { patch: { chatTopbarVisible: true }, success: 'Chat top bar shown.' },
    'hide-chat-topbar': { patch: { chatTopbarVisible: false }, success: 'Chat top bar hidden.' },
    'show-bottom-bar': { patch: { bottomBarVisible: true }, success: 'Chat bottom bar shown.' },
    'hide-bottom-bar': { patch: { bottomBarVisible: false }, success: 'Chat bottom bar hidden.' },
};

const COMMAND_GLOSSARY = [
    ['/sbterm', 'Configure Terminal UI'],
    ['/home', 'Return to Terminal Home'],
    ...Object.keys(SHELL_DESTINATIONS)
        .filter(destination => destination !== 'api')
        .map(destination => [`/${openCommandName(destination)}`, `Open ${destinationLabel(destination)}`]),
    ['/newchat', 'Start a new chat'],
    ['/search', 'Open global search'],
    ['/chat-tools', 'Open recent chat tools'],
    ['/open-chats', 'Open recent chats'],
    ['/appearance', 'Open appearance settings'],
    ['/hide-topbar', 'Hide the navigation top bar'],
    ['/open-nav-topbar', 'Show the navigation top bar'],
    ['/hide-home', 'Replace native Home with Terminal Home'],
    ['/hide-avatar', 'Hide chat avatars'],
    ['/show-avatar', 'Show chat avatars'],
    ['/show-chat-topbar', 'Show the chat tool bar'],
    ['/hide-chat-topbar', 'Hide the chat tool bar'],
    ['/show-bottom-bar', 'Show the chat bottom bar'],
    ['/hide-bottom-bar', 'Hide the chat bottom bar'],
];

let active = false;
let commandParser = null;
let registeredCommand = null;
let registeredHomeCommand = null;
let registeredTopLevel = [];
let domController = null;
let conversationObserver = null;
let autocompleteObserver = null;
let conversationAutocomplete = null;
let conversationAutocompleteInput = null;
let conversationAutocompletePendingInput = null;
let composerResizeObserver = null;
let eventBindings = [];
let nativeHomeClick = false;
let chatTopbarObserver = null;
let chatTopbarObserverTarget = null;
let capturedHostNodes = [];
let bottomBarState = null;
let renderSequence = 0;
let tokenSequence = 0;
let lastPromptTokens = null;
let lastPromptIdentity = '';
let lastStatusText = '';

function ctx() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function ensureSettings() {
    const context = ctx();
    if (!context?.extensionSettings) {
        return { settings: { ...DEFAULTS }, changed: false };
    }

    let changed = false;
    if (!context.extensionSettings[MODULE] || typeof context.extensionSettings[MODULE] !== 'object') {
        context.extensionSettings[MODULE] = { ...DEFAULTS };
        changed = true;
    }

    const settings = context.extensionSettings[MODULE];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (!(key in settings)) {
            settings[key] = value;
            changed = true;
        }
    }

    const normalized = {
        version: DEFAULTS.version,
        enabled: typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULTS.enabled,
        palette: PALETTE_IDS.includes(settings.palette) ? settings.palette : DEFAULTS.palette,
        crt: typeof settings.crt === 'boolean' ? settings.crt : DEFAULTS.crt,
        minimal: typeof settings.minimal === 'boolean' ? settings.minimal : DEFAULTS.minimal,
        topbarVisible: typeof settings.topbarVisible === 'boolean' ? settings.topbarVisible : DEFAULTS.topbarVisible,
        avatarVisible: typeof settings.avatarVisible === 'boolean' ? settings.avatarVisible : DEFAULTS.avatarVisible,
        chatTopbarVisible: typeof settings.chatTopbarVisible === 'boolean' ? settings.chatTopbarVisible : DEFAULTS.chatTopbarVisible,
        bottomBarVisible: typeof settings.bottomBarVisible === 'boolean' ? settings.bottomBarVisible : DEFAULTS.bottomBarVisible,
    };

    for (const [key, value] of Object.entries(normalized)) {
        if (settings[key] !== value) {
            settings[key] = value;
            changed = true;
        }
    }

    return { settings, changed };
}

function getSettings() {
    return ensureSettings().settings;
}

function save() {
    ctx()?.saveSettingsDebounced?.();
}

function hideHome() {
    if (typeof document !== 'undefined') document.body?.classList.remove(HOME_VISIBLE_CLASS);
}

function restoreBottomBar() {
    if (!bottomBarState) return;
    let hidden = bottomBarState.hidden;
    try {
        const stored = globalThis.localStorage?.getItem?.(BOTTOM_BAR_VISIBILITY_KEY);
        if (stored === 'true' || stored === 'false') hidden = stored === 'false';
    } catch {
        // Fall back to the captured host state when storage is unavailable.
    }
    bottomBarState.node?.classList.toggle('displayNone', hidden);
    bottomBarState = null;
}

function syncBottomBar(enabled, visible) {
    if (!enabled) {
        restoreBottomBar();
        return;
    }

    const node = document.getElementById('sb-bottom-chat-bar');
    if (!node) return;
    if (bottomBarState?.node !== node) {
        restoreBottomBar();
        bottomBarState = { node, hidden: node.classList.contains('displayNone') };
    }
    node.classList.toggle('displayNone', !visible);
}

function apply() {
    if (typeof document === 'undefined' || !document.body) {
        return;
    }

    const settings = getSettings();
    const enabled = active && settings.enabled;
    document.body.classList.toggle('sbterm', enabled);
    document.body.classList.toggle('sbterm-minimal', enabled && settings.minimal);
    document.body.classList.toggle('sbterm-crt', enabled && settings.crt);
    document.body.classList.toggle('sbterm-topbar-hidden', enabled && !settings.topbarVisible);
    document.body.classList.toggle('sbterm-avatar-hidden', enabled && !settings.avatarVisible);
    document.body.classList.toggle('sbterm-chat-topbar-hidden', enabled && !settings.chatTopbarVisible);
    document.body.classList.toggle('sbterm-bottom-bar-hidden', enabled && !settings.bottomBarVisible);

    syncBottomBar(enabled, settings.bottomBarVisible);
    syncMoonlitSuppression(enabled);

    if (enabled) {
        document.body.dataset.sbtermPalette = settings.palette;
    } else {
        delete document.body.dataset.sbtermPalette;
    }

    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.hidden = !enabled;

    syncDrawer();
    void renderStatusline();
}

function updateSettings(patch) {
    const settings = getSettings();
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
        if (settings[key] !== value) {
            settings[key] = value;
            changed = true;
        }
    }
    if (changed) {
        if ('enabled' in patch || 'minimal' in patch) hideHome();
        if ('enabled' in patch) {
            // ponytail: /sbterm off (and the settings drawer) must be fully
            // reversible: drop the injected UI, hand host bars back, rebuild
            // on re-enable. Fixes the audit P1 reversibility finding.
            if (settings.enabled) rebuildDom();
            else teardownDom();
        }
        settings.version = DEFAULTS.version;
        save();
        apply();
    }
    return changed;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function checkboxRow(id, labelText, checked, onChange) {
    const label = el('label', 'checkbox_label');
    const input = el('input');
    input.id = id;
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, el('span', undefined, labelText));
    return label;
}

function selectRow(id, labelText, options, selected, onChange) {
    const label = el('label', 'sbterm-setting-row');
    label.appendChild(el('span', undefined, labelText));
    const select = el('select', 'text_pole');
    select.id = id;
    for (const [value, text] of options) {
        const option = el('option', undefined, text);
        option.value = value;
        select.appendChild(option);
    }
    select.value = selected;
    select.addEventListener('change', () => onChange(select.value));
    label.appendChild(select);
    return label;
}

function renderDrawer() {
    if (typeof document === 'undefined') {
        return;
    }

    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById(DRAWER_ID)) {
        syncDrawer();
        return;
    }

    const settings = getSettings();
    const drawer = el('div', 'inline-drawer');
    drawer.id = DRAWER_ID;

    const toggle = el('button', 'inline-drawer-toggle inline-drawer-header');
    toggle.id = 'sbterm-settings-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', 'sbterm-settings-content');
    toggle.setAttribute('aria-expanded', 'false');
    const icon = el('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down');
    icon.id = 'sbterm-settings-icon';
    toggle.append(el('b', undefined, 'Terminal UI'), icon);

    const content = el('div', 'inline-drawer-content sbterm-settings-content');
    content.id = 'sbterm-settings-content';
    toggle.addEventListener('click', () => globalThis.setTimeout?.(syncDrawerDisclosure, 0));
    content.append(
        checkboxRow('sbterm-enabled', 'Enable Terminal UI', settings.enabled, value => updateSettings({ enabled: value })),
        selectRow('sbterm-density', 'Interface', [['terminal', 'Terminal'], ['full', 'Full chrome']], settings.minimal ? 'terminal' : 'full', value => updateSettings({ minimal: value === 'terminal' })),
        selectRow('sbterm-palette', 'Palette', PALETTES, settings.palette, value => updateSettings({ palette: value })),
        checkboxRow('sbterm-crt', 'CRT overlay (optional)', settings.crt, value => updateSettings({ crt: value })),
        el('small', 'sbterm-command-hint', 'Navigate from either prompt with /sbterm. Type /sbterm and use autocomplete.'),
    );

    drawer.append(toggle, content);
    host.appendChild(drawer);
}

function syncDrawerDisclosure() {
    const toggle = document.getElementById('sbterm-settings-toggle');
    const icon = document.getElementById('sbterm-settings-icon');
    if (toggle && icon) toggle.setAttribute('aria-expanded', String(icon.classList.contains('up')));
}

function syncDrawer() {
    if (typeof document === 'undefined') {
        return;
    }
    const settings = getSettings();
    const enabled = document.getElementById('sbterm-enabled');
    const density = document.getElementById('sbterm-density');
    const palette = document.getElementById('sbterm-palette');
    const crt = document.getElementById('sbterm-crt');
    if (enabled) enabled.checked = settings.enabled;
    if (density) density.value = settings.minimal ? 'terminal' : 'full';
    if (palette) palette.value = settings.palette;
    if (crt) crt.checked = settings.crt;
}

function ensureStatusline() {
    if (typeof document === 'undefined') {
        return null;
    }

    const existing = document.getElementById(STATUS_ID);
    if (existing) {
        return existing;
    }

    const brand = document.querySelector('#sb-topbar-inner > .sb-topbar-brand');
    if (!brand) {
        return null;
    }

    const banner = el('div', 'sbterm-banner');
    banner.id = BANNER_ID;
    banner.hidden = !active || !getSettings().enabled;

    const mascot = el('button', 'sbterm-mascot sbterm-mascot-button');
    mascot.type = 'button';
    mascot.setAttribute('aria-label', 'Open Agents Quick Access');
    mascot.setAttribute('title', 'Open Agents Quick Access');
    mascot.innerHTML = BUNNY_SVG;

    const copy = el('div', 'sbterm-banner-copy');
    copy.appendChild(el('strong', 'sbterm-banner-title', 'sillybunny terminal'));

    const statusRow = el('div', 'sbterm-status-row');
    const status = el('span', 'sbterm-statusline');
    status.id = STATUS_ID;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const details = el('button', 'sbterm-status-details', 'more');
    details.id = STATUS_DETAILS_ID;
    details.type = 'button';
    details.setAttribute('aria-label', 'Show full terminal status');
    details.setAttribute('aria-describedby', STATUS_ID);
    statusRow.append(status, details);
    copy.appendChild(statusRow);
    banner.append(mascot, copy);
    brand.appendChild(banner);
    return status;
}

function ensureFormMascot() {
    if (typeof document === 'undefined') return null;
    const form = document.querySelector('#form_sheld');
    if (!form) return null;
    if (!document.querySelector('.sbterm-mascot-form')) {
        const mascot = el('span', 'sbterm-mascot sbterm-mascot-form');
        mascot.setAttribute('aria-hidden', 'true');
        mascot.innerHTML = BUNNY_SVG;
        form.prepend?.(mascot);
    }
    if (!document.querySelector('.sbterm-command-glossary')) {
        const glossary = el('section', 'sbterm-command-glossary');
        const heading = el('h2', 'sbterm-command-glossary-title', 'Commands');
        heading.id = 'sbterm-command-glossary-title';
        glossary.setAttribute('aria-labelledby', heading.id);
        const list = el('ul', 'sbterm-command-glossary-list');
        for (const [command, help] of COMMAND_GLOSSARY) {
            const row = el('li', 'sbterm-command-glossary-row');
            row.append(
                el('code', 'sbterm-command-glossary-command', command),
                el('span', 'sbterm-command-glossary-help', help),
            );
            list.appendChild(row);
        }
        glossary.append(heading, list);
        form.appendChild(glossary);
    }
    return form;
}

const CHAT_TOPBAR_ID = 'sbterm-chat-topbar';

function ensureChatTopbar() {
    if (typeof document === 'undefined') return null;
    const form = document.querySelector('#form_sheld');
    if (!form) return null;
    let topbar = document.getElementById(CHAT_TOPBAR_ID);
    if (!topbar) {
        topbar = el('div', 'sbterm-chat-topbar');
        topbar.id = CHAT_TOPBAR_ID;
        form.insertBefore?.(topbar, form.firstChild);
    }

    // ponytail: host extensions (Guided Generations, Quick Replies) build their
    // bars inside #send_form whenever they want; a live observer re-captures
    // them whenever they appear, so nothing is missed after a 30s window.
    const capture = selector => {
        const node = document.querySelector(selector);
        if (!node || node.parentElement === topbar) return;
        const record = { node, parent: node.parentElement, sibling: node.nextSibling };
        const previous = capturedHostNodes.findIndex(item => item.node === node);
        if (previous === -1) capturedHostNodes.push(record);
        else capturedHostNodes[previous] = record;
        topbar.appendChild(node);
    };

    const target = document.getElementById('send_form') ?? form;
    if (chatTopbarObserverTarget !== target) {
        chatTopbarObserver?.disconnect();
        chatTopbarObserver = null;
        chatTopbarObserverTarget = target;
    }
    if (!chatTopbarObserver && typeof MutationObserver !== 'undefined') {
        chatTopbarObserver = new MutationObserver(() => {
            capture('#qr--bar');
            capture('#gg-action-button-container');
        });
        chatTopbarObserver.observe(target, { childList: true, subtree: true });
    }
    capture('#qr--bar');
    capture('#gg-action-button-container');
    return topbar;
}

function restoreHostNodes() {
    const topbar = document.getElementById(CHAT_TOPBAR_ID);
    for (const record of capturedHostNodes.splice(0)) {
        const { node, parent, sibling } = record;
        if (!node || !parent || parent.isConnected === false || (topbar && node.parentElement !== topbar)) continue;
        if (typeof parent.insertBefore === 'function') {
            parent.insertBefore(node, sibling?.parentNode === parent ? sibling : null);
        } else {
            parent.appendChild(node);
        }
    }
}

function teardownDom() {
    if (typeof document === 'undefined') return;
    chatTopbarObserver?.disconnect();
    chatTopbarObserver = null;
    chatTopbarObserverTarget = null;
    conversationObserver?.disconnect();
    conversationObserver = null;
    autocompleteObserver?.disconnect();
    autocompleteObserver = null;
    conversationAutocomplete?.hide?.();
    composerResizeObserver?.disconnect();
    composerResizeObserver = null;
    autocompleteAlignQueued = false;
    restoreBottomBar();
    restoreHostNodes();
    clearHomeAutocompleteAlignment();
    document.querySelector?.('#form_sheld')?.style?.removeProperty?.('--sbterm-composer-row-width');
    document.getElementById(CHAT_TOPBAR_ID)?.remove();
    document.getElementById(BANNER_ID)?.remove();
    document.querySelector('.sbterm-mascot-form')?.remove();
    document.querySelector('.sbterm-command-glossary')?.remove();
}

function rebuildDom() {
    if (!active || !getSettings().enabled) return;
    ensureStatusline();
    ensureFormMascot();
    ensureChatTopbar();
    observeComposerRow();
    observeConversationTimeline();
    observeAutocomplete();
    void ensureConversationAutocomplete();
}

function alignChatBars() {
    if (typeof document === 'undefined') return;
    const form = document.querySelector?.('#form_sheld');
    const rect = document.getElementById('nonQRFormItems')?.getBoundingClientRect?.();
    if (!form?.style || !rect) return;
    form.style.setProperty('--sbterm-composer-row-width', `${rect.width}px`);
}

function observeComposerRow() {
    composerResizeObserver?.disconnect();
    composerResizeObserver = null;
    alignChatBars();
    const row = typeof document === 'undefined' ? null : document.getElementById('nonQRFormItems');
    if (!active || !getSettings().enabled || !row || typeof ResizeObserver === 'undefined') return;
    composerResizeObserver = new ResizeObserver(alignChatBars);
    composerResizeObserver.observe(row);
}

function cleanStatusPart(value, fallback = '-') {
    const text = String(value ?? '').replace(/[\r\n|]+/g, ' ').trim();
    return text || fallback;
}

function currentChatLabel(context) {
    if (context?.groupId) {
        const group = context.groups?.find(item => String(item?.id) === String(context.groupId));
        return `${cleanStatusPart(group?.name, 'group')}/${cleanStatusPart(context.getCurrentChatId?.(), 'new')}`;
    }

    const character = context?.characters?.[context.characterId];
    const name = character?.name ?? context?.name2;
    const chat = context?.getCurrentChatId?.() ?? character?.chat;
    if (!name && !chat) {
        return 'home';
    }
    return `${cleanStatusPart(name, 'chat')}/${cleanStatusPart(chat, 'new')}`;
}

async function queryHostCommand(context, name) {
    const command = context?.SlashCommandParser?.commands?.[name];
    if (!command?.callback || command === registeredCommand) {
        return '';
    }
    try {
        return cleanStatusPart(await command.callback({ quiet: 'true' }, ''), '');
    } catch {
        return '';
    }
}

async function connectionSummary(context) {
    const disconnected = !context || context.onlineStatus === 'no_connection';
    const api = await queryHostCommand(context, 'api') || cleanStatusPart(context?.mainApi, 'api');
    let model = await queryHostCommand(context, 'model');
    if (!model && context?.mainApi === 'openai') {
        model = cleanStatusPart(context.getChatCompletionModel?.(), '');
    }
    if (!model && !disconnected) {
        model = cleanStatusPart(context?.onlineStatus, '');
    }
    return {
        disconnected,
        text: [api, model && model !== api ? model : ''].filter(Boolean).join('/'),
    };
}

function parseCount(value) {
    const count = Number(String(value ?? '').replaceAll(',', '').trim());
    return Number.isFinite(count) && count >= 0 ? count : null;
}

function formatCount(value) {
    if (!Number.isFinite(value)) return '-';
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return String(Math.round(value));
}

function statusIdentity(context, connection) {
    return [context?.groupId ?? '', context?.characterId ?? '', context?.getCurrentChatId?.() ?? '', connection].join('\u001f');
}

function isConversationMode() {
    return Boolean(document.querySelector('#sheld[data-sb-conversation-mode=on]'));
}

function currentRunState(connection, conversationMode) {
    if (connection.disconnected) return 'disconnected';
    if (conversationMode) {
        return document.querySelector('.sb-conversation-typing-indicator, .sb-conversation-image-pending') ? 'generating' : 'idle';
    }
    if (document.body?.dataset.generating || document.getElementById('send_form')?.classList.contains('sb-generating-controls')) return 'generating';
    if (document.getElementById('form_sheld')?.classList.contains('isExecutingCommandsFromChatInput')) return 'command';
    return 'idle';
}

async function renderStatusline() {
    if (!active || typeof document === 'undefined') {
        return '';
    }

    const settings = getSettings();
    if (!settings.enabled) {
        lastStatusText = `terminal:off | ui:${settings.minimal ? 'terminal' : 'full'} | palette:${settings.palette}`;
        return lastStatusText;
    }

    const status = ensureStatusline();
    const context = ctx();
    if (!status || !context) {
        return '';
    }

    const sequence = ++renderSequence;
    const conversationMode = isConversationMode();
    const connection = await connectionSummary(context);
    if (!active || sequence !== renderSequence) {
        return lastStatusText;
    }

    const profile = conversationMode ? cleanStatusPart(document.getElementById('sb_conv_connection_profile')?.value, '') : '';
    const connectionText = profile ? `profile:${profile}` : connection.text;
    const identity = statusIdentity(context, connectionText);
    const maxContext = parseCount(context.substituteParams?.('{{maxContext}}'));
    const prompt = !conversationMode && identity === lastPromptIdentity ? lastPromptTokens : null;
    const locationPrefix = conversationMode ? 'dm' : 'chat';
    const runState = currentRunState(connection, conversationMode);
    const nextStatusText = `run:${runState} | ${locationPrefix}:${currentChatLabel(context)} | api:${cleanStatusPart(connectionText)} | prompt:${conversationMode ? 'n/a' : formatCount(prompt)}/${formatCount(maxContext)}`;
    lastStatusText = nextStatusText;
    if (status.textContent !== nextStatusText) status.textContent = nextStatusText;
    status.title = lastStatusText;
    status.dataset.state = runState;
    const details = document.getElementById(STATUS_DETAILS_ID);
    if (details) {
        const disconnected = runState === 'disconnected';
        details.textContent = disconnected ? 'connect' : 'more';
        details.dataset.action = disconnected ? 'connect' : 'status';
        details.setAttribute('aria-label', disconnected ? 'Open API connection settings' : 'Show full terminal status');
        details.title = lastStatusText;
    }
    return lastStatusText;
}

async function countPromptTokens(prompt, context) {
    if (Array.isArray(prompt)) {
        const { countChatCompletionPayloadTokensOpenAIAsync } = await import('/scripts/tokenizers.js');
        return countChatCompletionPayloadTokensOpenAIAsync(prompt);
    }
    if (typeof prompt === 'string') {
        return context.getTokenCountAsync?.(prompt);
    }
    return null;
}

async function recordPromptTokens(generateData, dryRun) {
    if (!active || dryRun || isConversationMode()) {
        return;
    }

    const context = ctx();
    if (!context) return;
    const sequence = ++tokenSequence;
    const connection = await connectionSummary(context);
    const identity = statusIdentity(context, connection.text);

    try {
        const count = parseCount(await countPromptTokens(generateData?.prompt, context));
        if (!active || sequence !== tokenSequence) return;
        lastPromptTokens = count;
        lastPromptIdentity = identity;
        void renderStatusline();
    } catch (error) {
        if (sequence === tokenSequence) {
            lastPromptTokens = null;
            lastPromptIdentity = '';
            void renderStatusline();
        }
        console.warn('Terminal UI could not count the assembled prompt', error);
    }
}

function invalidatePromptTokens() {
    tokenSequence += 1;
    lastPromptTokens = null;
    lastPromptIdentity = '';
    void renderStatusline();
}

function notify(message, severity = 'info') {
    const toast = globalThis.toastr?.[severity];
    if (typeof toast === 'function') {
        toast.call(globalThis.toastr, message, 'Terminal UI');
    } else if (severity === 'warning' || severity === 'error') {
        console.warn(`Terminal UI: ${message}`);
    }
}

function nextFrame() {
    return new Promise(resolve => (globalThis.requestAnimationFrame ?? globalThis.setTimeout)(resolve));
}

async function openQuickAccess() {
    const shell = globalThis.SillyBunnyShell;
    if (typeof shell?.openTab !== 'function') {
        notify('Quick Access is unavailable.', 'warning');
        return false;
    }
    shell.openTab('left', 'agents');
    await nextFrame();
    await nextFrame();
    document.querySelector("#ica--agentTabs > .ica--agent-tab[data-tab='quick']")?.click();
    return true;
}

async function openAppearance() {
    const shell = globalThis.SillyBunnyShell;
    if (typeof shell?.openTab !== 'function') return false;
    shell.openTab('right', 'settings');
    await nextFrame();
    await nextFrame();
    const section = document.getElementById('AppearanceSection');
    const content = section?.querySelector(':scope > .inline-drawer-content');
    if (content && getComputedStyle(content).display === 'none') {
        section.querySelector(':scope > .inline-drawer-toggle')?.click();
        await nextFrame();
    }
    document.getElementById('UI-presets-block')?.scrollIntoView({ block: 'start' });
    return true;
}

async function openConversation() {
    const conversation = await import('/scripts/sillybunny-conversation.js');
    const context = ctx();
    const avatar = context?.characters?.[context.characterId]?.avatar;
    if (avatar && await conversation.openConversationWorkspaceForAvatar?.(avatar)) {
        return true;
    }
    return Boolean(await conversation.openConversationWorkspaceFromWelcome?.());
}

async function showHomepage() {
    const home = document.getElementById('sb-home-toggle');
    if (!home) return false;

    if (!document.querySelector('.welcomePanel')) {
        const closeCurrentChat = ctx()?.closeCurrentChat;
        if (typeof closeCurrentChat !== 'function' || !await closeCurrentChat()) return false;
    }

    if (!document.querySelector('.welcomePanel')) return false;
    document.body?.classList.add(HOME_VISIBLE_CLASS);
    nativeHomeClick = true;
    try {
        home.click();
    } finally {
        nativeHomeClick = false;
    }
    return true;
}

async function showTerminalHome() {
    if (!document.querySelector('.welcomePanel')) {
        const closeCurrentChat = ctx()?.closeCurrentChat;
        if (typeof closeCurrentChat !== 'function' || !await closeCurrentChat()) return false;
    }

    if (!document.querySelector('.welcomePanel')) return false;
    hideHome();
    return true;
}

async function openChats() {
    if (!await showHomepage()) return false;
    const showMore = document.querySelector('.showMoreChats');
    if (showMore && !showMore.classList.contains('rotated')) showMore.click();
    const recentChats = document.querySelector('.welcomeRecentShell');
    recentChats?.scrollIntoView({ block: 'start' });
    return Boolean(recentChats);
}

async function openDestination(destination) {
    const shellTarget = SHELL_DESTINATIONS[destination];
    const shell = globalThis.SillyBunnyShell;
    if (shellTarget) {
        if (typeof shell?.openTab !== 'function') return false;
        shell.openTab(...shellTarget);
        return true;
    }

    switch (destination) {
        case 'search':
            if (typeof shell?.openGlobalSearch !== 'function') return false;
            shell.openGlobalSearch({ focusInput: true });
            return true;
        case 'chat-tools':
            if (typeof shell?.openChatTools !== 'function') return false;
            shell.openChatTools();
            return true;
        case 'open-chats':
            return openChats();
        case 'appearance':
            return openAppearance();
        case 'home':
            return showTerminalHome();
        case 'open-homepage':
            return showHomepage();
        case 'conversation':
            return openConversation();
        case 'roleplay': {
            const conversation = await import('/scripts/sillybunny-conversation.js');
            await conversation.disableConversationModeForCurrentCharacter?.({ focusRoleplay: true });
            return true;
        }
        default:
            return false;
    }
}

async function runSbtermCommand(_named, unnamed) {
    if (!active) {
        return 'Terminal UI is disabled.';
    }

    const input = String(unnamed ?? '').trim();
    if (!input || input === 'status') {
        const status = await renderStatusline();
        notify(status || 'Status unavailable.');
        return status;
    }

    if (input === 'on' || input === 'off') {
        updateSettings({ enabled: input === 'on' });
        notify(`Terminal UI ${input === 'on' ? 'enabled' : 'disabled'}.`, 'success');
        return input;
    }

    if (input === 'ui terminal' || input === 'ui full') {
        const mode = input.endsWith('terminal') ? 'terminal' : 'full';
        updateSettings({ minimal: mode === 'terminal' });
        notify(`Interface: ${mode}.`, 'success');
        return mode;
    }

    if (input === 'crt on' || input === 'crt off') {
        const enabled = input.endsWith('on');
        updateSettings({ crt: enabled });
        notify(`CRT overlay ${enabled ? 'enabled' : 'disabled'}.`, 'success');
        return String(enabled);
    }

    if (input.startsWith('palette ')) {
        const palette = input.slice('palette '.length).trim();
        if (!PALETTE_IDS.includes(palette)) {
            notify(`Unknown palette: ${palette || '(empty)'}.`, 'warning');
            return `unknown palette: ${palette}`;
        }
        updateSettings({ palette });
        notify(`Palette: ${palette}.`, 'success');
        return palette;
    }

    if (await openDestination(input)) {
        void renderStatusline();
        return input;
    }

    notify(`Unknown destination or action: ${input}.`, 'warning');
    return `unknown action: ${input}`;
}

async function runHomeCommand() {
    if (!active) return 'Terminal UI is disabled.';
    const opened = await showTerminalHome();
    if (!opened) notify('Home is unavailable.', 'warning');
    return opened ? 'home' : 'home unavailable';
}

function unregisterCommands() {
    if (registeredCommand && commandParser?.commands?.[COMMAND_NAME] === registeredCommand) {
        delete commandParser.commands[COMMAND_NAME];
    }
    if (registeredHomeCommand && commandParser?.commands?.[HOME_COMMAND_NAME] === registeredHomeCommand) {
        delete commandParser.commands[HOME_COMMAND_NAME];
    }
    for (const { name, command } of registeredTopLevel.splice(0)) {
        if (commandParser?.commands?.[name] === command) delete commandParser.commands[name];
    }
    registeredCommand = null;
    registeredHomeCommand = null;
    commandParser = null;
}

function registerCommand() {
    if (!active || registeredCommand) return Boolean(registeredCommand);
    const context = ctx();
    const parser = context?.SlashCommandParser;
    const SlashCommand = context?.SlashCommand;
    const SlashCommandArgument = context?.SlashCommandArgument;
    const SlashCommandEnumValue = context?.SlashCommandEnumValue;
    const ARGUMENT_TYPE = context?.ARGUMENT_TYPE;
    if (!parser || !SlashCommand || !SlashCommandArgument || !ARGUMENT_TYPE) return false;

    if (parser.commands?.[COMMAND_NAME]) {
        console.error(`Terminal UI could not register /${COMMAND_NAME}: name collision`);
        return false;
    }

    const enumProvider = SlashCommandEnumValue
        ? () => COMMAND_OPTIONS.map(([value, description]) => new SlashCommandEnumValue(value, description))
        : null;
    const command = SlashCommand.fromProps({
        name: COMMAND_NAME,
        callback: runSbtermCommand,
        helpString: 'Navigate Terminal UI, change its density or palette, and inspect the live statusline. Existing SillyBunny commands such as /api, /model, /preset, /theme, and /chat-manager remain unchanged.',
        returns: 'the selected action or current status',
        unnamedArgumentList: [SlashCommandArgument.fromProps({
            description: 'action or destination',
            typeList: [ARGUMENT_TYPE.STRING],
            enumList: COMMAND_OPTIONS.map(([value]) => value),
            enumProvider,
        })],
    });

    commandParser = parser;
    registeredCommand = command;
    try {
        parser.addCommandObject(command);
        return true;
    } catch (error) {
        if (parser.commands?.[COMMAND_NAME] === command) delete parser.commands[COMMAND_NAME];
        registeredCommand = null;
        console.error(`Terminal UI could not register /${COMMAND_NAME}`, error);
        return false;
    }
}

function registerHomeCommand() {
    if (!active || registeredHomeCommand) return Boolean(registeredHomeCommand);
    const context = ctx();
    const parser = context?.SlashCommandParser;
    const SlashCommand = context?.SlashCommand;
    if (!parser || !SlashCommand) return false;

    if (parser.commands?.[HOME_COMMAND_NAME]) {
        console.error(`Terminal UI could not register /${HOME_COMMAND_NAME}: name collision`);
        return false;
    }

    const command = SlashCommand.fromProps({
        name: HOME_COMMAND_NAME,
        callback: runHomeCommand,
        helpString: 'Return to the terminal Home screen; use /open-homepage to reveal the native SillyBunny Home page.',
        returns: 'home or home unavailable',
    });

    commandParser = parser;
    registeredHomeCommand = command;
    try {
        parser.addCommandObject(command);
        return true;
    } catch (error) {
        if (parser.commands?.[HOME_COMMAND_NAME] === command) delete parser.commands[HOME_COMMAND_NAME];
        registeredHomeCommand = null;
        console.error(`Terminal UI could not register /${HOME_COMMAND_NAME}`, error);
        return false;
    }
}

function registerCommands() {
    registerCommand();
    registerHomeCommand();
    registerTopLevelCommands();
}

function runDestinationCommand(destination) {
    return async () => {
        if (!active) return 'Terminal UI is disabled.';
        const opened = await openDestination(destination);
        if (!opened) notify(`Could not open ${destination}.`, 'warning');
        return opened ? destination : `${destination} unavailable`;
    };
}

function runToggleCommand(name) {
    return async () => {
        if (!active) return 'Terminal UI is disabled.';
        if (name === 'hide-home') {
            hideHome();
            notify('Home hidden.');
            return 'home hidden';
        }
        const config = TOGGLE_CONFIG[name];
        updateSettings(config.patch);
        notify(config.success, 'success');
        return String(config.patch[Object.keys(config.patch)[0]]);
    };
}

function registerTopLevelCommands() {
    if (!active || registeredTopLevel.length) return;
    const context = ctx();
    const parser = context?.SlashCommandParser;
    const SlashCommand = context?.SlashCommand;
    if (!parser || !SlashCommand) return;

    const register = (name, callback, helpString) => {
        if (parser.commands?.[name]) return;
        try {
            const command = SlashCommand.fromProps({ name, callback, helpString, returns: 'the command result' });
            parser.addCommandObject(command);
            registeredTopLevel.push({ name, command });
        } catch (error) {
            console.error(`Terminal UI could not register /${name}`, error);
        }
    };

    for (const destination of Object.keys(SHELL_DESTINATIONS)) {
        const name = openCommandName(destination);
        register(name, runDestinationCommand(destination), `Open the ${destinationLabel(destination)} panel.`);
    }
    for (const name of ['search', 'chat-tools', 'open-chats', 'appearance', 'open-homepage']) {
        register(name, runDestinationCommand(name), `Open the ${destinationLabel(name)} panel.`);
    }
    for (const name of TOGGLE_COMMANDS) {
        register(name, runToggleCommand(name), name === 'hide-home'
            ? 'Replace the native Home page with Terminal Home.'
            : `Toggle Terminal UI: ${name.replaceAll('-', ' ')}.`);
    }
}

function isOwnedCommand(input) {
    const command = String(input ?? '').trim();
    const name = command.match(/^\/([^\s|]+)/)?.[1]?.toLowerCase();
    const topLevel = registeredTopLevel.find(item => item.name === name);
    return active && (
        (registeredCommand && commandParser?.commands?.[COMMAND_NAME] === registeredCommand && /^\/sbterm(?:\s|$)/.test(command)) ||
        (registeredHomeCommand && commandParser?.commands?.[HOME_COMMAND_NAME] === registeredHomeCommand && /^\/home\s*$/.test(command)) ||
        (topLevel && commandParser?.commands?.[name] === topLevel.command)
    );
}

function isRegisteredConversationCommand(command, input) {
    const name = String(command ?? '').trim().match(/^\/([^\s|]+)/)?.[1]?.toLowerCase();
    return active && input?.id === 'sb_conversation_input' && name && !CONVERSATION_COMMANDS.has(name) && Boolean(ctx()?.SlashCommandParser?.commands?.[name]);
}

function clearCommandInput(input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function executeOwnedCommand(event, input) {
    const command = input.value.trim();
    if (!isOwnedCommand(command) && !isRegisteredConversationCommand(command, input)) return false;
    const context = ctx();
    const execute = context?.executeSlashCommandsWithOptions;
    if (typeof execute !== 'function') return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearCommandInput(input);
    const recover = error => {
        if (error) console.error('Terminal UI could not execute the command', error);
        const restored = input.value === '';
        if (restored) {
            input.value = command;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus?.();
        }
        notify(restored ? 'Command failed. Your command was restored.' : 'Command failed. Your current input was kept.', 'error');
    };
    Promise.resolve(execute.call(context, command, {
        handleParserErrors: false,
        handleExecutionErrors: true,
        source: MODULE,
    })).then(result => {
        if (result?.isError) recover();
    }).catch(recover);
    return true;
}

function onDocumentClick(event) {
    globalThis.setTimeout?.(syncDrawerDisclosure, 0);
    const details = event.target?.closest?.('.sbterm-status-details');
    if (details) {
        if (details.dataset.action === 'connect') {
            void openDestination('open-api');
            return;
        }
        const status = document.getElementById('sbterm-statusline');
        if (status?.textContent || status?.title) notify(status.textContent || status.title);
        return;
    }
    if (event.type === 'click' && event.target?.closest?.('.sbterm-mascot-button')) {
        void openQuickAccess();
        return;
    }
    if (event.type === 'click' && !nativeHomeClick && document.body?.classList.contains('sbterm-minimal') && event.target?.closest?.('#sb-home-toggle')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void showHomepage();
        return;
    }
    if (!event.target?.closest?.('#send_but') && !event.target?.closest?.('#gg_simple_send_button')) return;
    const input = document.getElementById('send_textarea');
    if (input) executeOwnedCommand(event, input);
}

function onConversationSubmit(event) {
    if (event.target?.id !== 'sb_conversation_form') return;
    const input = document.getElementById('sb_conversation_input');
    if (input) executeOwnedCommand(event, input);
    queueConversationStatusRefresh();
}

function onCommandKeydown(event) {
    const conversation = event.target?.id === 'sb_conversation_input';
    if (!conversation && event.target?.id !== 'send_textarea') return;
    if (conversation && event.key === 'Enter' && conversationAutocompleteInput === event.target && conversationAutocomplete?.isActive) {
        void conversationAutocomplete.handleKeyDown(event);
        if (event.defaultPrevented) return;
    }
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!ctx()?.shouldSendOnEnter?.()) return;
    executeOwnedCommand(event, event.target);
    if (conversation) queueConversationStatusRefresh();
}

function observeConversationTimeline() {
    conversationObserver?.disconnect();
    conversationObserver = null;
    if (!active || !getSettings().enabled || typeof MutationObserver === 'undefined') return;
    const timeline = document.getElementById('sb_conversation_timeline');
    if (!timeline) return;
    conversationObserver = new MutationObserver(() => void renderStatusline());
    conversationObserver.observe(timeline, { childList: true });
}

function queueConversationStatusRefresh() {
    globalThis.setTimeout?.(() => {
        observeConversationTimeline();
        void ensureConversationAutocomplete();
        void renderStatusline();
    }, 0);
}

async function ensureConversationAutocomplete() {
    const input = typeof document === 'undefined' ? null : document.getElementById('sb_conversation_input');
    if (!active || !getSettings().enabled || !isConversationMode() || !input) {
        conversationAutocomplete?.hide?.();
        return;
    }
    if (conversationAutocompleteInput === input || conversationAutocompletePendingInput === input) return;

    conversationAutocompletePendingInput = input;
    try {
        const contextInitializer = ctx()?.setSlashCommandAutoComplete;
        const initializer = typeof contextInitializer === 'function'
            ? contextInitializer
            : (await import('/scripts/slash-commands.js')).setSlashCommandAutoComplete;
        if (typeof initializer !== 'function' || !active || !getSettings().enabled || !isConversationMode() || !input.isConnected) return;

        const autocomplete = await initializer(input);
        if (!autocomplete) return;
        const shouldActivate = autocomplete.checkIfActivate.bind(autocomplete);
        autocomplete.checkIfActivate = () => active && getSettings().enabled && isConversationMode() && input.isConnected && shouldActivate();
        if (!active || !getSettings().enabled || !isConversationMode() || !input.isConnected) {
            autocomplete.hide?.();
            return;
        }
        conversationAutocomplete?.hide?.();
        conversationAutocomplete = autocomplete;
        conversationAutocompleteInput = input;
    } catch (error) {
        console.error('Terminal UI could not enable Conversation slash previews', error);
    } finally {
        if (conversationAutocompletePendingInput === input) conversationAutocompletePendingInput = null;
    }
}

let autocompleteAlignQueued = false;

function alignHomeAutocomplete() {
    if (typeof document === 'undefined') return;
    const wraps = document.querySelectorAll?.('.autoComplete-wrap:not(.isFloating), .autoComplete-detailsWrap.full:not(.isFloating)') ?? [];
    const input = !isConversationMode() && !document.body?.classList.contains(HOME_VISIBLE_CLASS)
        ? document.querySelector?.('#sheld:has(#chat .welcomePanel) #send_textarea')
        : null;
    if (!input) {
        for (const wrap of wraps) {
            wrap.style?.removeProperty?.('--sbterm-autocomplete-left');
            wrap.style?.removeProperty?.('--sbterm-autocomplete-right');
        }
        return;
    }
    if (!wraps.length) return;

    const rect = input.getBoundingClientRect?.();
    const viewportLeft = globalThis.visualViewport?.offsetLeft ?? 0;
    const viewportWidth = globalThis.visualViewport?.width ?? globalThis.innerWidth ?? document.documentElement?.clientWidth ?? rect?.right ?? 0;
    for (const wrap of wraps) {
        if (rect) {
            wrap.style?.setProperty?.('--sbterm-autocomplete-left', `${Math.max(0, rect.left - viewportLeft)}px`);
            wrap.style?.setProperty?.('--sbterm-autocomplete-right', `${Math.max(0, viewportLeft + viewportWidth - rect.right)}px`);
        } else {
            wrap.style?.removeProperty?.('--sbterm-autocomplete-left');
            wrap.style?.removeProperty?.('--sbterm-autocomplete-right');
        }
    }
}

function clearHomeAutocompleteAlignment() {
    if (typeof document === 'undefined') return;
    for (const wrap of document.querySelectorAll?.('.autoComplete-wrap:not(.isFloating), .autoComplete-detailsWrap.full:not(.isFloating)') ?? []) {
        wrap.style?.removeProperty?.('--sbterm-autocomplete-left');
        wrap.style?.removeProperty?.('--sbterm-autocomplete-right');
    }
}

function queueAlignHomeAutocomplete() {
    if (autocompleteAlignQueued) return;
    autocompleteAlignQueued = true;
    // ponytail: the host appends autocomplete to <body>, so the observer must
    // watch body, but the callback is now a cheap once-per-frame no-op unless
    // the terminal Home is actually on screen (audit P2 perf finding).
    const align = () => {
        autocompleteAlignQueued = false;
        alignHomeAutocomplete();
        void ensureConversationAutocomplete();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(align);
    } else {
        globalThis.setTimeout?.(align, 0);
    }
}

function observeAutocomplete() {
    autocompleteObserver?.disconnect();
    autocompleteObserver = null;
    if (!active || !getSettings().enabled || typeof MutationObserver === 'undefined' || !document.body) return;
    autocompleteObserver = new MutationObserver(queueAlignHomeAutocomplete);
    autocompleteObserver.observe(document.body, { childList: true, subtree: true });
    alignHomeAutocomplete();
    void ensureConversationAutocomplete();
}

function bindDomEvents() {
    if (typeof document === 'undefined' || domController) return;
    domController = new AbortController();
    const options = { capture: true, signal: domController.signal };
    document.addEventListener('click', onDocumentClick, options);
    document.addEventListener('submit', onConversationSubmit, options);
    document.addEventListener('keydown', onCommandKeydown, options);
    globalThis.addEventListener?.('sb:conversation-workspace-state-changed', queueConversationStatusRefresh, { signal: domController.signal });
    globalThis.addEventListener?.('resize', alignHomeAutocomplete, { signal: domController.signal });
    globalThis.addEventListener?.('resize', alignChatBars, { signal: domController.signal });
    globalThis.visualViewport?.addEventListener?.('resize', alignHomeAutocomplete, { signal: domController.signal });
    globalThis.visualViewport?.addEventListener?.('scroll', alignHomeAutocomplete, { signal: domController.signal });
    observeAutocomplete();
}

function bindHostEvents() {
    const context = ctx();
    const source = context?.eventSource;
    const events = context?.eventTypes ?? context?.event_types;
    if (!source || !events || eventBindings.length) return;

    const bind = (name, handler) => {
        const event = events[name];
        if (!event) return;
        source.on(event, handler);
        eventBindings.push([source, event, handler]);
    };

    const ready = () => {
        if (!active) return;
        renderDrawer();
        registerCommands();
        if (getSettings().enabled) rebuildDom();
        else teardownDom();
        apply();
    };
    const rerender = () => {
        void renderStatusline();
    };
    const invalidate = () => invalidatePromptTokens();
    const chatChanged = () => {
        hideHome();
        invalidatePromptTokens();
    };

    bind('APP_READY', ready);
    bind('CHAT_CHANGED', chatChanged);
    for (const name of ['MAIN_API_CHANGED', 'ONLINE_STATUS_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'SETTINGS_UPDATED']) {
        bind(name, invalidate);
    }
    for (const name of ['CHAT_RENAMED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'GENERATION_AFTER_COMMANDS', 'GENERATION_ENDED', 'GENERATION_STOPPED']) {
        bind(name, rerender);
    }
    bind('GENERATE_AFTER_DATA', (generateData, dryRun) => void recordPromptTokens(generateData, dryRun));
}

function unbindEvents() {
    for (const [source, event, handler] of eventBindings.splice(0)) {
        source.removeListener?.(event, handler);
    }
    domController?.abort();
    domController = null;
    conversationObserver?.disconnect();
    conversationObserver = null;
    autocompleteObserver?.disconnect();
    autocompleteObserver = null;
    composerResizeObserver?.disconnect();
    composerResizeObserver = null;
}

function init() {
    if (active) {
        renderDrawer();
        registerCommands();
        if (getSettings().enabled) rebuildDom();
        else teardownDom();
        apply();
        return;
    }

    active = true;
    hideHome();
    const { changed } = ensureSettings();
    if (changed) save();
    bindHostEvents();
    bindDomEvents();
    registerCommands();
    renderDrawer();
    if (getSettings().enabled) rebuildDom();
    else teardownDom();
    apply();
}

function deactivate() {
    active = false;
    renderSequence += 1;
    tokenSequence += 1;
    unregisterCommands();
    unbindEvents();
    teardownDom();
    syncMoonlitSuppression(false);

    if (typeof document !== 'undefined') {
        document.getElementById(DRAWER_ID)?.remove();
        document.getElementById(BANNER_ID)?.remove();
        document.body?.classList.remove('sbterm', 'sbterm-minimal', 'sbterm-crt', HOME_VISIBLE_CLASS, 'sbterm-topbar-hidden', 'sbterm-avatar-hidden', 'sbterm-chat-topbar-hidden', 'sbterm-bottom-bar-hidden');
        if (document.body) delete document.body.dataset.sbtermPalette;
    }
}

export function activate() {
    init();
}

export function enable() {
    init();
}

export function disable() {
    deactivate();
}
