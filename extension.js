import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as NetworkStatus from 'resource:///org/gnome/shell/ui/status/network.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {WindscribeCli} from './cli.js';
import {parseStatus, parseLocations} from './parser.js';

const MAX_LOCATIONS = 200;
const ACTIVATION_ERROR_SUPPRESS_SECONDS = 8;

let suppressActivationErrorsUntil = 0;

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
        this._favoriteLocations = new Set(this._settings.get_strv('favorite-locations'));
        this._patchActivationErrorNotification();
        this._best = null;
        this._locationsLoaded = false;
        this._protocol = this._settings.get_string('default-protocol');
        this._connectedIcon = Gio.FileIcon.new(
            Gio.File.new_for_path(`${this.path}/windbar-connected.svg`),
        );
        this._disconnectedIcon = Gio.FileIcon.new(
            Gio.File.new_for_path(`${this.path}/windbar-disconnected.svg`),
        );

        this._button = new PanelMenu.Button(0.0, this.metadata.name, false);
        this._icon = new St.Icon({
            gicon: this._disconnectedIcon,
            style_class: 'system-status-icon',
        });
        this._button.add_child(this._icon);

        this._buildMenu();
        Main.panel.addToStatusArea(this.uuid, this._button, 0, this._panelBoxName());

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
        this._settings.connect('changed::panel-position', () => this._positionButton());
    }

    disable() {
        if (this._pollId) {
            GLib.Source.remove(this._pollId);
            this._pollId = 0;
        }

        this._unpatchActivationErrorNotification();

        this._button?.destroy();
        this._button = null;
        this._cli = null;
        this._settings = null;
    }

    _patchActivationErrorNotification() {
        const proto = NetworkStatus.Indicator.prototype;
        if (proto._windbarOnActivationFailed)
            return;

        proto._windbarOnActivationFailed = proto._onActivationFailed;
        proto._onActivationFailed = function() {
            if (GLib.get_monotonic_time() / GLib.USEC_PER_SEC < suppressActivationErrorsUntil)
                return;
            proto._windbarOnActivationFailed.call(this);
        };
    }

    _unpatchActivationErrorNotification() {
        const proto = NetworkStatus.Indicator.prototype;
        if (!proto._windbarOnActivationFailed)
            return;
        proto._onActivationFailed = proto._windbarOnActivationFailed;
        delete proto._windbarOnActivationFailed;
    }

    _beginConnectionChange() {
        suppressActivationErrorsUntil =
            GLib.get_monotonic_time() / GLib.USEC_PER_SEC +
            ACTIVATION_ERROR_SUPPRESS_SECONDS;
    }

    _panelBoxName() {
        const name = this._settings.get_string('panel-position');
        return ['left', 'center', 'right'].includes(name) ? name : 'right';
    }

    _positionButton() {
        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        const box = boxes[this._panelBoxName()] || Main.panel._rightBox;
        const container = this._button.container;
        const parent = container.get_parent();
        if (parent === box)
            return;
        if (parent)
            parent.remove_child(container);
        box.add_child(container);
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
        this._beginConnectionChange();

        try {
            if (this._status?.connected)
                await this._cli.run(['disconnect']);
            else {
                await this._connectCommand('best');
                await this._refresh();
                if (this._status?.connected)
                    Main.notify('Windbar', 'Подключение выполнено, можно выпить пивка');
                return;
            }
        } catch (error) {
            this._statusItem.label.text = `Ошибка: ${this._shortError(error)}`;
        } finally {
            this._toggleItem.reactive = true;
            await this._refresh();
        }
    }

    async _connect(target) {
        this._beginConnectionChange();
        try {
            await this._connectCommand(target);
            await this._refresh();
            if (this._status?.connected)
                Main.notify('Windbar', 'Подключение выполнено, можно выпить пивка');
            return;
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
            const regionItem = new PopupMenu.PopupMenuItem(region, {reactive: false});
            this._locationsItem.menu.addMenuItem(regionItem);

            for (const location of byRegion.get(region))
                this._locationsItem.menu.addMenuItem(this._createLocationItem(location));
        }
    }

    _createLocationItem(location) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: true});
        item.connect('activate', () => this._connect(location.target));

        const label = new St.Label({
            text: location.city
                ? `${location.city} — ${location.nickname}`
                : location.nickname,
            x_expand: true,
        });
        item.add_child(label);

        const starIcon = new St.Icon({
            style_class: 'popup-menu-icon',
            reactive: true,
        });
        const updateStar = () => {
            starIcon.icon_name = this._favoriteLocations.has(location.full)
                ? 'starred-symbolic'
                : 'non-starred-symbolic';
        };
        starIcon.connect('button-release-event', (actor, event) => {
            if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                return Clutter.EVENT_PROPAGATE;
            this._toggleFavorite(location);
            updateStar();
            return Clutter.EVENT_STOP;
        });
        updateStar();
        item.add_child(starIcon);

        return item;
    }

    _rebuildFavorites() {
        this._favoritesItem.menu.removeAll();

        const favorites = new Map(this._favorites.map(location => [location.full, location]));
        for (const location of this._locations) {
            if (this._favoriteLocations.has(location.full))
                favorites.set(location.full, location);
        }

        if (favorites.size === 0) {
            this._favoritesItem.menu.addAction('Нет избранного', () => {});
            return;
        }

        for (const location of favorites.values()) {
            this._favoritesItem.menu.addAction(
                location.full || location.nickname,
                () => this._connect(location.target),
            );
        }
    }

    _toggleFavorite(location) {
        if (this._favoriteLocations.has(location.full))
            this._favoriteLocations.delete(location.full);
        else
            this._favoriteLocations.add(location.full);

        this._settings.set_strv('favorite-locations', [...this._favoriteLocations]);
        this._rebuildFavorites();
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
        this._icon.gicon = status.connected
            ? this._connectedIcon
            : this._disconnectedIcon;
    }

    _shortError(error) {
        return String(error.message || error).split('\n').filter(Boolean).pop() ||
            'неизвестная ошибка';
    }
}
