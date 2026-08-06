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

    addEventListener(type, handler) {
        const listeners = this.listeners.get(type) ?? new Set();
        listeners.add(handler);
        this.listeners.set(type, listeners);
    }

    dispatchEvent(event) {
        for (const handler of this.listeners.get(event.type) ?? []) handler.call(this, event);
        return true;
    }

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }

    focus() {
        this.focused = true;
    }

    querySelector() {
        return null;
    }
}

class FakeDocument {
    constructor() {
        this.body = new FakeElement('body');
        this.listeners = new Map();
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
        return visit(this.body);
    }

    querySelector(selector) {
        if (selector === '#sb-topbar-inner > .sb-topbar-brand') {
            return this.getElementById('brand');
        }
        if (selector === '#sheld[data-sb-conversation-mode=on]') {
            const sheld = this.getElementById('sheld');
            return sheld?.dataset.sbConversationMode === 'on' ? sheld : null;
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
        for (const handler of this.listeners.get(type) ?? []) handler(event);
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
    const guidedGenerations = new FakeElement('div');
    guidedGenerations.id = 'gg-action-button-container';
    const quickReplies = new FakeElement('div');
    quickReplies.id = 'qr--bar';
    guidedGenerations.appendChild(quickReplies);
    sendForm.append(sendInput, guidedGenerations);
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
    sheld.append(chat, formSheld, conversationForm);
    document.body.append(settingsHost, topbar, sheld, bottomBar, home);

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
    let conversationAutocomplete = null;
    let conversationAutocompleteBindings = 0;
    const context = {
        extensionSettings: {
            'SillyBunny-Terminal-UI': { version: 1, enabled: true, palette: 'nord', crt: false },
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
        shouldSendOnEnter: () => true,
        executeSlashCommandsWithOptions: async value => executedCommands.push(value),
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

    const extension = await import('../index.js');
    extension.activate();
    await Promise.resolve();

    const settings = context.extensionSettings['SillyBunny-Terminal-UI'];
    assert.equal(settings.version, 2);
    assert.equal(settings.minimal, true);
    assert.equal(settings.palette, 'nord');
    assert.equal(settings.topbarVisible, false);
    assert.equal(settings.avatarVisible, true);
    assert.equal(settings.chatTopbarVisible, false);
    assert.equal(settings.bottomBarVisible, false);
    assert.equal(saves, 1);
    assert(document.body.classList.contains('sbterm'));
    assert(document.body.classList.contains('sbterm-minimal'));
    assert.equal(document.listenerCount('submit'), 1);
    assert.equal(document.listenerCount('keydown'), 1);
    assert.equal(document.listenerCount('click'), 1);
    assert.equal(document.listenerCount('touchend'), 1, 'iOS sends from touchend and suppresses the click, so touchend must be intercepted too');
    assert(bottomBar.classList.contains('displayNone'), 'chat bars stay hidden by default until the user opts in');
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
    assert.equal(glossary.attributes.get('aria-labelledby'), 'sbterm-command-glossary-title');
    assert.equal(document.querySelector('.sbterm-command-glossary-title')?.tagName, 'H2');
    const glossaryList = document.querySelector('.sbterm-command-glossary-list');
    assert.equal(glossaryList?.tagName, 'UL');
    assert.equal(glossaryList?.children.length, 35, 'Home should expose the complete terminal command reference');
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
    assert(glossaryTexts.includes('/hide-bottom-bar'));
    assert(!glossaryTexts.some(text => text.includes('Open open')), 'glossary help must not double the open- prefix');

    // Flush the async statusline render before using its details control.
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    const status = document.getElementById('sbterm-statusline');
    const statusDetails = document.getElementById('sbterm-status-details');
    assert(status.textContent.startsWith('run:idle | chat:'), 'decisive run state must survive status truncation');
    assert.equal(statusDetails?.tagName, 'BUTTON');
    assert.equal(statusDetails?.dataset.action, 'status');
    document.dispatch('click', {
        target: { closest: selector => selector === '.sbterm-status-details' ? statusDetails : null },
    });
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
        'open-homepage', 'hide-topbar', 'open-nav-topbar', 'hide-home', 'hide-avatar', 'show-avatar',
        'show-chat-topbar', 'hide-chat-topbar', 'show-bottom-bar', 'hide-bottom-bar',
    ]) {
        assert(parser.commands[name], `expected /${name} to be registered`);
    }
    assert.equal(parser.commands.api, apiCommand, 'native /api must be untouched');
    assert.equal(parser.commands.model, modelCommand, 'native /model must be untouched');

    sendInput.value = '/sbterm ui full';
    let prevented = false;
    let stopped = false;
    document.dispatch('click', {
        target: { closest: selector => selector === '#gg_simple_send_button' },
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
        target: { closest: selector => selector === '#send_but' },
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.deepEqual(executedCommands, ['/sbterm ui full', '/home']);

    sendInput.value = '/api';
    let nativeApiPrevented = false;
    document.dispatch('click', {
        target: { closest: selector => selector === '#send_but' },
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
    let touchPrevented = false;
    document.dispatch('touchend', {
        target: { closest: selector => selector === '#send_but' },
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
        target: { closest: selector => selector === '#send_but' },
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
        target: { closest: selector => selector === '#sb-home-toggle' },
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert(document.body.classList.contains('sbterm-home-visible'));
    assert.equal(homeClicks, 2);

    await parser.commands['hide-topbar'].callback();
    assert.equal(settings.topbarVisible, false);
    assert(document.body.classList.contains('sbterm-topbar-hidden'));
    await parser.commands['open-nav-topbar'].callback();
    assert.equal(settings.topbarVisible, true);
    assert(!document.body.classList.contains('sbterm-topbar-hidden'));

    await parser.commands['hide-avatar'].callback();
    assert.equal(settings.avatarVisible, false);
    assert(document.body.classList.contains('sbterm-avatar-hidden'));
    await parser.commands['show-avatar'].callback();
    assert.equal(settings.avatarVisible, true);
    assert(!document.body.classList.contains('sbterm-avatar-hidden'));

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
        target: { closest: selector => selector === '#send_but' },
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert.deepEqual(executedCommands.at(-1), '/open-extensions');

    const executeCommands = context.executeSlashCommandsWithOptions;
    context.executeSlashCommandsWithOptions = async () => { throw new Error('test rejection'); };
    sendInput.value = '/open-api';
    sendInput.focused = false;
    const consoleError = console.error;
    console.error = () => {};
    try {
        document.dispatch('click', {
            target: { closest: selector => selector === '#send_but' },
            preventDefault() {},
            stopImmediatePropagation() {},
        });
        await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    } finally {
        console.error = consoleError;
        context.executeSlashCommandsWithOptions = executeCommands;
    }
    assert.equal(sendInput.value, '/open-api', 'a rejected command must be restored');
    assert.equal(sendInput.focused, true);
    assert.equal(toastError, 1);
    sendInput.value = '';

    context.executeSlashCommandsWithOptions = async () => ({ isError: true });
    sendInput.value = '/open-api';
    sendInput.focused = false;
    document.dispatch('click', {
        target: { closest: selector => selector === '#send_but' },
        preventDefault() {},
        stopImmediatePropagation() {},
    });
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    context.executeSlashCommandsWithOptions = executeCommands;
    assert.equal(sendInput.value, '/open-api', 'a resolved command error must be restored');
    assert.equal(sendInput.focused, true);
    assert.equal(toastError, 2);
    sendInput.value = '';

    sheld.dataset.sbConversationMode = 'on';
    const bodyObserver = mutationObservers.find(observer => observer.target === document.body);
    bodyObserver.callback([]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
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
    delete sheld.dataset.sbConversationMode;
    bodyObserver.callback([]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 0));
    assert.equal(conversationAutocomplete.hidden, true, 'closing Conversation Mode must hide its slash preview');

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
    assert(document.getElementById('sbterm-chat-topbar'));
    assert(!bottomBar.classList.contains('displayNone'));

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
    assert(!parser.commands['hide-topbar']);
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
    assert.equal(document.listenerCount('submit'), 0);
    assert.equal(document.listenerCount('keydown'), 0);
    assert.equal(document.listenerCount('click'), 0);
    assert.equal(document.listenerCount('touchend'), 0);
    assert.equal(eventSource.totalListeners(), 0);

    delete parser.commands.sbterm;
    delete parser.commands.home;
    extension.enable();
    assert(parser.commands.sbterm);
    assert(parser.commands.home);
    assert(parser.commands['open-extensions']);
    assert(parser.commands['open-api']);
    assert(parser.commands['hide-topbar']);
    assert.notEqual(parser.commands.sbterm, command);
    assert.equal(settings.topbarVisible, true, 'user toggle must persist across re-activation');
    extension.disable();
    assert(!parser.commands.sbterm);
    assert(!parser.commands.home);
    assert(!parser.commands['open-extensions']);
    assert(!parser.commands['hide-topbar']);
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

test('static UI rules preserve contrast and density boundaries', async () => {
    const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\) #chat \.welcomePanel\s*\{\s*display:\s*none !important;/, 'Terminal Home must replace native Home in every density');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\)[^{]+\.sbterm-command-glossary\s*\{\s*display:\s*block;/, 'Terminal Home must remain visible in full chrome');
    assert(!css.includes('sbterm-minimal:not(.sbterm-home-visible)'), 'Home replacement must not depend on terminal density');
    assert.match(css, /\.sbterm-command-glossary[^}]+max-block-size:\s*min\(50dvh, 28rem\)[^}]+overflow-y:\s*auto;/s, 'the complete Home reference must scroll independently');
    assert.match(css, /\.sbterm-command-glossary-list[^}]+grid-template-columns:\s*minmax\(0, 1fr\)/s, 'Home commands must remain one column so descriptions cannot overlap');
    assert.match(css, /body\.sbterm:not\(\.sbterm-home-visible\):has\(#chat \.welcomePanel\) #bg1\s*\{[^}]+opacity:\s*var\(--customCSS-bg-opacity, 1\);/s, 'Terminal Home must retain the configured host backdrop');
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
