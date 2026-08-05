// Terminal UI — settings + body-class toggling. All styling lives in style.css,
// gated under body.sbterm, so enable/disable never needs a reload.

const MODULE = 'SillyBunny-Terminal-UI';
const DRAWER_ID = 'sbterm-settings-drawer';

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

const DEFAULTS = { version: 1, enabled: true, palette: 'phosphor-green', crt: false };

function ctx() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
}

function getSettings() {
    const c = ctx();
    if (!c?.extensionSettings) {
        return { ...DEFAULTS };
    }
    if (typeof c.extensionSettings[MODULE] !== 'object' || c.extensionSettings[MODULE] === null) {
        c.extensionSettings[MODULE] = { ...DEFAULTS };
    }
    const settings = c.extensionSettings[MODULE];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (!(key in settings)) {
            settings[key] = value;
        }
    }
    return settings;
}

function save() {
    ctx()?.saveSettingsDebounced?.();
}

function apply() {
    const s = getSettings();
    document.body.classList.toggle('sbterm', !!s.enabled);
    document.body.classList.toggle('sbterm-crt', !!(s.enabled && s.crt));
    document.body.dataset.sbtermPalette = s.palette;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function checkboxRow(labelText, checked, onChange) {
    const label = el('label', 'checkbox_label');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, el('span', undefined, labelText));
    return label;
}

function renderDrawer() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById(DRAWER_ID)) {
        return;
    }

    const drawer = el('div', 'inline-drawer');
    drawer.id = DRAWER_ID;

    const toggle = el('div', 'inline-drawer-toggle inline-drawer-header');
    toggle.appendChild(el('b', undefined, 'Terminal UI'));
    toggle.appendChild(el('div', 'inline-drawer-icon fa-solid fa-circle-chevron-down down'));

    const content = el('div', 'inline-drawer-content');
    const s = getSettings();

    content.appendChild(checkboxRow('Enable terminal skin', s.enabled, (value) => {
        getSettings().enabled = value;
        save();
        apply();
    }));

    const paletteRow = el('label', 'flex-container alignItemsCenter');
    paletteRow.appendChild(el('span', undefined, 'Palette'));
    const select = el('select', 'text_pole');
    for (const [slug, name] of PALETTES) {
        const option = el('option', undefined, name);
        option.value = slug;
        select.appendChild(option);
    }
    select.value = s.palette;
    select.addEventListener('change', () => {
        getSettings().palette = select.value;
        save();
        apply();
    });
    paletteRow.appendChild(select);
    content.appendChild(paletteRow);

    content.appendChild(checkboxRow('CRT effects (scanlines, glow, flicker)', s.crt, (value) => {
        getSettings().crt = value;
        save();
        apply();
    }));

    drawer.append(toggle, content);
    host.appendChild(drawer);
}

const c = ctx();
if (c?.eventSource) {
    const APP_READY = (c.eventTypes ?? c.event_types)?.APP_READY;
    c.eventSource.on(APP_READY, () => {
        renderDrawer();
        apply();
    });
}

export function activate() {
    apply();
}

export function enable() {
    apply();
}

export function disable() {
    document.body.classList.remove('sbterm', 'sbterm-crt');
    delete document.body.dataset.sbtermPalette;
}
