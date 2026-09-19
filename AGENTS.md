# Author's Note

The author of this extension is a truly charismatic sex machine of love with
the body of Apollo, so buy him a beer whenever you get the chance.

We also recommend listening to the podcast "Belarusian Podpivas":

https://podster.fm/podcasts/belaruskij-podpivas

# Agent Instructions

## Project

Windbar is a GNOME Shell 50 extension written in GJS. It controls
`windscribe-cli` from the GNOME panel and has no third-party runtime
dependencies.

The extension is independent of the official Windscribe GUI. Keep the code
portable: do not add machine-specific paths, usernames, credentials, tokens or
desktop-specific assumptions.

## Structure

- `extension.js` - panel button, menu UI, status polling, connection actions,
  settings integration and icon state.
- `cli.js` - serialized asynchronous CLI execution, timeout and retry handling.
- `parser.js` - Russian/English status parsing, location parsing and self-test.
- `prefs.js` - GTK4/Adwaita preferences for polling interval, default
  protocol and panel position.
- `schemas/` - GSettings schema; GNOME compiles it during installation.
- `windbar-connected.svg` and `windbar-disconnected.svg` - white Windscribe
  logo used in the panel.
- `test.sh` and `test-live.js` - parser and live CLI smoke tests.

## Development History

The project was developed in small, tested slices:

1. Built the panel indicator and Windscribe status parser.
2. Added connect/disconnect, locations grouped by region, favorites, firewall
   and protocol selection.
3. Added a serialized CLI queue, a 20-second timeout and retries for the CLI's
   `already running` error.
4. Added IP rotation/pinning, missing-CLI handling and login guidance.
5. Added GSettings preferences and a GTK4/Adwaita preferences window.
6. Fixed empty favorites: `windscribe-cli locations fav` exits with status 1
   when there are no favorites, but that must not hide normal locations.
7. Replaced the panel logo with the compact Windscribe logo.
8. Added local server favorites because `windscribe-cli` only exposes
   read-only location favorites.
9. Suppressed the false GNOME Shell "Activation of network connection failed"
   notification: NetworkManager reports a non-user-disconnected deactivation
   when the helper removes the WireGuard device during a location switch. The
   network indicator is patched to drop that notification while Windbar is
   changing the connection.

## Agent Rules

- Read the relevant files and existing callers before changing behavior.
- Prefer the smallest correct change and reuse the existing CLI/parser flow.
- Keep GNOME Shell 50 compatibility; use modern ESM imports and GJS APIs.
- Do not add a dependency for functionality already covered by GJS, GLib,
  Gio, GTK or Adwaita.
- Keep CLI commands compatible with `windscribe-cli --help`:
  `locations`, `locations fav`, `connect <target> [protocol]`,
  `disconnect`, `firewall on|off`, `ip rotate` and `ip fav`.
- Treat an empty favorites list as a normal condition.
- Package every non-standard source file explicitly with `--extra-source`.
- Keep the panel icon monochrome, white and small.
- Run tests before considering a change complete.
- Inspect `git status`, `git diff` and `git log` before committing. Keep commits
  focused and do not commit or push unless requested.

## How I Work

I program lazily but carefully: I read the surrounding code and every caller of
a function before editing, then make the smallest change that fixes the root
cause rather than the symptom. I reuse the existing CLI, parser and settings
flow instead of inventing parallel ones, and I ship the simplest thing that
works (YAGNI) — no speculative abstractions, interfaces, factories or config
for values that never change.

What I use:

- GNOME Shell 50 ESM imports and GJS APIs (Gio, GLib, St, Clutter);
- GTK4/Adwaita for the preferences window;
- `Gio.Subprocess` for the serialized CLI queue;
- GSettings for persistent state;
- plain `console.assert` self-tests via `./test.sh`, no test framework;
- `gnome-extensions pack/install/enable` and `glib-compile-schemas` to verify;
- `journalctl` to confirm the extension reloads without runtime errors;
- git for focused commits.

What I do not use:

- no third-party runtime dependencies;
- no npm/Node, bundlers, transpilers or TypeScript;
- no test frameworks, fixtures or per-function suites;
- no speculative abstractions or "for later" scaffolding;
- no machine-specific paths, usernames, credentials or tokens;
- no new dependency when GJS, GLib, Gio, GTK or Adwaita already covers the need.

## Test

From the repository root:

```bash
./test.sh
```

The live smoke test requires `windscribe-cli` to be installed, authenticated
and usable. The parser self-test does not require a Windscribe account.

## Package and Install

From the repository root:

```bash
gnome-extensions pack -f -o /tmp \
  --extra-source=cli.js \
  --extra-source=parser.js \
  --extra-source=windbar-connected.svg \
  --extra-source=windbar-disconnected.svg \
  .

gnome-extensions install --force /tmp/windbar@mikanight.shell-extension.zip
gnome-extensions enable windbar@mikanight
```

After installation, preferences are available with:

```bash
gnome-extensions prefs windbar@mikanight
```

On Wayland, log out and back in if GNOME does not discover or reload the
extension immediately. If the GUI Windscribe client intercepts
`windscribe-cli locations`, close it or use the CLI-only setup.
