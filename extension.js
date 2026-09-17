import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindscribeCli} from './cli.js';
import {parseStatus, parseLocations} from './parser.js';

const MAX_LOCATIONS = 200;

const PROTOCOLS = [
    ['auto', 'Авто'],
    ['wireguard', 'WireGuard'],
    ['udp', 'OpenVPN UDP'],
    ['tcp', 'OpenVPN TCP'],
    ['stealth', 'Stealth'],
    ['wstunnel', 'WStunnel'],
];

export default class WindbarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._cli = new WindscribeCli();
        this._installed = GLib.find_program_in_path('windscribe-cli') !== null;
        this._status = null;
        this._locations = [];
        this._favorites = [];
        this._best = null;
        this._locationsLoaded = false;
        this._protocol = this._settings.get_string('default-protocol');

        this._button = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._icon = new St.Icon({
            gicon: Gio.FileIcon.new(
                Gio.File.new_for_path(`${this.path}/windscribe-symbolic.svg`),
            ),
            style_class: 'system-status-icon',
        });
        this._button.add_child(this._icon);

        this._buildMenu();
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._button.menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                return;
            this._refresh();
            if (!this._locationsLoaded)
                this._loadLocations();
        });

        this._refresh();
        this._restartPolling();

        this._settings.connect('changed::default-protocol', () => {
            this._protocol = this._settings.get_string('default-protocol');
            this._rebuildProtocols();
        });
        this._settings.connect('changed::poll-interval', () => this._restartPolling());
    }

    disable() {
        if (this._pollId) {
            GLib.Source.remove(this._pollId);
            this._pollId = 0;
        }

        this._button?.destroy();
        this._button = null;
        this._cli = null;
        this._settings = null;
    }

    _restartPolling() {
        if (this._pollId) {
            GLib.Source.remove(this._pollId);
            this._pollId = 0;
        }
        this._pollId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            this._settings.get_int('poll-interval'),
            () => {
                this._refresh();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _buildMenu() {
        this._statusItem = new PopupMenu.PopupMenuItem('Проверка Windscribe…', {
            reactive: false,
        });
        this._button.menu.addMenuItem(this._statusItem);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._toggleItem = new PopupMenu.PopupMenuItem('Подключить');
        this._toggleItem.connect('activate', () => this._toggle());
        this._button.menu.addMenuItem(this._toggleItem);

        this._locationsItem = new PopupMenu.PopupSubMenuMenuItem('Локации', false);
        this._button.menu.addMenuItem(this._locationsItem);

        this._favoritesItem = new PopupMenu.PopupSubMenuMenuItem('Избранное', false);
        this._button.menu.addMenuItem(this._favoritesItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._protocolItem = new PopupMenu.PopupSubMenuMenuItem('Протокол', false);
        this._button.menu.addMenuItem(this._protocolItem);
        this._rebuildProtocols();

        this._firewallItem = new PopupMenu.PopupSwitchMenuItem('Брандмауэр', false);
        this._firewallItem.connect('toggled', item => this._setFirewall(item.state));
        this._button.menu.addMenuItem(this._firewallItem);

        this._rotateItem = new PopupMenu.PopupMenuItem('Сменить IP');
        this._rotateItem.visible = false;
        this._rotateItem.connect('activate', () => this._rotateIp());
        this._button.menu.addMenuItem(this._rotateItem);

        this._pinItem = new PopupMenu.PopupMenuItem('Закрепить текущий IP');
        this._pinItem.visible = false;
        this._pinItem.connect('activate', () => this._pinIp());
        this._button.menu.addMenuItem(this._pinItem);

        this._loginItem = new PopupMenu.PopupMenuItem('Скопировать команду входа');
        this._loginItem.visible = false;
        this._loginItem.connect('activate', () => this._copyLoginCommand());
        this._button.menu.addMenuItem(this._loginItem);

        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._refreshItem = new PopupMenu.PopupMenuItem('Обновить');
        this._refreshItem.connect('activate', () => {
            this._locationsLoaded = false;
            this._refresh();
            this._loadLocations();
        });
        this._button.menu.addMenuItem(this._refreshItem);
    }

    async _refresh() {
        if (!this._statusItem)
            return;

        if (!this._installed) {
            this._status = null;
            this._statusItem.label.text = 'windscribe-cli не найден';
            this._toggleItem.label.text = 'Подключить';
            return;
        }

        try {
            const result = await this._cli.run(['status']);
            this._status = parseStatus(result.stdout);
            this._renderStatus();
        } catch (error) {
            this._status = null;
            this._statusItem.label.text = `Windscribe: ${this._shortError(error)}`;
            this._toggleItem.label.text = 'Подключить';
        }
    }

    async _loadLocations() {
        try {
            const locations = await this._cli.run(['locations']);
            const parsed = parseLocations(locations.stdout);
            this._locations = parsed.locations.slice(0, MAX_LOCATIONS);
            this._best = parsed.best;
        } catch (error) {
            this._locations = [];
            this._best = null;
        }

        try {
            const favorites = await this._cli.run(['locations', 'fav']);
            this._favorites = parseLocations(favorites.stdout).locations;
        } catch (error) {
            this._favorites = [];
        }

        this._locationsLoaded = true;
        this._rebuildLocations();
        this._rebuildFavorites();
    }

    async _toggle() {
        this._toggleItem.reactive = false;
        this._toggleItem.label.text = 'Выполняется…';

        try {
            if (this._status?.connected)
                await this._cli.run(['disconnect']);
            else
                await this._connectCommand('best');
        } catch (error) {
            this._statusItem.label.text = `Ошибка: ${this._shortError(error)}`;
        } finally {
            this._toggleItem.reactive = true;
            await this._refresh();
        }
    }

    async _connect(target) {
        try {
            await this._connectCommand(target);
        } catch (error) {
            this._statusItem.label.text = `Ошибка: ${this._shortError(error)}`;
        }
        await this._refresh();
    }

    _connectCommand(target) {
        const args = ['connect', target];
        if (this._protocol !== 'auto')
            args.push(this._protocol);
        return this._cli.run(args);
    }

    async _setFirewall(on) {
        try {
            await this._cli.run(['firewall', on ? 'on' : 'off']);
        } catch (error) {
            this._statusItem.label.text = `Ошибка: ${this._shortError(error)}`;
        }
        await this._refresh();
    }

    async _rotateIp() {
        await this._runAction(['ip', 'rotate'], 'Смена IP…');
    }

    async _pinIp() {
        await this._runAction(['ip', 'fav'], 'Закрепление IP…');
    }

    async _runAction(args, busyText) {
        this._statusItem.label.text = busyText;
        try {
            await this._cli.run(args);
        } catch (error) {
            this._statusItem.label.text = `Ошибка: ${this._shortError(error)}`;
        }
        await this._refresh();
    }

    _copyLoginCommand() {
        const clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, 'windscribe-cli login');
        this._statusItem.label.text = 'Команда входа скопирована в буфер обмена';
    }

    _rebuildProtocols() {
        this._protocolItem.menu.removeAll();
        for (const [key, label] of PROTOCOLS) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.setOrnament(key === this._protocol
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
            item.connect('activate', () => {
                this._protocol = key;
                this._rebuildProtocols();
            });
            this._protocolItem.menu.addMenuItem(item);
        }
    }

    _rebuildLocations() {
        this._locationsItem.menu.removeAll();

        if (this._best) {
            this._locationsItem.menu.addAction('Лучшая локация', () => this._connect('best'));
            this._locationsItem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        if (this._locations.length === 0) {
            this._locationsItem.menu.addAction('Нет данных', () => {});
            return;
        }

        const byRegion = new Map();
        for (const location of this._locations) {
            const region = location.region || 'Другое';
            if (!byRegion.has(region))
                byRegion.set(region, []);
            byRegion.get(region).push(location);
        }

        for (const region of [...byRegion.keys()].sort()) {
            const regionItem = new PopupMenu.PopupSubMenuMenuItem(region, false);
            for (const location of byRegion.get(region)) {
                const label = location.city
                    ? `${location.city} — ${location.nickname}`
                    : location.nickname;
                regionItem.menu.addAction(label, () => this._connect(location.target));
            }
            this._locationsItem.menu.addMenuItem(regionItem);
        }
    }

    _rebuildFavorites() {
        this._favoritesItem.menu.removeAll();

        if (this._favorites.length === 0) {
            this._favoritesItem.menu.addAction('Нет избранного', () => {});
            return;
        }

        for (const location of this._favorites) {
            this._favoritesItem.menu.addAction(
                location.full || location.nickname,
                () => this._connect(location.target),
            );
        }
    }

    _renderStatus() {
        const status = this._status;
        if (!status)
            return;

        const parts = [];
        if (status.connected)
            parts.push(`Подключено: ${status.location || '…'}`);
        else
            parts.push('Отключено');
        if (status.protocol)
            parts.push(status.protocol);
        if (status.ip)
            parts.push(`IP ${status.ip}`);
        if (!status.loggedIn)
            parts.push('не выполнен вход');

        this._statusItem.label.text = parts.join('  ·  ');
        this._toggleItem.label.text = status.connected ? 'Отключить' : 'Подключить';
        this._firewallItem.setToggleState(status.firewallOn);
        this._rotateItem.visible = status.connected;
        this._pinItem.visible = status.connected;
        this._loginItem.visible = !status.loggedIn;
    }

    _shortError(error) {
        return String(error.message || error).split('\n').filter(Boolean).pop() ||
            'неизвестная ошибка';
    }
}
