import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

class FakeClassList {
    #values = new Set();

    set(value) {
        this.#values = new Set(String(value ?? '').split(/\s+/).filter(Boolean));
    }

    add(...values) {
        values.forEach(value => this.#values.add(value));
    }

    remove(...values) {
        values.forEach(value => this.#values.delete(value));
    }

    contains(value) {
        return this.#values.has(value);
    }

    toggle(value, force) {
        const enabled = force ?? !this.#values.has(value);
        enabled ? this.#values.add(value) : this.#values.delete(value);
        return enabled;
    }

    toString() {
        return [...this.#values].join(' ');
    }
}

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
        this.attributes = new Map();
        this.classList = new FakeClassList();
        this.textContent = '';
        this.value = '';
        this.checked = false;
        this.id = '';
        this.hidden = false;
        this.listeners = new Map();
        this.focused = false;
    }

    set className(value) {
        this.classList.set(value);
    }

    get className() {
        return this.classList.toString();
    }

    append(...nodes) {
        nodes.forEach(node => this.appendChild(node));
    }

    prepend(...nodes) {
        nodes.reverse().forEach(node => this.insertBefore(node, this.firstChild));
    }

    get firstChild() {
        return this.children[0] ?? null;
    }

    get parentElement() {
        return this.parentNode;
    }

    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.tagName === 'BODY';
    }

    get nextSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        return this.parentNode.children[index + 1] ?? null;
    }

    appendChild(node) {
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    insertBefore(node, refNode) {
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
        if (refNode && this.children.includes(refNode)) {
            this.children.splice(this.children.indexOf(refNode), 0, node);
        } else {
            this.children.push(node);
        }
        node.parentNode = this;
        return node;
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    addEventListener(type, handler, options = {}) {
        if (options.signal?.aborted) return;
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(handler);
        this.listeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => listeners.delete(handler), { once: true });
    }

    dispatchEvent(event) {
        if (!event.target) {
            try {
                Object.defineProperty(event, 'target', { configurable: true, value: this });
            } catch {
                // Native Event targets are optional for these focused fakes.
            }
        }
        for (const handler of [...(this.listeners.get(event.type) ?? [])]) {
            handler.call(this, event);
            if (event.immediatePropagationStopped) break;
        }
        return !event.defaultPrevented;
    }

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }

    focus() {
        this.focused = true;
    }

    contains(node) {
        return node === this || this.children.some(child => child.contains(node));
    }

    closest(selector) {
        let node = this;
        while (node) {
            if (selector.startsWith('#') && node.id === selector.slice(1)) return node;
            if (selector.startsWith('.') && node.classList.contains(selector.slice(1))) return node;
            node = node.parentElement;
        }
        return null;
    }

    querySelector() {
        return null;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.head = new FakeElement('head');
        this.listeners = new Map();
        this.pointElement = null;
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    getElementById(id) {
        const visit = node => {
            if (node.id === id) return node;
            for (const child of node.children) {
                const match = visit(child);
                if (match) return match;
            }
            return null;
        };
        return visit(this.body) ?? visit(this.head);
    }

    querySelector(selector) {
        if (selector === '#sb-topbar-inner > .sb-topbar-brand') {
            return this.getElementById('brand');
        }
        if (selector === '#sheld[data-sb-conversation-mode=on]') {
            const sheld = this.getElementById('sheld');
            return sheld?.dataset.sbConversationMode === 'on' ? sheld : null;
        }
        if (selector === '#sb_conversation_header [data-sb-conversation-name]') {
            return this.getElementById('sb-conversation-name');
        }
        if (selector.startsWith('#')) {
            return this.getElementById(selector.slice(1));
        }
        if (selector.startsWith('.')) {
            const className = selector.slice(1);
            const visit = node => {
                if (node.classList.contains(className)) return node;
                for (const child of node.children) {
                    const match = visit(child);
                    if (match) return match;
                }
                return null;
            };
            return visit(this.body);
        }
        return null;
    }

    addEventListener(type, handler, options = {}) {
        if (options.signal?.aborted) return;
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(handler);
        this.listeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => listeners.delete(handler), { once: true });
    }

    listenerCount(type) {
        return this.listeners.get(type)?.size ?? 0;
    }

    dispatch(type, event) {
        event.type = type;
        for (const handler of [...(this.listeners.get(type) ?? [])]) {
            handler(event);
            if (event.immediatePropagationStopped) break;
        }
    }

    elementFromPoint() {
        return this.pointElement;
    }
}

class FakeEventSource {
    listeners = new Map();

    on(event, handler) {
        const listeners = this.listeners.get(event) ?? new Set();
        listeners.add(handler);
        this.listeners.set(event, listeners);
    }

    removeListener(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }

    async emit(event, ...args) {
        for (const handler of this.listeners.get(event) ?? []) {
            await handler(...args);
        }
    }

    totalListeners() {
        return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0);
    }
}

