/** Local vector icon family. No network, fonts, or platform emoji required. */
const paths = {
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M10 5h4M11 18.5h2"/>',
    game: '<path d="M7 7h10c3 0 4 3 4.5 7l.3 3c.2 2-2 3-3.4 1.6L16 16H8l-2.4 2.6C4.2 20 2 19 2.2 17l.3-3C3 10 4 7 7 7Z"/><path d="M6 10v5M3.5 12.5h5"/><circle cx="16" cy="11" r=".7" fill="currentColor"/><circle cx="18.5" cy="13.5" r=".7" fill="currentColor"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.1M10 9h.1M14 9h.1M18 9h.1M6 12h.1M10 12h.1M14 12h.1M18 12h.1M7 15h10"/>',
    wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>',
    settings: '<path d="m10 2-.6 2.7-2 .9-2.4-.9-2 3.5 2 1.8-.2 2.3-2 1.7 2 3.5 2.6-.8 2 .9.6 2.4h4l.6-2.4 2-.9 2.6.8 2-3.5-2-1.7-.2-2.3 2-1.8-2-3.5-2.4.9-2-.9L14 2Z"/><circle cx="12" cy="11.5" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2.5M12 17h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    volume: '<path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
    muted: '<path d="M11 4 6 8H3v8h3l5 4ZM16 9l6 6M22 9l-6 6"/>',
    battery: '<rect x="2" y="7" width="18" height="10" rx="3"/><path d="M23 10v4M6 10v4M10 10v4M14 10v4"/>',
    light: '<path d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2Z"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M4.5 8a8 8 0 0 1 13-3L20 8M4 16l2.5 3a8 8 0 0 0 13-3"/>',
    link: '<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="3"/><path d="M12 17v4M8 21h8"/>',
    plug: '<path d="M8 2v5M16 2v5M6 7h12v3a6 6 0 0 1-12 0ZM12 16v6"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    fullscreen: '<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    home: '<circle cx="12" cy="12" r="7"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    warning: '<path d="m12 3 10 18H2ZM12 9v5M12 17h.01"/>',
    mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7M6 9h12"/>',
    save: '<path d="M4 3h13l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    video: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 8h18M7 4v4M12 4v4M17 4v4m-7 4 5 3-5 3Z"/>',
    tools: '<path d="M14 4a6 6 0 0 0-7 8L2 17a3 3 0 0 0 5 5l5-5a6 6 0 0 0 8-7l-4 4-5-5Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
};

const PNG_ICONS = new Set(['phone', 'game', 'keyboard', 'wifi', 'settings', 'help', 'grid', 'volume', 'muted', 'battery', 'light', 'refresh', 'rotate', 'link', 'monitor', 'plug', 'play', 'eye', 'fullscreen', 'back', 'home', 'square', 'bell', 'close', 'minus', 'check', 'warning', 'mouse', 'save', 'bolt', 'search', 'info', 'video', 'tools', 'trash', 'app-fullscreen', 'widex-fullscreen', 'widex-fullscreen-exit']);

/**
 * PNG icons (img/icons, rendered from Phosphor Icons, MIT) used as a mask, so they take the text color
 * of their button like the old vector icons did.
 */
export function icon(name) {
    if (PNG_ICONS.has(name)) {
        const el = document.createElement('span');
        el.className = 'ui-icon ui-icon-png';
        el.setAttribute('aria-hidden', 'true');
        el.style.setProperty('--icon', 'url("/img/icons/' + name + '.png")');
        return el;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.65', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ui-icon' })) svg.setAttribute(key, value);
    svg.innerHTML = paths[name] || paths.grid;
    return svg;
}

// Keep existing action labels and render their leading symbols with our icon family.
const symbols = new Map(Object.entries({ '📱': 'phone', '🎮': 'game', '⌨️': 'keyboard', '📶': 'wifi', '⚙️': 'settings', '❔': 'help', '⚡': 'bolt', '🔊': 'volume', '🔇': 'muted', '🔋': 'battery', '💡': 'light', '⟳': 'refresh', '🔗': 'link', '🖥️': 'monitor', '🔌': 'plug', '▶': 'play', '👁': 'eye', '⛶': 'fullscreen', '◀': 'back', '●': 'home', '▢': 'square', '🗔': 'monitor', '🔔': 'bell', '✕': 'close', '—': 'minus', '✅': 'check', '⚠️': 'warning', '🖱️': 'mouse', '💾': 'save', 'ℹ️': 'info' }));
for (const [symbol, name] of Object.entries({ '⤢': 'app-fullscreen', '🎞️': 'video', '🧰': 'tools', '🗑': 'trash', '❓': 'help', '📡': 'wifi' })) symbols.set(symbol, name);

export function iconText(text) {
    const fragment = document.createDocumentFragment();
    const match = [...symbols.keys()].find(symbol => text === symbol || text.startsWith(symbol + ' '));
    if (match) {
        fragment.append(icon(symbols.get(match)));
        const label = text.slice(match.length).trimStart();
        if (label) fragment.append(document.createTextNode(' ' + label));
    } else fragment.append(document.createTextNode(text));
    return fragment;
}

export function mountIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
        if (el.classList.contains('icon-img')) {
            // desktop icons: full-color tiles
            const img = document.createElement('img');
            img.src = 'img/icons/desktop/' + el.dataset.icon + '.png';
            img.alt = '';
            img.draggable = false;
            el.replaceChildren(img);
            return;
        }
        el.replaceChildren(icon(el.dataset.icon));
    });
}
