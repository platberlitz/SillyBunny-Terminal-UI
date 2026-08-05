const MODULE = 'SillyBunny-Terminal-UI';
const DRAWER_ID = 'sbterm-settings-drawer';
const STATUS_ID = 'sbterm-statusline';
const COMMAND_NAME = 'sbterm';

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
const DEFAULTS = { version: 2, enabled: true, palette: 'phosphor-green', crt: false, minimal: true };

const SHELL_DESTINATIONS = {
    workspace: ['left'],
    presets: ['left', 'presets'],
    api: ['left', 'api'],
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

const COMMAND_OPTIONS = [
    ['status', 'Show the current terminal and connection status'],
    ['on', 'Enable Terminal UI'],
    ['off', 'Disable Terminal UI without disabling the extension'],
    ['ui terminal', 'Use command-first terminal density'],
    ['ui full', 'Show the complete host chrome'],
    ['crt on', 'Enable the optional CRT overlay'],
    ['crt off', 'Disable the CRT overlay'],
    ...PALETTES.map(([id, name]) => [`palette ${id}`, `Use the ${name} palette`]),
    ...Object.keys(SHELL_DESTINATIONS).map(destination => [destination, `Open ${destination.replace('-', ' ')}`]),
    ['search', 'Open global search'],
    ['chat-tools', 'Open recent chat tools'],
    ['appearance', 'Open appearance settings'],
    ['home', 'Return to Home'],
    ['conversation', 'Open Conversation Mode'],
    ['roleplay', 'Return to Roleplay Mode'],
];

let active = false;
let commandParser = null;
let registeredCommand = null;
let domController = null;
let conversationObserver = null;
let eventBindings = [];
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

function apply() {
    if (typeof document === 'undefined' || !document.body) {
        return;
    }

    const settings = getSettings();
    const enabled = active && settings.enabled;
    document.body.classList.toggle('sbterm', enabled);
    document.body.classList.toggle('sbterm-minimal', enabled && settings.minimal);
    document.body.classList.toggle('sbterm-crt', enabled && settings.crt);

    if (enabled) {
        document.body.dataset.sbtermPalette = settings.palette;
    } else {
        delete document.body.dataset.sbtermPalette;
    }

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

    const toggle = el('div', 'inline-drawer-toggle inline-drawer-header');
    toggle.append(el('b', undefined, 'Terminal UI'), el('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down'));

    const content = el('div', 'inline-drawer-content sbterm-settings-content');
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

    const status = el('div', 'sbterm-statusline');
    status.id = STATUS_ID;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    brand.appendChild(status);
    return status;
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
    if (conversationMode) {
        return document.querySelector('.sb-conversation-typing-indicator, .sb-conversation-image-pending') ? 'generating' : 'idle';
    }
    if (connection.disconnected) return 'disconnected';
    if (document.body?.dataset.generating || document.getElementById('send_form')?.classList.contains('sb-generating-controls')) return 'generating';
    if (document.getElementById('form_sheld')?.classList.contains('isExecutingCommandsFromChatInput')) return 'command';
    return 'idle';
}

async function renderStatusline() {
    if (!active || typeof document === 'undefined') {
        return '';
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
    const settings = getSettings();

    lastStatusText = settings.enabled
        ? `${locationPrefix}:${currentChatLabel(context)} | api:${cleanStatusPart(connectionText)} | run:${runState} | prompt:${conversationMode ? 'n/a' : formatCount(prompt)}/${formatCount(maxContext)}`
        : `terminal:off | ui:${settings.minimal ? 'terminal' : 'full'} | palette:${settings.palette}`;

    status.textContent = lastStatusText;
    status.title = lastStatusText;
    status.dataset.state = runState;
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
    document.getElementById('UI-presets-block')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
        case 'appearance':
            return openAppearance();
        case 'home': {
            const home = document.getElementById('sb-home-toggle');
            if (!home) return false;
            home.click();
            return true;
        }
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

function unregisterCommand() {
    if (registeredCommand && commandParser?.commands?.[COMMAND_NAME] === registeredCommand) {
        delete commandParser.commands[COMMAND_NAME];
    }
    registeredCommand = null;
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
        unregisterCommand();
        console.error(`Terminal UI could not register /${COMMAND_NAME}`, error);
        return false;
    }
}

function isOwnedCommand(input) {
    return active && registeredCommand && /^\/sbterm(?:\s|$)/.test(String(input ?? '').trim());
}

function clearCommandInput(input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function executeOwnedCommand(event, input) {
    const command = input.value.trim();
    if (!isOwnedCommand(command)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearCommandInput(input);
    Promise.resolve(ctx()?.executeSlashCommandsWithOptions?.(command, {
        handleParserErrors: true,
        handleExecutionErrors: true,
        source: MODULE,
    })).catch(error => {
        console.error('Terminal UI could not execute the command', error);
        notify('Command failed. See the browser console.', 'error');
    });
    return true;
}

function onAlternateSendClick(event) {
    if (!event.target?.closest?.('#gg_simple_send_button')) return;
    const input = document.getElementById('send_textarea');
    if (input) executeOwnedCommand(event, input);
}

function onConversationSubmit(event) {
    if (event.target?.id !== 'sb_conversation_form') return;
    const input = document.getElementById('sb_conversation_input');
    if (input) executeOwnedCommand(event, input);
    queueConversationStatusRefresh();
}

function onConversationKeydown(event) {
    if (event.target?.id !== 'sb_conversation_input' || event.key !== 'Enter' || event.isComposing) return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!ctx()?.shouldSendOnEnter?.()) return;
    executeOwnedCommand(event, event.target);
    queueConversationStatusRefresh();
}

function observeConversationTimeline() {
    conversationObserver?.disconnect();
    conversationObserver = null;
    if (!active || typeof MutationObserver === 'undefined') return;
    const timeline = document.getElementById('sb_conversation_timeline');
    if (!timeline) return;
    conversationObserver = new MutationObserver(() => void renderStatusline());
    conversationObserver.observe(timeline, { childList: true });
}

function queueConversationStatusRefresh() {
    globalThis.setTimeout?.(() => {
        observeConversationTimeline();
        void renderStatusline();
    }, 0);
}

function bindDomEvents() {
    if (typeof document === 'undefined' || domController) return;
    domController = new AbortController();
    const options = { capture: true, signal: domController.signal };
    document.addEventListener('click', onAlternateSendClick, options);
    document.addEventListener('submit', onConversationSubmit, options);
    document.addEventListener('keydown', onConversationKeydown, options);
    globalThis.addEventListener?.('sb:conversation-workspace-state-changed', queueConversationStatusRefresh, { signal: domController.signal });
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
        registerCommand();
        ensureStatusline();
        observeConversationTimeline();
        apply();
    };
    const rerender = () => void renderStatusline();
    const invalidate = () => invalidatePromptTokens();

    bind('APP_READY', ready);
    for (const name of ['CHAT_CHANGED', 'MAIN_API_CHANGED', 'ONLINE_STATUS_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED', 'SETTINGS_UPDATED']) {
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
}

function init() {
    if (active) {
        renderDrawer();
        registerCommand();
        apply();
        return;
    }

    active = true;
    const { changed } = ensureSettings();
    if (changed) save();
    bindHostEvents();
    bindDomEvents();
    registerCommand();
    renderDrawer();
    ensureStatusline();
    apply();
}

function deactivate() {
    active = false;
    renderSequence += 1;
    tokenSequence += 1;
    unregisterCommand();
    unbindEvents();

    if (typeof document !== 'undefined') {
        document.getElementById(DRAWER_ID)?.remove();
        document.getElementById(STATUS_ID)?.remove();
        document.body?.classList.remove('sbterm', 'sbterm-minimal', 'sbterm-crt');
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
