import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PROTOCOLS = [
    ['auto', 'Авто'],
    ['wireguard', 'WireGuard'],
    ['udp', 'OpenVPN UDP'],
    ['tcp', 'OpenVPN TCP'],
    ['stealth', 'Stealth'],
    ['wstunnel', 'WStunnel'],
];

const PANEL_POSITIONS = [
    ['center', 'По центру (рядом с часами)'],
    ['left', 'Слева'],
    ['right', 'Справа'],
];

export default class WindbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Подключение',
        });
        page.add(group);

        const protocolRow = new Adw.ComboRow({
            title: 'Протокол по умолчанию',
            subtitle: 'Используется при подключении к локации',
        });
        const model = new Gtk.StringList();
        for (const [, label] of PROTOCOLS)
            model.append(label);
        protocolRow.set_model(model);
        protocolRow.set_selected(Math.max(
            0,
            PROTOCOLS.findIndex(([key]) => key === settings.get_string('default-protocol')),
        ));
        protocolRow.connect('notify::selected', () => {
            const index = protocolRow.get_selected();
            if (index >= 0 && index < PROTOCOLS.length)
                settings.set_string('default-protocol', PROTOCOLS[index][0]);
        });
        group.add(protocolRow);

        const intervalRow = new Adw.SpinRow({
            title: 'Интервал обновления',
            subtitle: 'Как часто обновлять статус (в секундах)',
        });
        intervalRow.set_range(5, 3600);
        intervalRow.set_value(settings.get_int('poll-interval'));
        intervalRow.connect('notify::value', () => {
            settings.set_int('poll-interval', intervalRow.get_value());
        });
        group.add(intervalRow);

        const positionRow = new Adw.ComboRow({
            title: 'Позиция на панели',
            subtitle: 'Где отображать индикатор в верхней панели',
        });
        const positionModel = new Gtk.StringList();
        for (const [, label] of PANEL_POSITIONS)
            positionModel.append(label);
        positionRow.set_model(positionModel);
        positionRow.set_selected(Math.max(
            0,
            PANEL_POSITIONS.findIndex(([key]) => key === settings.get_string('panel-position')),
        ));
        positionRow.connect('notify::selected', () => {
            const index = positionRow.get_selected();
            if (index >= 0 && index < PANEL_POSITIONS.length)
                settings.set_string('panel-position', PANEL_POSITIONS[index][0]);
        });
        group.add(positionRow);
    }
}
