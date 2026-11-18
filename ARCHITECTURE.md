# Architecture

Ritsu Web is a single-page React application that runs entirely in the browser. It keeps its
data in IndexedDB and performs OCR in Web Workers. No server component exists, so the whole app
can be hosted as static files.

## Stack

| Concern      | Choice                                                    |
| ------------ | --------------------------------------------------------- |
| UI           | React 19 + TypeScript 6                                   |
| Routing      | react-router 7 with `HashRouter`                          |
| Build        | Vite 8 + `@vitejs/plugin-react`                           |
| Persistence  | Dexie 4 over IndexedDB                                    |
| Config trust | zod 4 runtime validation                                  |
| OCR          | Tesseract.js 7 by default; optional PaddleOCR             |
| Tests        | Vitest 5, fake-indexeddb, V8 coverage                     |
| Quality      | ESLint 10, Prettier 3, madge, jscpd, bundle-budget script |

The app targets ES2022. CI uses Node 24.

## Directory map

```text
src/
  main.tsx                 React root
  app.tsx                  Route table; every page is lazy-loaded
  index.css                Global styles and design tokens
  components/              Reusable UI (flat, no feature folders)
    Layout.tsx             Skip link, top bar, bottom nav, Suspense + route boundary
    ErrorBoundary.tsx      Route-level error boundary
    Toast.tsx / toast.ts   Live-region notifications
    scores.tsx             Score list/card components
    detail.tsx             Detail tables and bar chart
    ManualEntry.tsx        Manual score creation
    EditScore.tsx          Score edit dialog
    ScoreFormFields.tsx    Shared dynamic form fields (manual entry + edit)
    useScoreForm.ts        Dynamic form state and validation
    useBoxEditor.ts        Box editor state machine
    BoxCanvas.tsx          Canvas overlay + pointer interaction
    FieldPanel.tsx         Field/slot editing panel
    FileButton.tsx         Keyboard-accessible file picker button
    gameIcon.tsx           Logo blob rendering from the shared snapshot
    debug.tsx              Debug page helpers
  lib/
    calc/                  Scoring, dates, ranking math
    config/                Config model, zod schema, geometry, keyboard rules
    db/                    Dexie schema/repositories + shared snapshot cache
    ocr/                   Workers, crop/preprocess, normalization, fuzzy match, bench
    numbers.ts             Finite-number coercion helpers
    debounce.ts            Debounced callback helper (config writes)
    pagination.ts          50-row paging helpers
    format.ts              Shared display formatters
    errors.ts              Normalized errors + logger
    pasteBus.ts            Clipboard-image event bus
  pages/                   One component per route
scripts/check-bundle.mjs   Entry-chunk budget + lazy-OCR guard
tests/                     Unit, DB, config, and golden characterization tests
```

The maintenance phase intentionally kept new modules flat under `src/components/` and
`src/lib/`; there are no feature subfolders.

## Startup and routing

`src/main.tsx` mounts `<App />`. `src/app.tsx` wraps the route table in `ToastProvider` and
`HashRouter`, and imports each page with `React.lazy`. `Layout` renders the chrome around an
`<Outlet />` inside a route-keyed `RouteErrorBoundary` and a `Suspense` fallback.

Hash routing means a static host needs no SPA rewrite. Each route is its own chunk, so the entry
bundle contains only the shell and the score library. The OCR engines, the chart code, and the
box editor are fetched on demand. `scripts/check-bundle.mjs` fails the build if the entry chunk
grows past its budget or references a lazy OCR marker (`worker-entry`, `ort-wasm`, `paddle-`,
`tesseract`).

| Route                               | Page               |
| ----------------------------------- | ------------------ |
| `/`                                 | `ScoresPage`       |
| `/data`                             | `DataPage`         |
| `/game/:configId`                   | `GameDetailsPage`  |
| `/chart/:configId/:song/:diff/:val` | `ChartDetailsPage` |
| `/configs`                          | `ConfigsPage`      |
| `/editor/:configId?`                | `BoxEditorPage`    |
| `/import`                           | `ImportPage`       |
| `/debug`                            | `DebugPage`        |

