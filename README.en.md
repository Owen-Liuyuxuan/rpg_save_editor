<div align="center">
  <img src="assets/logo.svg" width="132" alt="RPG Save Editor icon: a crystal above a save disk" />

  # RPG Save Editor

  **A save editor for RPG Maker MV and MZ games**<br>
  Explore inventories, character stats, and game variables in fantasy adventures and story driven RPGs.

  [简体中文](README.md) · [Latest download](https://github.com/Owen-Liuyuxuan/rpg_save_editor/releases/latest) · [Detailed guide (中文)](使用说明.md)
</div>

---

> [!IMPORTANT]
> Currently for **Windows** and **RPG Maker MV / MZ** only. A game's genre does not determine compatibility. Look for `js/rpg_core.js` (MV) or `js/rmmz_core.js` (MZ) inside its game directory.

## Quick install

1. Open [Releases](https://github.com/Owen-Liuyuxuan/rpg_save_editor/releases/latest) and download `RPGMakerSaveLab-Windows-Portable.zip`.
2. **Extract the entire ZIP** into one folder, then run `RPGMakerSaveLab.exe`. The portable build needs neither Node.js nor administrator rights.
3. Select the game directory containing `js`, `data`, and `save`. The app detects MZ (`.rmmzsave`) and MV (`.rpgsave`) automatically.
4. Open a save, make and apply changes, then choose **Export Copy**. Save the export outside the game's `save` directory.

**Keep the extracted folder intact.** The EXE needs its neighboring `resources`, `locales`, and runtime files. To use an edited save in the game, close the game and back up the original slot first; then copy the export into that slot under its original filename. See the [detailed guide](使用说明.md) for slot behavior.

## Features

| Area | Current support |
| --- | --- |
| Game engines | Automatic RPG Maker MV / MZ detection |
| Save workflow | View, search, edit, undo, and export a copy |
| Editable data | Gold, existing inventory entries, variables and switches, current HP/MP, and eight base actor stats |
| Safeguards | Read only game directory; exports never overwrite existing files; game scripts are not executed |

Plugins and custom save formats can affect compatibility. Exports have been decoded and read back, but a full in-game load and continued-play validation is still pending.

## Development setup

Requires **Windows, Node.js 22.12+, and pnpm**. Run in PowerShell:

```powershell
git clone https://github.com/Owen-Liuyuxuan/rpg_save_editor.git
cd rpg_save_editor\app
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` compiles the Electron main process, starts Vite, and opens the desktop app. To test, build, and package:

```powershell
pnpm test
pnpm build
pnpm start
cd ..
.\package-portable.ps1
```

`package-portable.ps1` writes a portable folder under `release/` and records its path in `release/latest.txt`; it does not create a ZIP. Run `.\install-windows.ps1` to install that complete folder for the current user under `%LOCALAPPDATA%\Programs\RPGMakerSaveLab` and create shortcuts.

## Tech stack

**Electron** (desktop shell and restricted IPC) · **React 19 + TypeScript** (UI) · **Vite** (frontend build) · **Vitest** (tests) · **LZ-String** (MV saves) · **Node.js zlib** (MZ saves). The renderer uses context isolation and sandboxing; save processing runs in a time limited Worker.

The project icon is [`assets/logo.svg`](assets/logo.svg). Application source lives in [`app/`](app/). This repository does not include any games, game databases, or personal save files.