test('lifecycle and /sbterm remain owned, reversible, and idempotent', async () => {
    const document = new FakeDocument();
    const settingsHost = new FakeElement('div');
    settingsHost.id = 'extensions_settings2';
    const topbar = new FakeElement('div');
    topbar.id = 'sb-topbar-inner';
    const brand = new FakeElement('div');
    brand.id = 'brand';
    brand.className = 'sb-topbar-brand';
    topbar.appendChild(brand);
    const sendInput = new FakeElement('textarea');
    sendInput.id = 'send_textarea';
    const conversationForm = new FakeElement('form');
    conversationForm.id = 'sb_conversation_form';
    const conversationInput = new FakeElement('textarea');
    conversationInput.id = 'sb_conversation_input';
    conversationForm.appendChild(conversationInput);
    const chat = new FakeElement('div');
    chat.id = 'chat';
    const welcome = new FakeElement('div');
    welcome.className = 'welcomePanel';
    const recentChats = new FakeElement('section');
    recentChats.className = 'welcomeRecentShell';
    let recentChatsScrolled = false;
    recentChats.scrollIntoView = () => recentChatsScrolled = true;
    const showMoreChats = new FakeElement('button');
    showMoreChats.className = 'showMoreChats';
    let recentChatsExpanded = false;
    showMoreChats.click = () => {
        recentChatsExpanded = true;
        showMoreChats.classList.add('rotated');
    };
    recentChats.appendChild(showMoreChats);
    welcome.appendChild(recentChats);
    chat.appendChild(welcome);
    const formSheld = new FakeElement('div');
    formSheld.id = 'form_sheld';
    const sendForm = new FakeElement('div');
    sendForm.id = 'send_form';
    const sendButton = new FakeElement('button');
    sendButton.id = 'send_but';
    const guidedGenerations = new FakeElement('div');
    guidedGenerations.id = 'gg-action-button-container';
    const simpleSendButton = new FakeElement('button');
    simpleSendButton.id = 'gg_simple_send_button';
    const quickReplies = new FakeElement('div');
    quickReplies.id = 'qr--bar';
    guidedGenerations.append(quickReplies, simpleSendButton);
    sendForm.append(sendInput, sendButton, guidedGenerations);
    formSheld.appendChild(sendForm);
    const bottomBar = new FakeElement('div');
    bottomBar.id = 'sb-bottom-chat-bar';
    bottomBar.classList.add('displayNone');
    const home = new FakeElement('button');
    home.id = 'sb-home-toggle';
    let homeClicks = 0;
    home.click = () => homeClicks += 1;
    const sheld = new FakeElement('main');
    sheld.id = 'sheld';
    const conversationHeader = new FakeElement('header');
    conversationHeader.id = 'sb_conversation_header';
    const conversationName = new FakeElement('span');
    conversationName.id = 'sb-conversation-name';
    conversationName.textContent = 'Conversation Friend';
    conversationHeader.appendChild(conversationName);
    sheld.append(chat, formSheld, conversationForm, conversationHeader);
    document.body.append(settingsHost, topbar, sheld, bottomBar, home);

    const moonlitEnabled = new FakeElement('style');
    moonlitEnabled.id = 'MoonlitEchosTheme-style';
    moonlitEnabled.disabled = false;
    const moonlitDisabled = new FakeElement('style');
    moonlitDisabled.id = 'MoonlitEchosTheme-extension';
    moonlitDisabled.disabled = true;
    document.head.append(moonlitEnabled, moonlitDisabled);

    const eventSource = new FakeEventSource();
    const eventTypes = Object.fromEntries([
        'APP_READY', 'CHAT_CHANGED', 'CHAT_RENAMED', 'CHARACTER_RENAMED', 'GROUP_UPDATED',
        'MAIN_API_CHANGED', 'ONLINE_STATUS_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED',
        'CHATCOMPLETION_MODEL_CHANGED', 'SETTINGS_UPDATED', 'GENERATION_AFTER_COMMANDS',
        'GENERATION_ENDED', 'GENERATION_STOPPED', 'GENERATE_AFTER_DATA',
    ].map(name => [name, name]));
    const parser = {
        commands: {
            api: { callback: async () => 'openrouter' },
            model: { callback: async () => 'test-model' },
        },
        addCommandObject(command) {
            this.commands[command.name] = command;
        },
    };
    class SlashCommandEnumValue {
        constructor(value, description) {
            this.value = value;
            this.description = description;
        }
    }

    let saves = 0;
    const executedCommands = [];
    const mainCommandOptions = [];
    let conversationAutocomplete = null;
    let conversationAutocompleteBindings = 0;
    const context = {
        extensionSettings: {
            // Seeded at the current version in terminal density so the rest of
            // this test exercises that mode; the shipped defaults (Full chrome,
            // both bars on) are asserted from source below.
            'SillyBunny-Terminal-UI': { version: 4, enabled: true, palette: 'nord', crt: false, minimal: true, topbarVisible: null, avatarVisible: true, avatarTint: false, chatTopbarVisible: null, bottomBarVisible: null },
        },
        saveSettingsDebounced: () => saves += 1,
        SlashCommandParser: parser,
        SlashCommand: { fromProps: props => props },
        SlashCommandArgument: { fromProps: props => props },
        SlashCommandEnumValue,
        ARGUMENT_TYPE: { STRING: 'string' },
        eventSource,
        eventTypes,
        onlineStatus: 'connected',
        mainApi: 'openai',
        characterId: 0,
        characters: [{ name: 'Test Character', avatar: 'test.png' }],
        groups: [],
        getCurrentChatId: () => 'Test Chat',
        getChatCompletionModel: () => 'test-model',
        substituteParams: () => '32768',
        getTokenCountAsync: async () => 11800,
        shouldSendOnEnter: () => true,
        executeSlashCommandsWithOptions: async value => executedCommands.push(value),
        executeSlashCommandsOnChatInput: async (value, options) => {
            executedCommands.push(value);
            mainCommandOptions.push(options);
            return { isError: false };
        },
        setSlashCommandAutoComplete: async input => {
            conversationAutocompleteBindings += 1;
            conversationAutocomplete = {
                input,
                isActive: false,
                checkIfActivate: () => input.value.startsWith('/'),
                hide() {
                    this.isActive = false;
                    this.hidden = true;
                },
                handleKeyDown(event) {
                    if (!this.isActive || event.key !== 'Enter') return;
                    event.preventDefault();
                    event.stopImmediatePropagation();
                },
            };
            return conversationAutocomplete;
        },
    };
    const shellCalls = [];

    globalThis.document = document;
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.SillyBunnyShell = { openTab: (...args) => shellCalls.push(args) };
    const globalListeners = new Map();
    globalThis.addEventListener = (type, handler, options = {}) => {
        if (options.signal?.aborted) return;
        const listeners = globalListeners.get(type) ?? new Set();
        listeners.add(handler);
        globalListeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => listeners.delete(handler), { once: true });
    };
    globalThis.removeEventListener = (type, handler) => globalListeners.get(type)?.delete(handler);
    globalThis.dispatchEvent = event => {
        if (event.type === 'sb:close-conversation-workspace') delete sheld.dataset.sbConversationMode;
        for (const handler of [...(globalListeners.get(event.type) ?? [])]) handler(event);
        return true;
    };
    const storage = new Map([['sb-bottom-chat-bar-visible', 'false']]);
    globalThis.localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
    };
    const mutationObservers = [];
    globalThis.MutationObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.observed = false;
            this.disconnected = false;
            mutationObservers.push(this);
        }
        observe(target) {
            this.target = target;
            this.observed = true;
        }
        disconnect() { this.disconnected = true; }
    };
    let toastInfo = 0;
    let toastError = 0;
    globalThis.toastr = { info() { toastInfo += 1; }, success() {}, warning() {}, error() { toastError += 1; } };

    let nativeAutocompleteActive = false;
    sendInput.addEventListener('keydown', event => {
        if (!nativeAutocompleteActive || event.key !== 'Enter') return;
        event.preventDefault();
        event.stopImmediatePropagation();
    });

    const extension = await import('../index.js');
    extension.activate();
    await Promise.resolve();

    const settings = context.extensionSettings['SillyBunny-Terminal-UI'];
    assert.equal(settings.version, 4);
    assert.equal(settings.minimal, true);
    assert.equal(settings.palette, 'nord');
    // null = follow the density default, so an explicit /hide-* or /show-* is
    // distinguishable from "never touched" and applies in Full chrome too.
    assert.equal(settings.topbarVisible, null);
    assert.equal(settings.avatarVisible, true);
    assert.equal(settings.chatTopbarVisible, null);
    assert.equal(settings.bottomBarVisible, null);
    assert(document.body.classList.contains('sbterm-topbar-hidden'), 'terminal density still hides the nav bar by default');
    assert(document.body.classList.contains('sbterm-bottom-bar-hidden'), 'terminal density still hides the bottom bar by default');
    assert.equal(saves, 0, 'settings already at the current version must not be rewritten on activate');
    assert(document.body.classList.contains('sbterm'));
    assert(document.body.classList.contains('sbterm-minimal'));
    assert.equal(document.listenerCount('submit'), 1);
    assert.equal(document.listenerCount('keydown'), 1);
    assert.equal(document.listenerCount('click'), 1);
    assert.equal(document.listenerCount('touchend'), 1, 'iOS sends from touchend and suppresses the click, so touchend must be intercepted too');
    assert.equal(sendInput.listeners.get('keydown')?.size, 2, 'main interception must bind after native autocomplete on the textarea');
    assert(bottomBar.classList.contains('displayNone'), 'chat bars stay hidden by default until the user opts in');
    assert.equal(moonlitEnabled.disabled, true);
    assert.equal(moonlitDisabled.disabled, true);
    const dynamicMoonlit = new FakeElement('style');
    dynamicMoonlit.id = 'moonlit-raw-css';
    dynamicMoonlit.disabled = false;
    document.head.appendChild(dynamicMoonlit);
    mutationObservers.find(observer => observer.target === document.head).callback([]);
    assert.equal(dynamicMoonlit.disabled, true, 'late Moonlit styles must also be suppressed');
    assert(document.getElementById('sbterm-settings-drawer'));
    assert(document.getElementById('sbterm-banner'));
    assert(document.getElementById('sbterm-statusline'));
    const mascotButton = document.querySelector('.sbterm-mascot-button');
    assert.equal(mascotButton?.tagName, 'BUTTON');
    assert.equal(mascotButton?.attributes.get('aria-label'), 'Open Agents Quick Access');

    const drawerToggle = document.querySelector('.inline-drawer-toggle');
    assert.equal(drawerToggle?.tagName, 'BUTTON', 'settings drawer trigger must be keyboard operable');
    assert.equal(drawerToggle?.attributes.get('aria-controls'), 'sbterm-settings-content');
    assert.equal(drawerToggle?.attributes.get('aria-expanded'), 'false');
    const drawerIcon = document.getElementById('sbterm-settings-icon');
    drawerIcon.classList.remove('down');
    drawerIcon.classList.add('up');
    drawerToggle.click();
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(drawerToggle.attributes.get('aria-expanded'), 'true');
    drawerIcon.classList.remove('up');
    drawerIcon.classList.add('down');
    document.dispatch('click', { target: { closest: () => null } });
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(drawerToggle.attributes.get('aria-expanded'), 'false', 'sibling auto-close must update disclosure state');
    const injectedTopbar = document.getElementById('sbterm-chat-topbar');
    assert(injectedTopbar);
    assert.equal(quickReplies.parentElement, injectedTopbar);
    assert.equal(guidedGenerations.parentElement, injectedTopbar);
    guidedGenerations.appendChild(quickReplies);
    mutationObservers.find(observer => observer.target === sendForm).callback([]);
    assert.equal(quickReplies.parentElement, injectedTopbar, 'host toolbar recapture must keep its latest restoration point');
    const glossary = document.querySelector('.sbterm-command-glossary');
    assert(glossary, 'terminal Home glossary must render');
    assert.equal(glossary.tagName, 'SECTION');
    assert.equal(glossary.tabIndex, 0, 'the scrolling command reference must be keyboard reachable');
    assert.equal(glossary.attributes.get('aria-labelledby'), 'sbterm-command-glossary-title');
    assert.equal(document.querySelector('.sbterm-command-glossary-title')?.tagName, 'H2');
    const glossaryList = document.querySelector('.sbterm-command-glossary-list');
    assert.equal(glossaryList?.tagName, 'UL');
    assert.equal(glossaryList?.children.length, 38, 'Home should expose the complete terminal command reference');
    assert(glossaryList.children.every(item => item.tagName === 'LI'));
    assert.equal(glossaryList.children[0].children[0].textContent, '/sbterm');
    assert.equal(glossaryList.children[1].children[0].textContent, '/home');
    const glossaryTexts = [];
    const collectText = node => {
        if (node.textContent) glossaryTexts.push(node.textContent);
        for (const child of node.children) collectText(child);
    };
    collectText(glossary);
    assert(glossaryTexts.includes('/open-api'));
    assert(glossaryTexts.includes('/open-homepage'));
    assert(glossaryTexts.includes('/open-conversation'));
    assert(glossaryTexts.includes('/open-roleplay'));
    assert(glossaryTexts.includes('/hide-bottom-bar'));
    assert(!glossaryTexts.some(text => text.includes('Open open')), 'glossary help must not double the open- prefix');

    // Flush the async statusline render before using its details control.
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    const status = document.getElementById('sbterm-statusline');
    const statusDetails = document.getElementById('sbterm-status-details');
    assert(status.textContent.startsWith('run:idle | chat:'), 'decisive run state must survive status truncation');
    assert.equal(statusDetails?.tagName, 'BUTTON');
    assert.equal(statusDetails?.dataset.action, 'status');
    document.dispatch('touchend', { target: statusDetails, changedTouches: [{ clientX: 1, clientY: 1 }] });
    document.dispatch('click', { target: statusDetails });
    assert.equal(toastInfo, 1, 'the details button must expose the full diagnostic as a toast');

    context.onlineStatus = 'no_connection';
    await eventSource.emit('ONLINE_STATUS_CHANGED');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert(status.textContent.startsWith('run:disconnected | chat:'));
    assert.equal(statusDetails.dataset.action, 'connect');
    document.dispatch('click', {
        target: { closest: selector => selector === '.sbterm-status-details' ? statusDetails : null },
    });
    assert.deepEqual(shellCalls.at(-1), ['left', 'api'], 'disconnected status must provide a direct recovery action');
    context.onlineStatus = 'connected';
    await eventSource.emit('ONLINE_STATUS_CHANGED');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));

    await eventSource.emit('GENERATE_AFTER_DATA', { prompt: 'assembled prompt' }, false);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.match(status.textContent, /prompt:11\.8k\/32\.8k$/, 'prompt diagnostics must retain one decimal');
    const promptStatus = status.textContent;
    await eventSource.emit('SETTINGS_UPDATED');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(status.textContent, promptStatus, 'unrelated settings saves must retain the last prompt count');
    await eventSource.emit('MAIN_API_CHANGED');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.match(status.textContent, /prompt:-\/32\.8k$/, 'connection changes must invalidate the old prompt count');

    document.dispatch('click', {
        target: { closest: selector => selector === '.sbterm-mascot-button' ? mascotButton : null },
    });
    assert.deepEqual(shellCalls.at(-1), ['left', 'agents']);

    const command = parser.commands.sbterm;
    const homeCommand = parser.commands.home;
    assert(command);
    assert(homeCommand);
    const completions = command.unnamedArgumentList[0].enumList;
    assert(completions.includes('ui full'));
    assert(completions.includes('palette phosphor-green'));
    assert(completions.includes('palette inherit'));
    assert(completions.includes('api'));
    assert(!completions.includes('open-api'));
    assert(!completions.includes('open-model'), 'duplicate aliases should stay out of /sbterm completion');

    const apiCommand = parser.commands.api;
    const modelCommand = parser.commands.model;
    for (const name of [
        'open-workspace', 'open-presets', 'open-api', 'open-model', 'open-sampling', 'open-formatting', 'open-agents',
        'open-customize', 'open-settings', 'open-extensions', 'open-background', 'open-server', 'open-logs', 'open-characters',
        'open-groups', 'open-editor', 'open-world-info', 'open-persona', 'open-import', 'search', 'chat-tools', 'open-chats', 'appearance',
        'open-homepage', 'open-conversation', 'open-roleplay', 'hide-top-navbar', 'show-top-navbar', 'hide-home', 'hide-avatar', 'show-avatar',
        'show-chat-topbar', 'hide-chat-topbar', 'show-bottom-bar', 'hide-bottom-bar',
    ]) {
        assert(parser.commands[name], `expected /${name} to be registered`);
    }
    assert.equal(parser.commands.api, apiCommand, 'native /api must be untouched');
    assert.equal(parser.commands.model, modelCommand, 'native /model must be untouched');

    assert.equal(await command.callback({}, 'ui full'), 'full');
    for (const className of ['sbterm-minimal', 'sbterm-topbar-hidden', 'sbterm-avatar-hidden', 'sbterm-chat-topbar-hidden', 'sbterm-bottom-bar-hidden']) {
        assert(!document.body.classList.contains(className), `Full Chrome must remove ${className}`);
    }
    assert(!bottomBar.classList.contains('displayNone'), 'Full Chrome must reveal the native bottom bar');
    assert(!document.getElementById('sbterm-chat-topbar'), 'Full Chrome must remove the replacement toolbar');
    assert.equal(quickReplies.parentElement, guidedGenerations);
    assert.equal(guidedGenerations.parentElement, sendForm);
    assert.equal(await command.callback({}, 'ui terminal'), 'terminal');
    assert(document.body.classList.contains('sbterm-minimal'));
    assert(document.body.classList.contains('sbterm-topbar-hidden'));
    assert(document.body.classList.contains('sbterm-chat-topbar-hidden'));
    assert(document.body.classList.contains('sbterm-bottom-bar-hidden'));
    assert(bottomBar.classList.contains('displayNone'));
    assert.equal(quickReplies.parentElement, document.getElementById('sbterm-chat-topbar'));
    assert.equal(guidedGenerations.parentElement, document.getElementById('sbterm-chat-topbar'));

    const enterEvent = overrides => ({
        type: 'keydown',
        target: sendInput,
        key: 'Enter',
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.immediatePropagationStopped = true; },
        ...overrides,
    });
    nativeAutocompleteActive = true;
    sendInput.value = '/sbterm p';
    const autocompleteEnter = enterEvent();
    sendInput.dispatchEvent(autocompleteEnter);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(autocompleteEnter.defaultPrevented, true);
    assert.equal(sendInput.value, '/sbterm p', 'native autocomplete must consume Enter before command execution');
    assert.deepEqual(executedCommands, []);

    nativeAutocompleteActive = false;
    sendInput.value = '/open-api';
    const commandEnter = enterEvent();
    sendInput.dispatchEvent(commandEnter);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(commandEnter.defaultPrevented, true);
    assert.deepEqual(executedCommands, ['/open-api']);
    assert.deepEqual(mainCommandOptions.at(-1), { clearChatInput: false, source: 'SillyBunny-Terminal-UI' });

    const characterBeforeCtrlEnter = context.characterId;
    context.characterId = undefined;
    sendInput.value = '/api';
    const ctrlEnter = enterEvent({ ctrlKey: true });
    sendInput.dispatchEvent(ctrlEnter);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(ctrlEnter.defaultPrevented, true, 'Ctrl+Enter must not bypass the Assistant-chat trap');
    assert.equal(executedCommands.at(-1), '/api');
    context.characterId = characterBeforeCtrlEnter;
    sendInput.value = '';
    executedCommands.length = 0;
    mainCommandOptions.length = 0;

    sendInput.value = '/sbterm ui full';
    let prevented = false;
    let stopped = false;
    document.dispatch('click', {
        target: simpleSendButton,
        preventDefault: () => prevented = true,
        stopImmediatePropagation: () => stopped = true,
    });
    await Promise.resolve();
    assert.deepEqual(executedCommands, ['/sbterm ui full']);
    assert.equal(sendInput.value, '');
    assert(prevented);
    assert(stopped);

    sendInput.value = '/home';
    document.dispatch('click', {
        target: sendButton,
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.deepEqual(executedCommands, ['/sbterm ui full', '/home']);

    sendInput.value = '/api';
    let nativeApiPrevented = false;
    document.dispatch('click', {
        target: sendButton,
        preventDefault: () => nativeApiPrevented = true,
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.equal(nativeApiPrevented, false, 'native /api must remain on the host event path');
    assert.equal(sendInput.value, '/api');
    assert.deepEqual(executedCommands, ['/sbterm ui full', '/home']);
    sendInput.value = '';

    // A tap on iOS arrives as touchend; the host sends from there and eats the
    // click, so an owned command must be intercepted on touchend as well.
    sendInput.value = '/open-chats';
    document.pointElement = home;
    let canceledTouchPrevented = false;
    document.dispatch('touchend', {
        target: sendButton,
        changedTouches: [{ clientX: 1, clientY: 1 }],
        preventDefault: () => canceledTouchPrevented = true,
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.equal(canceledTouchPrevented, false, 'sliding off the send button must cancel the tap');
    assert.equal(sendInput.value, '/open-chats');

    document.pointElement = sendButton;
    let touchPrevented = false;
    document.dispatch('touchend', {
        target: sendButton,
        changedTouches: [{ clientX: 1, clientY: 1 }],
        preventDefault: () => touchPrevented = true,
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.equal(touchPrevented, true, 'tapping send on iOS must not reach the host send handler');
    assert.equal(sendInput.value, '');
    assert.deepEqual(executedCommands.at(-1), '/open-chats');

    // With no character selected the host would spawn a permanent Assistant
    // chat before running ANY command, so registered host commands are run
    // directly while Terminal Home is on screen.
    const chidBeforeTrap = context.characterId;
    context.characterId = undefined;
    sendInput.value = '/api';
    let trapPrevented = false;
    document.dispatch('touchend', {
        target: sendButton,
        changedTouches: [{ clientX: 1, clientY: 1 }],
        preventDefault: () => trapPrevented = true,
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.equal(trapPrevented, true, 'commands sent with no character selected must bypass the host Assistant trap');
    assert.deepEqual(executedCommands.at(-1), '/api');
    context.characterId = chidBeforeTrap;
    sendInput.value = '';

    assert.equal(await homeCommand.callback(), 'home');
    assert(!document.body.classList.contains('sbterm-home-visible'), '/home must show the terminal Home, not the host homepage');
    assert.equal(homeClicks, 0);
    await parser.commands['open-homepage'].callback();
    assert(document.body.classList.contains('sbterm-home-visible'));
    assert.equal(homeClicks, 1);
    await eventSource.emit('CHAT_CHANGED');
    assert(!document.body.classList.contains('sbterm-home-visible'));

    document.dispatch('click', {
        target: home,
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert(document.body.classList.contains('sbterm-home-visible'));
    assert.equal(homeClicks, 2);

    await parser.commands['hide-top-navbar'].callback();
    assert.equal(settings.topbarVisible, false);
    assert(document.body.classList.contains('sbterm-topbar-hidden'));
    await parser.commands['show-top-navbar'].callback();
    assert.equal(settings.topbarVisible, true);
    assert(!document.body.classList.contains('sbterm-topbar-hidden'));

    await parser.commands['hide-avatar'].callback();
    assert.equal(settings.avatarVisible, false);
    assert(document.body.classList.contains('sbterm-avatar-hidden'));
    await parser.commands['show-avatar'].callback();
    assert.equal(settings.avatarVisible, true);
    assert(!document.body.classList.contains('sbterm-avatar-hidden'));

    // The tint is styling, not visibility, so it rides /sbterm like crt does.
    assert.equal(await command.callback({}, 'avatar-tint on'), 'true');
    assert.equal(settings.avatarTint, true);
    assert(document.body.classList.contains('sbterm-avatar-tinted'));
    assert.equal(document.getElementById('sbterm-avatar-tint').checked, true, 'the drawer checkbox must follow /sbterm avatar-tint');
    assert.equal(await command.callback({}, 'avatar-tint off'), 'false');
    assert.equal(settings.avatarTint, false);
    assert(!document.body.classList.contains('sbterm-avatar-tinted'));
    assert.equal(document.getElementById('sbterm-avatar-tint').checked, false);

    await parser.commands['hide-chat-topbar'].callback();
    assert.equal(settings.chatTopbarVisible, false);
    assert(document.body.classList.contains('sbterm-chat-topbar-hidden'));
    await parser.commands['show-chat-topbar'].callback();
    assert.equal(settings.chatTopbarVisible, true);
    assert(!document.body.classList.contains('sbterm-chat-topbar-hidden'));

    await parser.commands['hide-bottom-bar'].callback();
    assert.equal(settings.bottomBarVisible, false);
    assert(document.body.classList.contains('sbterm-bottom-bar-hidden'));
    await parser.commands['show-bottom-bar'].callback();
    assert.equal(settings.bottomBarVisible, true);
    assert(!document.body.classList.contains('sbterm-bottom-bar-hidden'));

    await parser.commands['hide-home'].callback();
    assert(!document.body.classList.contains('sbterm-home-visible'));

    await parser.commands['open-api'].callback();
    assert.deepEqual(shellCalls.at(-1), ['left', 'api']);
    await parser.commands['open-model'].callback();
    assert.deepEqual(shellCalls.at(-1), ['left', 'api']);
    assert.equal(await parser.commands['open-chats'].callback(), 'open-chats');
    assert(recentChatsExpanded);
    assert(recentChatsScrolled);

    sendInput.value = '/open-extensions';
    document.dispatch('click', {
        target: sendButton,
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.deepEqual(executedCommands.at(-1), '/open-extensions');

    const executeMainCommands = context.executeSlashCommandsOnChatInput;
    context.executeSlashCommandsOnChatInput = async () => { throw new Error('test rejection'); };
    sendInput.value = '/open-api';
    sendInput.focused = false;
    const consoleError = console.error;
    console.error = () => {};
    try {
        document.dispatch('click', {
            target: sendButton,
            preventDefault() {},
            stopImmediatePropagation() {},
        });
        await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    } finally {
        console.error = consoleError;
        context.executeSlashCommandsOnChatInput = executeMainCommands;
    }
    assert.equal(sendInput.value, '/open-api', 'a rejected command must be restored');
    assert.equal(sendInput.focused, true);
    assert.equal(toastError, 1);
    sendInput.value = '';

    context.executeSlashCommandsOnChatInput = async () => ({ isError: true });
    sendInput.value = '/open-api';
    sendInput.focused = false;
    document.dispatch('click', {
        target: sendButton,
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    context.executeSlashCommandsOnChatInput = executeMainCommands;
    assert.equal(sendInput.value, '/open-api', 'a resolved command error must be restored');
    assert.equal(sendInput.focused, true);
    assert.equal(toastError, 2);
    sendInput.value = '';

    context.onlineStatus = 'no_connection';
    context.extensionSettings.sillybunny_conversation = { settings: { connection_profile: 'Scoped' } };
    context.extensionSettings.connectionManager = { profiles: [{ id: 'scoped', name: 'Scoped' }] };
    context.ConnectionManagerRequestService = { sendRequest() {} };
    sheld.dataset.sbConversationMode = 'on';
    globalThis.dispatchEvent(new Event('sb:conversation-workspace-state-changed'));
    const bodyObserver = mutationObservers.find(observer => observer.target === document.body);
    bodyObserver.callback([]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(status.textContent, 'run:idle | dm:Conversation Friend | api:profile:Scoped | prompt:n/a');
    context.extensionSettings.sillybunny_conversation.settings.connection_profile = 'Missing';
    await eventSource.emit('SETTINGS_UPDATED');
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.match(status.textContent, /^run:disconnected \| dm:Conversation Friend \| api:/);
    assert.match(status.textContent, /prompt:n\/a$/);
    assert.equal(conversationAutocompleteBindings, 1, 'Conversation Mode must receive native slash previews');
    assert.equal(conversationAutocomplete.input, conversationInput);
    bodyObserver.callback([]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(conversationAutocompleteBindings, 1, 'the same Conversation input must bind only once');

    conversationAutocomplete.isActive = true;
    const previewEnter = {
        target: conversationInput,
        key: 'Enter',
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
    };
    document.dispatch('keydown', previewEnter);
    assert.equal(previewEnter.defaultPrevented, true, 'autocomplete must select before Conversation submit handles Enter');
    assert.equal(previewEnter.stopped, true);

    for (const [value, intercepted] of [['/api', true], ['/selfie', false], ['/not-a-command', false]]) {
        conversationInput.value = value;
        let conversationPrevented = false;
        document.dispatch('submit', {
            target: conversationForm,
            preventDefault: () => conversationPrevented = true,
            stopImmediatePropagation() {},
        });
        await Promise.resolve();
        assert.equal(conversationPrevented, intercepted, `${value} interception mismatch`);
    }
    assert.deepEqual(executedCommands.at(-1), '/api');

    sendInput.focused = false;
    assert.equal(await parser.commands['open-roleplay'].callback(), 'roleplay');
    assert(!sheld.dataset.sbConversationMode, 'roleplay must close the Conversation workspace');
    assert.equal(sendInput.focused, true);

    sheld.dataset.sbConversationMode = 'on';
    assert.equal(await homeCommand.callback(), 'home');
    assert(!sheld.dataset.sbConversationMode, '/home must close the Conversation workspace');

    await parser.commands['open-homepage'].callback();
    assert(document.body.classList.contains('sbterm-home-visible'));
    sheld.dataset.sbConversationMode = 'on';
    assert.equal(await parser.commands['hide-home'].callback(), 'home');
    assert(!sheld.dataset.sbConversationMode, '/hide-home must close the Conversation workspace');
    assert(!document.body.classList.contains('sbterm-home-visible'));

    bodyObserver.callback([]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(conversationAutocomplete.hidden, true, 'closing Conversation Mode must hide its slash preview');
    context.onlineStatus = 'connected';

    const listenerCount = eventSource.totalListeners();
    extension.activate();
    await eventSource.emit('APP_READY');
    await eventSource.emit('APP_READY');
    assert.equal(parser.commands.sbterm, command);
    assert.equal(eventSource.totalListeners(), listenerCount);
    assert.equal(document.listenerCount('submit'), 1);

    await command.callback({}, 'ui full');
    assert.equal(settings.minimal, false);
    assert(!document.body.classList.contains('sbterm-minimal'));
    assert(!document.body.classList.contains('sbterm-home-visible'));
    await parser.commands['open-homepage'].callback();
    assert(document.body.classList.contains('sbterm-home-visible'));
    await parser.commands['hide-home'].callback();
    assert(!document.body.classList.contains('sbterm-home-visible'), '/hide-home must restore Terminal Home in full chrome');
    await command.callback({}, 'palette terminal-amber');
    assert.equal(settings.palette, 'terminal-amber');
    const savesBeforeInvalid = saves;
    await command.callback({}, 'palette not-a-palette');
    assert.equal(settings.palette, 'terminal-amber');
    assert.equal(saves, savesBeforeInvalid);

    await command.callback({}, 'settings');
    assert.deepEqual(shellCalls.at(-1), ['right', 'settings']);
    await command.callback({}, 'off');
    assert(!document.body.classList.contains('sbterm'));
    assert(!document.getElementById('sbterm-banner'));
    assert(!document.querySelector('.sbterm-command-glossary'), '/sbterm off must remove the injected Home UI');
    assert(!document.getElementById('sbterm-chat-topbar'));
    assert(bottomBar.classList.contains('displayNone'), '/sbterm off must restore the host bottom-bar state');
    assert.equal(moonlitEnabled.disabled, false);
    assert.equal(moonlitDisabled.disabled, true, 'pre-disabled Moonlit styles must stay disabled after restoration');
    assert.equal(dynamicMoonlit.disabled, false);
    assert.equal(quickReplies.parentElement, guidedGenerations, 'Quick Replies must return to its latest host parent');
    assert.equal(guidedGenerations.parentElement, sendForm, 'Guided Generations must return to the composer');
    assert(mutationObservers.filter(observer => observer.observed).every(observer => observer.disconnected), '/sbterm off must disconnect UI observers');
    assert.equal(parser.commands.sbterm, command);
    assert(document.getElementById('sbterm-settings-drawer'));
    await eventSource.emit('APP_READY');
    assert(!document.getElementById('sbterm-banner'), 'APP_READY must not inject UI while persisted off');
    assert(!document.querySelector('.sbterm-command-glossary'));
    assert(!document.getElementById('sbterm-chat-topbar'));
    await command.callback({}, 'on');
    assert(document.body.classList.contains('sbterm'));
    assert.equal(document.getElementById('sbterm-banner').hidden, false);
    assert(document.querySelector('.sbterm-command-glossary'), '/sbterm on must rebuild the injected Home UI');
    assert(!document.getElementById('sbterm-chat-topbar'), 'Full Chrome must keep native toolbar placement after re-enable');
    assert(!bottomBar.classList.contains('displayNone'));
    assert.equal(moonlitEnabled.disabled, true);
    assert.equal(moonlitDisabled.disabled, true);
    assert.equal(dynamicMoonlit.disabled, true);

    const foreignCommand = { name: 'sbterm' };
    const foreignHomeCommand = { name: 'home' };
    parser.commands.sbterm = foreignCommand;
    parser.commands.home = foreignHomeCommand;
    storage.set('sb-bottom-chat-bar-visible', 'true');
    const enabledBeforeDisable = settings.enabled;
    extension.disable();
    assert.equal(parser.commands.sbterm, foreignCommand);
    assert.equal(parser.commands.home, foreignHomeCommand);
    assert.equal(parser.commands.api, apiCommand);
    assert.equal(parser.commands.model, modelCommand);
    assert(!parser.commands['open-extensions'], 'top-level /open-extensions must be removed on disable');
    assert(!parser.commands['open-api']);
    assert(!parser.commands['hide-top-navbar']);
    assert.equal(await command.callback({}, 'off'), 'Terminal UI is disabled.');
    assert.equal(await homeCommand.callback(), 'Terminal UI is disabled.');
    assert.equal(await parser.commands['open-extensions']?.callback?.() ?? undefined, undefined);
    assert.equal(settings.enabled, enabledBeforeDisable);
    assert(!document.body.classList.contains('sbterm'));
    assert(!document.body.dataset.sbtermPalette);
    assert(!document.getElementById('sbterm-settings-drawer'));
    assert(!document.getElementById('sbterm-banner'));
    assert(!document.getElementById('sbterm-statusline'));
    assert(!document.getElementById('sbterm-chat-topbar'));
    assert(!document.querySelector('.sbterm-command-glossary'));
    assert(!bottomBar.classList.contains('displayNone'), 'extension disable must honor newer host bottom-bar state');
    assert.equal(moonlitEnabled.disabled, false);
    assert.equal(moonlitDisabled.disabled, true);
    assert.equal(dynamicMoonlit.disabled, false);
    assert.equal(document.listenerCount('submit'), 0);
    assert.equal(document.listenerCount('keydown'), 0);
    assert.equal(document.listenerCount('click'), 0);
    assert.equal(document.listenerCount('touchend'), 0);
    assert.equal(sendInput.listeners.get('keydown')?.size, 1, 'disable must remove only the extension textarea listener');
    assert.equal(eventSource.totalListeners(), 0);

    delete parser.commands.sbterm;
    delete parser.commands.home;
    extension.enable();
    assert(parser.commands.sbterm);
    assert(parser.commands.home);
    assert(parser.commands['open-extensions']);
    assert(parser.commands['open-api']);
    assert(parser.commands['hide-top-navbar']);
    assert.notEqual(parser.commands.sbterm, command);
    assert.equal(settings.topbarVisible, true, 'user toggle must persist across re-activation');
    extension.disable();
    assert(!parser.commands.sbterm);
    assert(!parser.commands.home);
    assert(!parser.commands['open-extensions']);
    assert(!parser.commands['hide-top-navbar']);
    assert(!bottomBar.classList.contains('displayNone'));

    settings.enabled = false;
    extension.enable();
    assert(!document.body.classList.contains('sbterm'));
    assert(!document.getElementById('sbterm-banner'), 'persisted disabled activation must not inject UI');
    assert(!document.querySelector('.sbterm-command-glossary'));
    assert(!document.getElementById('sbterm-chat-topbar'));
    await eventSource.emit('APP_READY');
    assert(!document.getElementById('sbterm-banner'));
    assert(!document.querySelector('.sbterm-command-glossary'));
    extension.disable();
});

test('shipped defaults are Full chrome with both chat bars on', async () => {
    const source = await readFile(new URL('../index.js', import.meta.url), 'utf8');
    const defaults = source.match(/const DEFAULTS = \{([^}]+)\}/)[1];
    assert.match(defaults, /minimal: false/, 'Full chrome is the default interface');
    assert.match(defaults, /avatarTint: false/, 'avatar tinting is opt-in, like the CRT overlay');
    // null, not true: Full chrome shows both bars anyway, and forcing them on
    // left Terminal density with almost nothing to strip.
    assert.match(defaults, /chatTopbarVisible: null/, 'the chat tool bar follows the density until set');
    assert.match(defaults, /bottomBarVisible: null/, 'the chat bottom bar follows the density until set');

    // Every visibility setting needs a checkbox and a matching sync entry, or
    // the drawer silently drifts from what the slash commands did.
    for (const id of ['sbterm-show-topbar', 'sbterm-show-chat-topbar', 'sbterm-show-bottom-bar', 'sbterm-show-avatar', 'sbterm-avatar-tint']) {
        assert.equal(source.split(`'${id}'`).length - 1, 2, `${id} needs both a checkbox row and a syncDrawer entry`);
    }
});

test('static UI rules preserve contrast and density boundaries', async () => {
    const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\) #chat \.welcomePanel\s*\{\s*display:\s*none !important;/, 'Terminal Home must replace native Home in every density');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\)[^{]+\.sbterm-command-glossary\s*\{\s*display:\s*block;/, 'Terminal Home must remain visible in full chrome');
    assert(!css.includes('sbterm-minimal:not(.sbterm-home-visible)'), 'Home replacement must not depend on terminal density');
    assert.match(css, /\.sbterm-command-glossary[^}]+max-block-size:\s*min\(50dvh, 28rem\)[^}]+overflow-y:\s*auto;/s, 'the complete Home reference must scroll independently');
    assert.match(css, /\.sbterm-command-glossary-list[^}]+grid-template-columns:\s*minmax\(0, 1fr\)/s, 'Home commands must remain one column so descriptions cannot overlap');
    // #sheld::before fills the shell at z-index -1, above its background and
    // below the messages this sheet makes transparent. Killing only
    // background-image left --sheldBackgroundColor painting straight over the
    // terminal surface — measured rgba(45,45,45,0.95) on a silver palette.
    assert.match(css, /#sheld::before,[^{]+\{[^}]*background:\s*transparent !important;[^}]*backdrop-filter:\s*none !important;/s, 'decorative shell overlays must not paint over the terminal surface');
    assert.doesNotMatch(css, /:has\(#chat \.welcomePanel\) #bg1\b/, 'Terminal Home must sit on the flat terminal surface, not reveal the host wallpaper');
    assert.doesNotMatch(css, /:has\(#chat \.welcomePanel\) #sheld\s*\{[^}]*backdrop-filter/s, 'Terminal Home must not float a translucent blurred panel over the page');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\):has\(#chat \.welcomePanel\) #top-bar\s*\{[^}]+background-color:\s*var\(--sbterm-bg\) !important;/s, 'Home text chrome needs an opaque contrast backing');
    assert.match(css, /body\.sbterm\.sbterm-minimal #chat \.mes\[is_user='true'\] \.mes_block:not\(:has\(\.edit_textarea, \.reasoning_edit_textarea\)\)\s*\{[^}]+display:\s*grid !important;/s, 'message editors must opt out of the inline user-message grid');
    assert.match(css, /--ac-style-color-selectedText:\s*var\(--sbterm-selected-fg\);/, 'selected autocomplete text must use the on-accent token');
    assert.match(css, /body\.sbterm ::selection\s*\{\s*background-color:\s*var\(--sbterm-accent\) !important;\s*color:\s*var\(--sbterm-selected-fg\) !important;/s, 'host themes keep their own ::selection, so the palette must claim it outright');
    assert.doesNotMatch(css, /#gg_simple_send_button/, 'Simple Send is a distinct Guided Generations action and must stay visible');
    assert.match(css, /#sb_conversation_pals_rail\s*\{[^}]+visibility:\s*hidden;[^}]+pointer-events:\s*none;/s, 'closed off-screen rails must leave keyboard navigation');
    // The .mes_block ancestor and the :not(:has()) below are load-bearing: without
    // them these lose the specificity tie with the §11 grid rules they undo.
    assert.match(css, /body\.sbterm\.sbterm-minimal #chat \.mes\[is_user='true'\] \.mes_block \.mes_buttons\s*\{[^}]+position:\s*static;[^}]+flex-wrap:\s*wrap;/s, 'touch message actions must not overlay message text');
    assert.match(css, /body\.sbterm\.sbterm-minimal #chat \.mes\[is_user='true'\] \.mes_block:not\(:has\(\.edit_textarea, \.reasoning_edit_textarea\)\)\s*\{\s*display:\s*block !important;/s, 'touch must unstack the inline user-message grid');
    assert.match(css, /\.sb-shell-tab:is\(:hover, :focus-visible, \[aria-selected='true'\]\) :is\(i, svg\)[^{]*\{[^}]+color:\s*var\(--sbterm-selected-fg\) !important;/s, 'accent-filled tabs must not keep the host accent-tinted icon');

    // The terminal look is applied once to everything, not element by element.
    // Re-enumerating is what lets host chrome leak back in, so the counts below
    // are the guard: each of these belongs to the §3 reset and nowhere else.
    assert.match(css, /body\.sbterm \*:not\(\[class\*='avatar' i\], \[id\*='avatar' i\]\)[^{]*\{[^}]*border-radius:\s*0 !important;[^}]*box-shadow:\s*none !important;/s, 'the flat terminal surface must be the global default');
    // Two: the global reset, plus the composer override that outranks the 10px
    // radius the host keeps on #send_textarea/#options_button. Anything beyond
    // that is per-element enumeration creeping back.
    assert.equal(css.match(/border-radius:\s*0/g).length, 2, 'flat corners belong to the global reset, not to per-element rules');
    assert.equal(css.match(/box-shadow:\s*none/g).length, 1, 'flat surfaces belong to the global reset, not to per-element rules');
    assert.match(css, /text-shadow:\s*0 0 2px var\(--sbterm-glow\) !important;/, 'the CRT glow must outrank the global text-shadow reset');
    // One duotone for all 13 palettes, driven by two tokens rather than a filter
    // chain per palette. `multiply` is load-bearing: a hue-only blend left every
    // picture at its own absolute brightness, so light palettes got dark slabs.
    assert.match(css, /body\.sbterm\.sbterm-avatar-tinted :is\(\[class\*='avatar' i\], \[id\*='avatar' i\]\):has\(> img\)\s*\{[^}]*background-color:\s*var\(--sbterm-avatar-tone\);[^}]*isolation:\s*isolate;/s, 'the tint must fill the avatar frame with the palette tone and contain the blend');
    assert.match(css, /body\.sbterm\.sbterm-avatar-tinted :is\(\[class\*='avatar' i\], \[id\*='avatar' i\]\) > img\s*\{[^}]*filter:\s*var\(--sbterm-avatar-filter\);[^}]*mix-blend-mode:\s*multiply;/s, 'the picture must be remapped into the palette range, not just recoloured');
    assert.match(css, /@media \(forced-colors: active\)\s*\{[^]*?\.sbterm-avatar-tinted[^{]+\{[^}]*filter:\s*none;[^}]*mix-blend-mode:\s*normal;/s, 'forced colors must hand the pictures back untinted');
    assert.equal(css.match(/mix-blend-mode:\s*multiply/g).length, 1, 'the duotone belongs to one rule, not to per-surface enumeration');
    // The three light palettes print the picture as ink on the page instead of
    // lighting it up on a black one, so the tone has to invert with them. Same
    // trio as the §1 color-scheme split — if that list grows, this one must too.
    const lightPalettes = css.match(/color-scheme:\s*light/)
        ? css.match(/body\.sbterm:is\(([^)]*(?:\)[^)]*)*)\)\s*\{\s*color-scheme:\s*light;/)[1]
        : '';
    const tonePalettes = css.match(/body\.sbterm\.sbterm-avatar-tinted:is\(([^)]*(?:\)[^)]*)*)\)\s*\{[^}]*--sbterm-avatar-tone:\s*var\(--sbterm-bg\);/s)[1];
    assert.equal(tonePalettes.replace(/\s+/g, ' '), lightPalettes.replace(/\s+/g, ' '), 'the inverted avatar tone must cover exactly the light palettes');
    for (const rule of css.match(/^body[^{]*sbterm-avatar-tinted[^{]*\{/gm) ?? []) {
        assert.match(rule, /body\.sbterm\b/, `${rule.trim()} must stay gated behind body.sbterm`);
    }
    // A mask, not an <img>: the bunny takes the palette accent instead of a
    // baked-in colour, so the splash matches whichever palette is active.
    assert.match(css, /\.splash-logo\s*\{\s*display:\s*none !important;/, 'the raster SillyBunny badge must not show on the terminal splash');
    assert.match(css, /#loader\.splash-screen::before\s*\{[^}]*background-color:\s*var\(--sbterm-accent2\);[^}]*mask-image:\s*url\("data:image\/svg\+xml;base64,/s, 'the splash bunny must be a palette-tinted mask');
    assert.doesNotMatch(css, /#sbterm-settings-drawer > \.inline-drawer-toggle\s*\{[^}]*\b(border|padding|background):/s, "the extension's own drawer must inherit the host header chrome its siblings get");
    // A <button> shrink-wraps where the siblings' <div> headers fill the row
    // (measured: 163px against 780px), so this normalisation cannot be scoped
    // to body.sbterm or the drawer goes narrow whenever the interface is off.
    assert.match(css, /(?<!body\.sbterm )#sbterm-settings-drawer > \.inline-drawer-toggle\s*\{[^}]*width:\s*100%;/s, 'the drawer trigger must fill its row whether or not the interface is on');
    assert.match(css, /--sb-bottom-chat-mobile-button-size:\s*var\(--sb-mobile-touch-target, 44px\);/, 'bottom-bar controls must inherit the 44px touch target');
    // Measured: a 44px min-height here made the status row 44px and the banner
    // 63px inside a 54px fixed top bar, clipping the title. The overlay keeps
    // the target without the height.
    assert.doesNotMatch(css, /\.sbterm-status-details,/, 'the status button must stay out of the blanket min-size touch-target list');
    assert.match(css, /\.sbterm-status-details::after\s*\{[^}]*block-size:\s*var\(--sb-mobile-touch-target, 44px\);/s, 'the status button keeps a 44px tappable overlay');
    assert.match(css, /\.sb-topbar-brand\s*\{[^}]*overflow:\s*visible;/s, 'the brand must not clip the status button overlay');
    assert.match(css, /@media \(forced-colors: active\)\s*\{[^}]+outline:\s*2px solid CanvasText !important;/s, 'system focus colors belong only to forced-colors mode');
    assert.doesNotMatch(css, /@media \(forced-colors: active\), \(prefers-contrast: more\)\s*\{[^}]+CanvasText/s, 'ordinary increased contrast must keep palette-aware focus rings');
    const palettes = ['phosphor-green', 'terminal-amber', 'gameboy-dmg', 'teletext', 'chrome-98', 'dos-cobalt', 'paper-tape', 'vfd-cyan', 'dracula', 'gruvbox', 'solarized-dark', 'nord'];
    const luminance = hex => {
        const channels = hex.match(/[0-9a-f]{2}/gi).map(value => {
            const channel = Number.parseInt(value, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (a, b) => {
        const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (lighter + 0.05) / (darker + 0.05);
    };

    for (const palette of palettes) {
        const pattern = palette === 'phosphor-green'
            ? /body\.sbterm \{([\s\S]*?)\n\}/
            : new RegExp(`body\\.sbterm\\[data-sbterm-palette='${palette}'\\] \\{([\\s\\S]*?)\\n\\}`);
        const block = css.match(pattern)?.[1];
        assert(block, `missing ${palette} palette`);
        const token = name => block.match(new RegExp(`--sbterm-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
        const border = token('border');
        for (const background of [token('bg'), token('bg-alt')]) {
            assert(contrast(border, background) >= 3, `${palette} border must reach 3:1 against ${background}`);
        }
    }
});