## Data layer

`src/lib/db/dexie.ts` owns the only Dexie instance (`RitsuDatabase`) and all repository
functions. Components never issue table queries directly for score data.

- `readScoreSnapshot()` performs one read transaction over configs, scores, and details, and
  returns scores already joined with their details and game name.
- `src/lib/db/scoreCache.ts` wraps that read in a session-wide Dexie `liveQuery` and exposes it
  through `useSyncExternalStore`. Every mounted consumer shares one snapshot; a route change is a
  cache hit, and any write re-runs the transaction once.
- Writes go through `saveFullScore`, `updateFullScore`, `deleteScore`, `upsertConfig`,
  `softDeleteConfig`, `restoreConfig`, and `setGameIcon`. Multi-table writes use Dexie
  transactions.
- `saveFullScore` deduplicates on the composite index
  `[configId+songTitle+difficultyName+difficultyVal]` plus exact `playTimestamp`.
- Config deletion is a persistent soft delete: the row stays, its scores move to the sentinel
  `configId = 0`, and the deleted ids are stored on the config for undo. Re-importing or
  re-creating the config under the same name relinks the scores.
- The score list is paginated in 50-row pages (`src/lib/pagination.ts`). There is no virtual
  list; bounded pages keep the DOM small.

The schema, indexes, export format, and delete semantics are specified in
[DATA_FORMAT.md](DATA_FORMAT.md).

## Config subsystem

`src/lib/config/model.ts` holds the plain data shapes. `schema.ts` validates unknown JSON with
zod and normalizes values; it returns either a normalized config or dotted-path errors. `types.ts`
is the public barrel plus presentation helpers (visible fields, misc Yes/No display, slot
defaults). Keeping `model.ts` separate prevents a `types ↔ schema` import cycle.

Configs enter the app through `ConfigsPage` import/draft or the box editor. Structural errors
reject the config with field paths; out-of-range geometry, weights, and thresholds are clamped and
reported as warnings. Invalid configs already in the database are skipped when the shared
snapshot builds its `configMap`, so one bad row cannot break every screen.

## OCR pipeline

`src/lib/ocr/bench.ts` orchestrates a read; `client.ts` owns Tesseract workers; `paddle.ts` is the
optional alternate engine; `image.ts` contains the pure image helpers; `fuzzy.ts` matches text
against known values.

```text
screenshot
  -> loadImage (HTMLImageElement)
  -> for each configured box: cropToCanvas(rect, pad)
  -> preprocess (grayscale, upscale, contrast stretch)
  -> Tesseract worker (eng for numbers; eng+jpn+chi_sim for text) [or PaddleOCR]
  -> normalize (title/score/level/rank) + boolean color match
  -> fuzzy match against library candidates (threshold 0.6)
  -> BenchResult: fields, missing[], details[], generic score fields
```

Important semantics:

- **Workers.** Tesseract workers are cached per language for the tab lifetime because model
  downloads are expensive. The cache is created lazily and released on `pagehide` via
  `src/lib/ocr/lifecycle.ts`. Only the English worker is created for numeric boxes.
- **Engine split.** Numbers use English only; text uses English + Japanese + Simplified Chinese
  in parallel and picks the longest line / majority script. The Paddle engine is opt-in.
- **Booleans.** A boolean field is detected by color matching its box against the Android ARGB
  `targetColor` (Euclidean RGB distance under `threshold`, at least 10% of pixels). No target
  color means the field is skipped, not guessed.
- **Fallbacks.** Without a combo box, combo is the sum of non-miss judgments. Without an accuracy
  box, accuracy is weighted by each judgment's `weight`. Without a title box, the filename is
  used. A title/score/level/rank box that reads nothing is recorded in `missing`, which stages
  the score for review instead of auto-saving.
