import assert from 'node:assert/strict';
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

    appendChild(node) {
        node.parentNode = this;
        this.children.push(node);
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

    addEventListener() {}

    dispatchEvent() {
        return true;
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
    const chat = new FakeElement('div');
    chat.id = 'chat';
    const welcome = new FakeElement('div');
    welcome.className = 'welcomePanel';
    chat.appendChild(welcome);
    const home = new FakeElement('button');
    home.id = 'sb-home-toggle';
    let homeClicks = 0;
    home.click = () => homeClicks += 1;
    document.body.append(settingsHost, topbar, chat, sendInput, home);

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
    };
    const shellCalls = [];

    globalThis.document = document;
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.SillyBunnyShell = { openTab: (...args) => shellCalls.push(args) };
    globalThis.MutationObserver = class {
        observe() {}
        disconnect() {}
    };
    globalThis.toastr = { info() {}, success() {}, warning() {}, error() {} };

    const extension = await import('../index.js');
    extension.activate();
    await Promise.resolve();

    const settings = context.extensionSettings['SillyBunny-Terminal-UI'];
    assert.equal(settings.version, 2);
    assert.equal(settings.minimal, true);
    assert.equal(settings.palette, 'nord');
    assert.equal(saves, 1);
    assert(document.body.classList.contains('sbterm'));
    assert(document.body.classList.contains('sbterm-minimal'));
    assert.equal(document.listenerCount('submit'), 1);
    assert.equal(document.listenerCount('keydown'), 1);
    assert.equal(document.listenerCount('click'), 1);
    assert.equal(document.listenerCount('touchend'), 1);
    assert(document.getElementById('sbterm-settings-drawer'));
    assert(document.getElementById('sbterm-banner'));
    assert(document.getElementById('sbterm-statusline'));

    const command = parser.commands.sbterm;
    const homeCommand = parser.commands.home;
    assert(command);
    assert(homeCommand);
    const completions = command.unnamedArgumentList[0].enumList;
    assert(completions.includes('ui full'));
    assert(completions.includes('palette phosphor-green'));
    assert(completions.includes('palette inherit'));

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

    assert.equal(await homeCommand.callback(), 'home');
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
    assert.equal(document.getElementById('sbterm-banner').hidden, true);
    assert.equal(parser.commands.sbterm, command);
    assert(document.getElementById('sbterm-settings-drawer'));
    await command.callback({}, 'on');
    assert(document.body.classList.contains('sbterm'));
    assert.equal(document.getElementById('sbterm-banner').hidden, false);

    const foreignCommand = { name: 'sbterm' };
    const foreignHomeCommand = { name: 'home' };
    parser.commands.sbterm = foreignCommand;
    parser.commands.home = foreignHomeCommand;
    const enabledBeforeDisable = settings.enabled;
    extension.disable();
    assert.equal(parser.commands.sbterm, foreignCommand);
    assert.equal(parser.commands.home, foreignHomeCommand);
    assert.equal(await command.callback({}, 'off'), 'Terminal UI is disabled.');
    assert.equal(await homeCommand.callback(), 'Terminal UI is disabled.');
    assert.equal(settings.enabled, enabledBeforeDisable);
    assert(!document.body.classList.contains('sbterm'));
    assert(!document.body.dataset.sbtermPalette);
    assert(!document.getElementById('sbterm-settings-drawer'));
    assert(!document.getElementById('sbterm-banner'));
    assert(!document.getElementById('sbterm-statusline'));
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
    assert.notEqual(parser.commands.sbterm, command);
    extension.disable();
    assert(!parser.commands.sbterm);
    assert(!parser.commands.home);
});
