# Planfold

Plan your days, weeks, months and years in plain Markdown — from one home page.

Planfold gives Obsidian a ready-to-use planner with two tabs:

- **Home** — where to start today: to-dos, mood, habits, quick capture, pinned and recent notes.
- **Note** — write plans and reviews for a day, week, month or year. Each scale has its own to-do list and an editable template.

Planfold is free.

## Your data stays in Markdown

Everything Planfold writes is ordinary Markdown in your vault:

| What | Where |
|---|---|
| Daily to-dos, mood, habit check-ins, daily fields | Your daily note (mood and habits as properties) |
| Week / month / year to-dos and notes | One note per period, in the Planfold folder (configurable) |
| Habit list | `Goals.md` in the Planfold folder |

Already keep daily notes? Setup finds them — Obsidian's Daily notes, Periodic Notes, or any folder of date-named notes — and keeps your folder, file names and template exactly as they are. Planfold asks before adding anything to a note you already wrote. It makes no network requests and collects no data.

## Privacy and permissions

Planfold runs entirely on your device. It makes no network requests and collects no data.

- **Reads your vault's file list** to show Recent notes, Projects and search on Home.
- **Writes to the clipboard** only when you press *Copy* in the mobile quick capture guide.
- **Device-only lists** (recent notes and activity) are kept with Obsidian's per-vault local storage, so they don't sync between devices.

## Commands

- Open home
- Open today's daily note
- Quick capture to today
- Set up mobile quick capture
- Pin or unpin the current note

## Mobile quick capture

Planfold registers the URL `obsidian://planfold-capture?text=…`. Any shortcut or app that can open a URL can append text to today's note. Run **Set up mobile quick capture** for a step-by-step guide for iOS Shortcuts.

## Appearance

By default Planfold follows your theme. In **Settings → Planfold → Home** you can switch to the *Planfold design*, which also restyles sidebars, tabs and the file list. Setup asks which look you want the first time. Pinned and Recent shortcuts at the top of the file explorer can be turned on in the same place.

## Languages

English and Simplified Chinese (界面支持中文).

## Installation

From Obsidian: **Settings → Community plugins → Browse**, search for “Planfold”.

Manual: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/planfold/`, then enable Planfold under Community plugins.

## Source code

Planfold is free to use but closed source. Its source code is kept in a private repository; Obsidian verifies each release by rebuilding it from that source.

## License

Free to use; closed source; all rights reserved. See [LICENSE](LICENSE).
