# Windbar

Windbar is a GNOME Shell extension for controlling Windscribe from the desktop
panel through `windscribe-cli`.

It provides a quick way to check the VPN state and perform common actions
without opening the Windscribe application or a terminal. Windbar is an
independent project and is not affiliated with Windscribe.

## Features

- monochrome Windscribe icon in the panel;
- current connection state, location, protocol and VPN IP;
- connect to the best location and disconnect;
- locations grouped by region;
- favorite locations;
- firewall on/off control;
- protocol selection: Auto, WireGuard, OpenVPN UDP/TCP, Stealth and WStunnel;
- IP rotation and current IP pinning when supported by the account;
- clear states for a missing CLI or an unauthenticated account;
- copy the login command to the clipboard;
- configurable refresh interval and default protocol;
- serialized CLI calls with retry handling for a busy Windscribe CLI.

## Requirements

- GNOME Shell 50;
- `windscribe-cli` installed and available in `PATH`;
- a completed `windscribe-cli login`.

## Installation

Install and authenticate Windscribe CLI according to its documentation first:

```bash
windscribe-cli login
```

Then clone and package Windbar:

```bash
git clone https://github.com/mikanight/windbar.git
cd windbar

gnome-extensions pack -f -o /tmp \
  --extra-source=cli.js \
  --extra-source=parser.js \
  --extra-source=windscribe.svg \
  .

gnome-extensions install --force /tmp/windbar@mikanight.shell-extension.zip
gnome-extensions enable windbar@mikanight
```

If GNOME does not discover the extension immediately on Wayland, log out and
back in once. The `schemas/` directory is compiled automatically during
installation.

## Configuration

Open the preferences window with:

```bash
gnome-extensions prefs windbar@mikanight
```

Available settings:

- default connection protocol;
- status refresh interval from 5 to 3600 seconds.

## Notes

When the Windscribe GUI client is running, `windscribe-cli locations` may hand
the request to the GUI and return no location list. In that case, close the GUI
client or use the CLI-only setup.

IP rotation and IP pinning require an active connection and a Windscribe plan
that supports those operations.

## Development

Run the parser self-test and a live CLI smoke test from the repository root:

```bash
./test.sh
```

The live test requires an installed, authenticated `windscribe-cli`.

## Contributing

Issues and pull requests are very welcome. Bug reports, compatibility fixes,
UI improvements and support for additional GNOME Shell versions are especially
useful.

For bug reports, include the GNOME Shell version, `windscribe-cli` version and
relevant logs. Do not include account credentials, tokens or private network
information.
