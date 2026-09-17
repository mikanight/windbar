# Windbar

GNOME Shell extension for controlling Windscribe through `windscribe-cli`.

## Current status

Implemented features:

- panel indicator with connected/disconnected state;
- current status: location, protocol and IP;
- connect to the best location / disconnect;
- locations tree grouped by region;
- favorites;
- firewall on/off switch;
- protocol selection (Auto, WireGuard, UDP, TCP, Stealth, WStunnel);
- change IP (rotate) and pin current IP;
- clear "not installed" and "not logged in" states, copy login command to clipboard;
- preferences: refresh interval and default protocol;
- manual refresh and polling;
- serialized asynchronous CLI calls with retry on "already running".

Not implemented yet:

- in-extension login;
- location search;
- static IP / Pro features;
- full Windscribe settings (split tunneling, etc.).

## Requirements

- GNOME Shell 50;
- Windscribe CLI installed as `windscribe-cli`;
- completed `windscribe-cli login`.

## Installation

From source:

```bash
cd /home/mikanight/Документы/apps/windbar
gnome-extensions pack -f -o /tmp \
  --extra-source=cli.js \
  --extra-source=parser.js \
  .
gnome-extensions install --force /tmp/windbar@mikanight.shell-extension.zip
gnome-extensions enable windbar@mikanight
```

On Wayland, log out and back in after installing if GNOME does not discover the extension immediately.

The `schemas/` directory is bundled and compiled automatically on install.

> Note: if the Windscribe GUI desktop app is running, `windscribe-cli locations`
> opens the list in the app window and returns empty output, so the locations
> tree will show "Нет данных". Use the CLI-only build for a headless setup.

## Preferences

`gnome-extensions prefs windbar@mikanight` opens:

- default protocol (Auto, WireGuard, OpenVPN UDP/TCP, Stealth, WStunnel);
- refresh interval in seconds (5–3600).

## Development check

```bash
./test.sh                      # parser self-test + live CLI smoke test
gnome-extensions pack -f -o /tmp \
  --extra-source=cli.js \
  --extra-source=parser.js \
  .
```
