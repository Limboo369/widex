import { iconText } from '../ui/icons.js';

/**
 * Small DOM helpers.
 */

export function $(selector, root = document) {
    return root.querySelector(selector);
}

export function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

/**
 * Create an element: h('div.class1.class2', {attr: value, onclick: fn}, children...)
 */
export function h(tag, attrs, ...children) {
    const parts = tag.split('.');
    const el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) {
        el.className = parts.slice(1).join(' ');
    }
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
        children.unshift(attrs);
        attrs = null;
    }
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (value === undefined || value === null || value === false) {
                continue;
            }
            if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.substring(2).toLowerCase(), value);
            } else if (key === 'className') {
                el.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key === 'dataset') {
                Object.assign(el.dataset, value);
            } else if (key === 'html') {
                el.innerHTML = value;
            } else if (key in el && typeof value !== 'string') {
                el[key] = value;
            } else {
                el.setAttribute(key, value === true ? '' : String(value));
            }
        }
    }
    appendChildren(el, children);
    return el;
}

function appendChildren(el, children) {
    for (const child of children) {
        if (child === undefined || child === null || child === false) {
            continue;
        }
        if (Array.isArray(child)) {
            appendChildren(el, child);
        } else if (child instanceof Node) {
            el.appendChild(child);
        } else {
            el.appendChild(['OPTION', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(el.tagName)
                ? document.createTextNode(String(child)) : iconText(String(child)));
        }
    }
}

export function toast(message, type = 'info', timeout = 4500) {
    const container = document.getElementById('toasts');
    const el = h('div.toast.' + type, message);
    container.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    }, timeout);
    return el;
}

export function formatBitrate(kbps) {
    if (kbps >= 1000) {
        return (kbps / 1000).toFixed(1) + ' Mb/s';
    }
    return kbps + ' kb/s';
}

export function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function isTextInput(el) {
    if (!el) {
        return false;
    }
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
    }
    if (tag === 'INPUT') {
        const type = (el.type || 'text').toLowerCase();
        return !['checkbox', 'radio', 'range', 'button', 'submit'].includes(type);
    }
    return el.isContentEditable;
}
