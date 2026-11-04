# Scripts

[![CI](https://github.com/eliasjnior/orca-script-runner/actions/workflows/ci.yml/badge.svg)](https://github.com/eliasjnior/orca-script-runner/actions/workflows/ci.yml)

<img src="docs/screenshot.png" width="380" alt="The Scripts panel in Orca's right sidebar, listing the setup, test and check scripts of orca.yaml, each with a Run button.">

Runs the scripts in a worktree's `orca.yaml` on demand. Orca runs `scripts.setup` when it creates a
worktree and `scripts.archive` before removing one; this panel lets you run either again, or any
other entry you put under `scripts:`, whenever you want.

```yaml
# orca.yaml
scripts:
  setup: |
    pnpm install
  archive: echo bye
  reset-db: pnpm db:reset # any other name shows up too
```

## Install

Needs Orca 1.4.246 or newer with plugins turned on (Settings → Plugins → **Turn on plugins**).

[Open Scripts in Orca](https://onorca.dev/plugins/eliasjnior.script-runner?catalog=community), or run on
macOS (`xdg-open` on Linux):

```sh
open "orca://plugins/eliasjnior.script-runner?catalog=community"
```

Both open the plugin's page in Orca, where you press **Install**. The plugin comes from Orca's
community catalog, which Orca asks to add the first time. It runs a Node worker, so Orca also needs
**full-access plugins** allowed in Settings → Plugins, and shows what the plugin can access before
it starts. Its listing in [Orca's plugin directory](https://onorca.dev/plugins/eliasjnior/orca-script-runner)
says which version is offered.

Plugins installed this way update by themselves while **Update plugins automatically** is on
(Orca's default). Orca asks again only when a version needs more access than you approved.

### Or run it from a clone

```sh
git clone https://github.com/eliasjnior/orca-script-runner.git
orca plugin dev load orca-script-runner
```

The first run prints what the plugin can access and the same command with
`--approve <fingerprint>`; run that to turn it on. A development folder shows as
`Dev · unverified`, reloads when its files change and updates with `git pull`. It needs no build
step.

## How it works

- **Scripts** panel in the right sidebar: one card per script with a **Run** button. It follows the
  focused worktree and re-reads `orca.yaml` on every focus change; the refresh button re-reads it
  on demand.
- **setup** and **archive** are Orca's own lifecycle scripts and can reinstall or remove things, so
  their Run asks first: the card shows what the script is for, with **Run setup** (or **Run
  archive**) and **Cancel**. Orca's panels have no dialogs, so the question opens in the card.
  Every other script runs on the first press.
- Orca closes a panel when another sidebar tab opens. The last list of each worktree is kept, so
  coming back shows it at once while the worker re-reads `orca.yaml`.
- It reads the worktree's own `orca.yaml`, or the primary checkout's when the worktree has none.
  Invalid YAML or duplicate keys show an error, as Orca would ignore that file.
- **Run** opens a new terminal tab named after the script in that worktree, switches to it, and
  runs it the way Orca runs `setup`: Bash with `set -e`, from the worktree folder, with
  `ORCA_ROOT_PATH`, `ORCA_WORKTREE_PATH` and `ORCA_WORKSPACE_NAME` set. The command is read from
  disk again at that moment.

- The tab is opened through Orca's own `orca` CLI (found beside the running Orca app, on `PATH`,
  or in `/Applications`). Orca 1.4.247's plugin API starts terminals in the background with no tab
  at all, so its output could not be seen; that API is used only when the CLI is missing, and the
  panel then says the script is running without a tab.

## Access

- Runs a Node worker (`src/worker.ts`): reading `orca.yaml` needs the file system.
- `workspace:read`: find the focused worktree and its path.
- `terminal:send`: start the script in the background when the `orca` CLI is missing.
- The worker also runs the `orca` CLI (`orca terminal create`) to open the visible tab.

## Limits

- macOS and Linux only (scripts run with Bash).
- Workspaces on another host (SSH) are not supported: the worker reads files on this machine.
- Orca's plugin API names the focused workspace by display name and branch only; the worker matches
  that against the workspace list. Two workspaces with the same name and branch cannot be told
  apart, and the panel says so instead of guessing.

## Development

Needs Node 24, pnpm and the Orca desktop app (its `orca` CLI on `PATH`). The plugin loads as
written (TypeScript, no build step); the only generated file is the `yaml` package bundled into `vendor/yaml.mjs`, built by
`pnpm vendor`.

```sh
pnpm install
pnpm types   # writes Orca's typings into .orca/types (git-ignored)
```

`pnpm types` runs `orca plugin types` and, if that fails (Orca 1.4.247 ships without the typings
file it reads), downloads the same typings from the Orca repository at the installed version's tag.
Opening this repository as an Orca worktree runs both steps through `orca.yaml`.

```sh
orca plugin dev watch . --check                     # load, reload on save, stream logs
orca plugin open local.script-runner --panel scripts   # show it in the right sidebar
```

| Command          | Runs                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `pnpm typecheck` | `tsc` (Orca transpiles without type-checking)                     |
| `pnpm test`      | `orca plugin test .`                                              |
| `pnpm check`     | `orca plugin check .`: validates the plugin and renders its panel |
| `pnpm validate`  | `orca plugin validate .`                                          |
| `pnpm lint`      | Biome; `pnpm format` applies its fixes                            |
| `pnpm binaries`  | Fails on tracked binary files, which Orca's directory refuses     |
| `pnpm vendor`    | Rebuilds the `vendor/*.mjs` bundle after upgrading yaml           |

CI runs Biome, the binary check, the typecheck and a check that `vendor/` matches the lockfile on
every pull request. `pnpm test` and `pnpm check` need the Orca app, so run them before opening the
pull request.

## Releasing

The repository root is the plugin, so Orca installs every tracked file in it. Orca's plugin
directory lists the newest `vX.Y.Z` tag, pinned to its commit and file hash, and a listed version
never changes. `main` only takes pull requests, squash-merged.

1. Raise `version` in `orca-plugin.json`, open a pull request and merge it.
2. Tag the merged `main` commit with that version and push the tag:

   ```sh
   git switch main && git pull
   git tag -a v1.2.0 -m v1.2.0 && git push origin v1.2.0
   ```

The directory checks tags about every 30 minutes. A new version can wait for a maintainer's review
before it is listed; [the plugin's status page](https://onorca.dev/plugins/eliasjnior/orca-script-runner)
says whether it is listed or what to fix. Release tags cannot be moved or deleted.

The directory refuses a tag that holds any binary file except PNG, JPEG, WEBP and GIF images
(fonts included), which `orca plugin validate` does not catch and `pnpm binaries` does.

### Screenshots and catalog art

`docs/screenshot.png` is the panel as Orca draws it, for this README. Retake it after a visible
change, with content in English, and crop the empty space under the content:

```sh
orca plugin shot local.script-runner --panel scripts --width 380 --out docs/screenshot.png
```

The directory shows `assets/icon.png` (256×256), `assets/cover.png` (1600×1000) and
`assets/screenshot-1.png` (1280×800), listed in `orca-plugin.json`. They are drawn from
`art/icon.html`, `art/cover.html` and `art/screenshot.html`, which embed `docs/screenshot.png` and
load Geist from `node_modules` (run `pnpm install` first): open one in a browser at that size and
save it as PNG. Orca accepts PNG or WEBP icons up to 256 KB, covers up to 1 MB and screenshots up
to 1.5 MB.

Cards show the whole 16:10 cover, but the plugin's page caps it at 256 px tall and crops the
middle, which on a wide window leaves only about y 380 to 620 of the 1000 px. Keep the name,
tagline and anything else that must be read inside that band.

## History

This plugin was developed in [eliasjnior/orca-plugins](https://github.com/eliasjnior/orca-plugins)
up to version 1.1.2; this repository keeps its history, and pull request numbers in older commit
messages refer to that repository.

## License

[MIT](LICENSE). The bundled [yaml](https://eemeli.org/yaml/) (ISC) build keeps its notices in `vendor/`.

Security issues: see [SECURITY.md](SECURITY.md).