- **Normalization.** Titles drop symbols and minority-script letters; scores keep digits and drop
  leading zeros; levels keep the first integer; ranks keep letters and uppercase them. See
  [DATA_FORMAT.md](DATA_FORMAT.md#ocr-box-semantics) for exact examples.
- **Fuzzy matching.** Raw reads are compared to known titles/difficulties/ranks from the same
  game (plus a generic rank list). A match at or above 0.6 replaces the raw text and is marked
  `guessedFrom` in the bench output.

OCR never runs on the main thread for recognition: Tesseract's worker and the Paddle runtime do
the heavy work. Canvas crop/preprocess is small and bounded by the configured box size.

## UI and error handling

- **Forms.** `useScoreForm` owns dynamic field state; `ScoreFormFields` renders it. Manual entry
  and the edit dialog share the same fields so validation and boolean rendering cannot drift.
- **Box editor.** `BoxEditorPage` is a thin composition of `useBoxEditor` (state/commands),
  `BoxCanvas` (pointer drawing and overlay), and `FieldPanel` (field/slot list and geometry).
  Pointer drag and keyboard produce the same draft rect and share the Save-rect path. Arrow keys
  move, Ctrl/Cmd + arrows resize, Shift applies 5% steps.
- **Errors.** A route-keyed `RouteErrorBoundary` catches render failures without taking down the
  chrome. `logError` records the route and component stack. User-facing failures go through the
  toast live region; there are no `alert()` calls.
- **Config writes.** Editor forms debounce config persistence by 300 ms and coalesce painting into
  one pending `requestAnimationFrame`; unmount flushes pending edits.

## Testing architecture

- `tests/unit/` covers pure helpers: scoring, dates, format, numbers, config geometry/keyboard,
  pagination, fuzzy matching, image normalization, OCR lifecycle, debounce, errors, labels.
- `tests/db/` covers backups, duplicates, and soft delete against `fake-indexeddb`.
- `tests/config/` covers zod validation and normalization.
- `tests/golden/` is a characterization harness. It pins scoring/config/date/number/DB behavior
  against `golden.json`, so refactors that change observable behavior fail even without a
  dedicated assertion.
- Coverage is collected for `src/lib/**/*.ts` with a 60% line floor; the suite currently sits in
  the high 80s.

React components and the live OCR engines are covered by smoke checks rather than unit tests,
because jsdom is not installed and the engines need a real browser. The maintenance validation
log records which checks were automated and which stayed manual.

## Deliberate constraints

- **No backend.** Sync, accounts, and shared rankings are out of scope.
- **No gameplay timing.** The app tracks scores; it does not schedule input or audio. No
  `setTimeout`/`setInterval` is used for gameplay or frame logic. The only timers are UI concerns
  (toast auto-dismiss, URL revocation) and the config-write debounce.
- **No virtualization dependency.** Pagination keeps lists bounded without adding a library.
- **Bundle floor.** The entry budget is 262 KiB raw / 83 KiB gzip. React 19 + ReactDOM 19 +
  react-router 7 put the floor near 260/82, so the assessment's 250/80 target is recorded as
  unmet rather than silently changed.
- **Flat modules.** New components and helpers stay directly under `src/components/` and
  `src/lib/`; the folder structure is intentionally unchanged.

## Where to change what

| Change                            | Files                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| Add or rename a route             | `src/app.tsx`, `src/components/Layout.tsx`                          |
| Change scoring/ranking math       | `src/lib/calc/scoring.ts` + golden/unit tests                       |
| Change config parsing or defaults | `src/lib/config/schema.ts`, `model.ts`, `types.ts`                  |
| Change the DB schema or backup    | `src/lib/db/dexie.ts`, `tests/db/*`, `DATA_FORMAT.md`               |
| Change OCR normalization/matching | `src/lib/ocr/image.ts`, `fuzzy.ts`, `bench.ts`                      |
| Change the box editor             | `src/components/useBoxEditor.ts`, `BoxCanvas.tsx`, `FieldPanel.tsx` |
| Change list paging                | `src/lib/pagination.ts`, `src/pages/ScoresPage.tsx`                 |
| Change bundle policy              | `scripts/check-bundle.mjs`, `.github/workflows/ci.yml`              |
