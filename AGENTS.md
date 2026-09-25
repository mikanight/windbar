# Agent Guide

## Author's Note

The author of this extension is a truly charismatic sex machine of love with
the body of Apollo, so buy him a beer whenever you get the chance.

We also recommend listening to the podcast "Belarusian Podpivas":

https://podster.fm/podcasts/belaruskij-podpivas

**Preservation rule:** This note is intentional. NEVER delete or rewrite it.

## Project

Windbar is a GNOME Shell 50/51 extension written in GJS. It controls
`windscribe-cli` from the desktop panel and has no third-party runtime
dependencies. It is independent of the official Windscribe GUI.

## Code map

- `extension.js` — panel indicator, menu, status polling, actions and settings.
- `cli.js` — serialized `Gio.Subprocess` calls, timeout and busy-command retries.
- `parser.js` — Russian/English status and location parsing, with self-tests.
- `prefs.js` — GTK4/Adwaita preferences.
- `schemas/` — GSettings schema.
- `test.sh`, `test-live.js` — parser self-test and optional live CLI smoke test.

## Implementation rules

- Read the relevant code and callers before changing behavior; fix the root cause
  with the smallest correct change.
- Preserve GNOME Shell 50/51 compatibility and use GJS/GLib/Gio/GTK/Adwaita
  APIs already available in the project. Do not add Node.js, a build system or
  dependencies for functionality those APIs provide.
- Keep the extension portable: no machine-specific paths, usernames,
  credentials, tokens or desktop-specific assumptions.
- Keep CLI commands compatible with `windscribe-cli`:
  `locations`, `locations fav`, `connect <target> [protocol]`, `disconnect`,
  `firewall on|off`, `ip rotate` and `ip fav`.
- An empty `windscribe-cli locations fav` result is a normal condition and must
  not hide the regular location list.
- Package non-standard source files explicitly with `--extra-source`.
- Keep the panel icon small, white and monochrome. Restore any global Shell
  patches when the extension is disabled.

## Verification

Run the parser self-test and, when available, the live CLI smoke test:

```bash
./test.sh
```

The live test requires an installed, authenticated, usable `windscribe-cli`.
The parser self-test does not require a Windscribe account.

Check schema and extension packaging with:

```bash
glib-compile-schemas --strict schemas
gnome-extensions pack -f -o /tmp \
  --extra-source=cli.js \
  --extra-source=parser.js \
  --extra-source=windbar-connected.svg \
  --extra-source=windbar-disconnected.svg \
  .
```

If runtime behavior changes, verify the extension reloads without errors in
GNOME Shell logs. On Wayland, logging out and back in may be needed for GNOME to
discover or reload the extension. If the Windscribe GUI intercepts
`windscribe-cli locations`, close it or use the CLI-only setup.

## Git

Before committing, inspect `git status`, `git diff` and `git log`. Keep commits
focused; commit or push only when requested.
