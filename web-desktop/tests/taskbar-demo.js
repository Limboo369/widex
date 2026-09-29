/** Browser integration harness. Served only by preview-design.js --taskbar-demo. */
import { $, h } from '/js/util/dom.js';
import { icon, mountIcons } from '/js/ui/icons.js';
import { WindowManager } from '/js/ui/windows.js';
import { PhoneTaskbar } from '/js/ui/phone-taskbar.js';
import { AppsMenu } from '/js/views/apps-menu.js';

mountIcons();
const app = {
    session: { id: 'taskbar-demo', serial: 'demo-phone', state: 'running', options: {} },
    foreground: null, profiles: [], videoDisplayId: 0,
    foregroundPackage() { return this.foreground; },
    currentSerial() { return this.session?.serial; },
    async waitForAppVisual(pkg) {
        // Simulate Android switching and then supplying a frame while the window is hidden.
        await new Promise(resolve => setTimeout(resolve, 180));
        this.foreground = pkg;
        this.currentLabel = this.appsMenu.labelOf(pkg);
        const win = this.windows.get('phone');
        if (win) {
            win.element.dataset.visualChangedWhileHidden = String(win.minimized);
            win.body.querySelector('h2').textContent = this.currentLabel;
        }
        this.phoneApps.onForeground(pkg);
    },
    togglePhoneScreen() {},
    async stopSession() { this.session = null; this.foreground = null; this.phoneApps.clear(); },
    openPhone() {
        this.windows.open({ id: 'phone', title: 'Telefon · Pregled prebacivanja', icon: '📱', width: 760, height: 420,
            onClose: () => { this.phoneApps.closeCurrent(); return true; },
            content: h('div.view',
                h('div.view-intro', h('div.view-intro-icon', icon('phone')),
                    h('div', h('h2', this.currentLabel || 'Telefon'), h('p', 'Simulacija · Jedan prikaz, više aplikacija u donjoj traci.'))),
                h('div.notice.info', 'Otvori Browser, Muziku i Galeriju iz Start menija. Klikni njihove stavke u donjoj traci da promijeniš aktivnu aplikaciju.')) });
    },
};
app.windows = new WindowManager($('#window-container'), $('#taskbar-windows'));
app.appsMenu = new AppsMenu(app);
app.phoneApps = new PhoneTaskbar(app, $('#taskbar-phone-apps'));
app.windows.onTaskbarUpdate = () => app.phoneApps.render();
app.windows.onPhoneMinimizeRequest = () => app.phoneApps.minimize();
app.phoneApps.attach(app.session);
const launch = app.phoneApps.launch.bind(app.phoneApps);
app.phoneApps.launch = async item => {
    const ok = await launch(item);
    if (ok) {
        app.foreground = item.package;
        app.currentLabel = item.label;
        const win = app.windows.get('phone');
        win.body.querySelector('h2').textContent = item.label;
        win.setTitle('Telefon · ' + item.label);
        app.phoneApps.onForeground(item.package);
    }
    return ok;
};
$('#start-btn').addEventListener('click', () => app.appsMenu.toggle());
document.querySelectorAll('.desktop-icon').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.action === 'apps') app.appsMenu.toggle();
    else if (button.dataset.action === 'phone') app.openPhone();
}));
$('#start-device-name').textContent = 'Telefon · Simulacija';
$('#start-device-status').textContent = 'Pregled funkcije';
$('#desktop-connection-status').textContent = 'Simulacija · Bez povezivanja s telefonom';
await app.appsMenu.load(false);
