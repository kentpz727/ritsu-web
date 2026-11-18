# Ritsu Web

Ritsu Web is a local-first score tracker for rhythm games. It is the web port of the Android
Ritsu app: import gameplay screenshots, read their fields with OCR, and keep the resulting scores
in the browser. There is no backend, no account, and no network sync.

- **Local data.** Every score, game config, and logo lives in IndexedDB.
- **Screenshot import.** OCR reads the boxes a game config defines and saves a score when the
  required fields are readable.
- **Backups.** JSON exports include game configs so a backup restores on a fresh browser profile.
- **Manual fallback.** Every score can be entered or edited without OCR.

Documentation:

| Document                           | Contents                                                   |
| ---------------------------------- | ---------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module map, data flow, routing, OCR pipeline, design rules |
| [DATA_FORMAT.md](DATA_FORMAT.md)   | IndexedDB schema, JSON/CSV backup format, config JSON      |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch/commit rules, required checks, how to extend        |
| [CHANGELOG.md](CHANGELOG.md)       | Release history                                            |

## Requirements

- **Node.js 24** and **npm 11** (the versions CI uses).
- A browser with IndexedDB, Web Workers, Canvas, and ES2022 module support. Current Chrome, Edge,
  Firefox, and Safari work; Chromium is the best-tested.
- Network access on the first OCR run so Tesseract.js can download its language models. Afterwards
  the app works offline. If the Japanese/Chinese models cannot be fetched, text OCR degrades to
  English only.

## Setup

```bash
git clone <repository-url>
cd ritsu-web
npm ci
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). The first build does not need OCR
models; those are fetched only when a screenshot is read.

> **Prototype note:** this repository still tracks a small vendored subset of `node_modules` from
> the original prototype. `npm ci` replaces that directory, so `git status` can show those tracked
> files as modified or deleted. Never commit changes under `node_modules`; whether to untrack it is
> an open repository-hygiene decision.

## Scripts

| Command                     | What it does                                                                |
| --------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`               | Start the Vite dev server with hot reload                                   |
| `npm run build`             | Type-check, then build the production bundle into `dist/`                   |
| `npm run preview`           | Serve an existing `dist/` build locally                                     |
| `npm run typecheck`         | `tsc --noEmit` over `src`, `tests`, and the Vite configs                    |
| `npm test`                  | Run the Vitest suite once                                                   |
| `npm run test:watch`        | Run Vitest in watch mode                                                    |
| `npm run test:coverage`     | Run the suite with V8 coverage (fails under 60% lines)                      |
| `npm run lint`              | ESLint 10 flat config                                                       |
| `npm run format`            | Prettier write                                                              |
| `npm run format:check`      | Prettier check (used by CI)                                                 |
| `npm run check:cycles`      | Fail on circular imports (madge)                                            |
| `npm run check:duplication` | Fail at more than 1% duplicated lines (jscpd)                               |
| `npm run check:bundle`      | Enforce the entry-chunk budget and keep OCR assets lazy (run after `build`) |

## Verify before you push

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage
npm run build
npm run check:bundle
npm run check:cycles
npm run check:duplication
```

CI runs the same checks as separate jobs. The dependency-audit job is blocking for high and
critical advisories (`npm audit --audit-level=high`). See [CONTRIBUTING.md](CONTRIBUTING.md) for
the full policy.

## Routes

The app uses hash routing, so a static host needs no rewrite rules.

| Route                                | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `#/`                                 | Score library, filters, pagination, manual entry           |
| `#/data`                             | Backup/restore, JSON and CSV export, data repair/debugging |
| `#/game/:configId`                   | One game's local rankings and charts                       |
| `#/chart/:configId/:song/:diff/:val` | One chart's local rankings and score history               |
| `#/configs`                          | Game configs: import, edit, delete/restore, logos          |
| `#/editor/:configId?`                | Screenshot box editor                                      |
| `#/import`                           | Bulk screenshot OCR import                                 |
| `#/debug`                            | OCR bench, raw data inspection, clear/export tools         |

Every route is lazy-loaded. Only the score library ships in the entry chunk; OCR, charts, and the
editor load when opened.

## How scores are read

1. Pick a game config. Its JSON declares fixed screenshot boxes for title, score, difficulty,
   rank, combo, and accuracy, plus optional game-specific fields.
2. The OCR pipeline crops each box, preprocesses it, and reads it with Tesseract.js (or the
   optional PaddleOCR engine).
3. Numeric and title text is normalized, then fuzzy-matched against values already in the library.
4. If every required box is readable the score saves automatically; otherwise it is staged for
   review and correction before saving.

OCR workers are created lazily per language and released when the tab is hidden or closed. The
full pipeline is described in [ARCHITECTURE.md](ARCHITECTURE.md#ocr-pipeline) and the box
semantics in [DATA_FORMAT.md](DATA_FORMAT.md#ocr-box-semantics).

## Data and privacy

All data stays in the browser's IndexedDB database `RitsuDatabase`. Clearing site data deletes the
library, so export a JSON backup from **Data and backups** before clearing storage or changing
browsers. The JSON envelope contains both scores and their game configs; see
[DATA_FORMAT.md](DATA_FORMAT.md#json-backup-format).

No analytics, telemetry, or remote API is used. The only network requests are for OCR model and
wasm assets when OCR runs.

## Accessibility

The editor is fully keyboard-operable: arrow keys move the selected box, Ctrl/Cmd + arrow keys
resize it, and Shift makes both use 5% steps. File pickers are real buttons, all controls have
visible focus, errors are announced through a live region, and a skip link targets the main
content.

## Licence

**Pending.** No licence file is present yet; do not assume a licence until the project owner adds
one. This is the remaining open part of the documentation/release item.
