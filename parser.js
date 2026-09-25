function cleanLines(output) {
    return String(output ?? '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('{'));
}

function valueAfterColon(line) {
    const separator = line.indexOf(':');
    return separator === -1 ? '' : line.slice(separator + 1).trim();
}

function findValue(lines, labels) {
    const lower = labels.map(label => label.toLocaleLowerCase());
    const line = lines.find(candidate => {
        const text = candidate.toLocaleLowerCase();
        return lower.some(label => text.startsWith(label));
    });
    return line ? valueAfterColon(line) : '';
}

function isOn(value) {
    return /вкл|on|enabled/i.test(value) && !/выкл|off|disabled/i.test(value);
}

export function parseStatus(output) {
    const lines = cleanLines(output);
    const connection = findValue(lines, [
        'Состояние подключения:',
        'Connection state:',
        'Connection status:',
        'Connect state:',
    ]);
    const connected = /подключено|connected/i.test(connection) &&
        !/не\s+подключено|not\s+connected|disconnected/i.test(connection);
    const loggedIn = findValue(lines, [
        'Состояние входа:',
        'Login state:',
        'Login status:',
    ]);
    const firewall = findValue(lines, [
        'Состояние брандмауэра:',
        'Firewall state:',
        'Firewall status:',
    ]);

    return {
        connected,
        connection,
        loggedIn: /выполнен вход|logged in|logged in:/i.test(loggedIn) &&
            !/не\s+выполнен\s+вход|not\s+logged\s+in/i.test(loggedIn),
        location: connected ? connection.replace(/^(подключено|connected)\s*:?\s*/i, '') : '',
        firewallOn: isOn(firewall),
        firewall,
        protocol: findValue(lines, ['Протокол:', 'Protocol:']),
        ip: findValue(lines, [
            'IP-адрес VPN:',
            'VPN IP address:',
            'VPN IP:',
            'Публичный IP:',
            'Public IP:',
        ]),
    };
}

function parseLocationLine(line) {
    const raw = String(line ?? '').trim();
    if (raw === '' || /^no locations/i.test(raw))
        return null;

    let speed = '';
    const speedMatch = raw.match(/\(([^)]+)\)\s*$/);
    if (speedMatch)
        speed = speedMatch[1].trim();

    const label = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (label === '')
        return null;

    const parts = label.split(' - ').map(part => part.trim());
    let region = '';
    let city = '';
    let nickname = '';

    if (parts.length >= 3) {
        region = parts[0];
        city = parts[1];
        nickname = parts.slice(2).join(' - ');
    } else if (parts.length === 2) {
        region = parts[0];
        nickname = parts[1];
    } else {
        nickname = parts[0];
    }

    return {
        full: label,
        region,
        city,
        nickname,
        speed,
        target: nickname || city || label,
    };
}

export function parseLocations(output) {
    const lines = cleanLines(output);
    const locations = [];
    let best = null;

    for (let index = 0; index < lines.length; index++) {
        const isBestLine = index === 0 && /^best location/i.test(lines[index]);
        if (isBestLine) {
            best = {target: 'best', label: 'Best location'};
            continue;
        }

        const location = parseLocationLine(lines[index]);
        if (location)
            locations.push(location);
    }

    return {best, locations};
}

if (typeof ARGV !== 'undefined' && ARGV[0] === '--self-test') {
    const status = parseStatus([
        '{"tm": "x", "lvl": "info", "mod": "cli", "msg": "=== Started ==="}',
        'Состояние подключения: Подключено: Warsaw - Vistula',
        'Состояние входа: Выполнен вход',
        'Состояние брандмауэра: Вкл.',
        'Протокол: WireGuard:443',
        'IP-адрес VPN: [redacted]',
    ].join('\n'));

    console.assert(status.connected);
    console.assert(status.loggedIn);
    console.assert(status.firewallOn);
    console.assert(status.location === 'Warsaw - Vistula');
    console.assert(status.protocol === 'WireGuard:443');
    console.assert(status.ip === '[redacted]');

    const disconnected = parseStatus([
        'Состояние подключения: Отключено',
        'Состояние брандмауэра: Выкл.',
        'Публичный IP: [redacted]',
    ].join('\n'));
    console.assert(!disconnected.connected);
    console.assert(!disconnected.firewallOn);
    console.assert(disconnected.ip === '[redacted]');

    console.assert(!parseStatus('Connection state: Not connected').connected);
    console.assert(!parseStatus('Login state: Not logged in').loggedIn);
    console.assert(!parseStatus('Состояние входа: Не выполнен вход').loggedIn);

    const list = parseLocations([
        'Best Location',
        'Europe - Poland - Warsaw - Vistula (12 ms)',
        'North America - USA - New York - Manhattan (90 ms)',
        'Asia - Japan - Tokyo (150 ms)',
    ].join('\n'));

    console.assert(list.best !== null);
    console.assert(list.locations.length === 3);
    console.assert(list.locations[0].region === 'Europe');
    console.assert(list.locations[0].city === 'Poland');
    console.assert(list.locations[0].target === 'Warsaw - Vistula');
    console.assert(list.locations[2].target === 'Tokyo');

    print('parser self-test OK');
}
