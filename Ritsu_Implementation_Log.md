# Ritsu Implementation Log

**Branch:** `Test`  
**Base:** `64c3a235`  
**Code HEAD at validation:** `8addd02e` (Phase 4 documents follow in separate commits)  
**Date:** 2026-11-18  
**Scope:** P-01…P-20 from the approved assessment. R-01…R-09 remain `[TEAM INPUT]` and were not
implemented.

This log records what was reproduced, changed, and proven for each item. Every number below comes
from a command or browser check that was actually run; commit bodies preserve the original
measurements. Status values:

- **DONE** — the change landed and its automated validation target was met.
- **PARTIAL** — the change landed, but an approved numeric or human target was not met.
- **BLOCKED** — no compliant implementation was possible without missing information.
- **AWAITING APPROVAL** — `[TEAM INPUT]` requirement, intentionally not implemented.

## Summary

| ID   | Item                                            | Type       | Status  | Commit(s)              | Validation |
| ---- | ----------------------------------------------- | ---------- | ------- | ---------------------- | ---------- |
| P-01 | Backup omits configs; restore skips scores      | Corrective | DONE    | `89815420`             | V-01       |
| P-02 | One-click config delete orphans scores          | Corrective | DONE    | `b2d66cb8`             | V-02       |
| P-03 | Config JSON accepted without validation         | Corrective | DONE    | `a10302b6`             | V-03       |
| P-04 | No tests or test runner                         | Preventive | DONE    | `41ab48bd`, `878f9122` | V-04       |
| P-05 | Keyboard/AT access missing                      | Corrective | DONE    | `351ff0f4`             | V-05       |
| P-06 | Vulnerable/outdated dependencies                | Adaptive   | PARTIAL | `51c1a7f3`, `8addd02e` | V-06       |
| P-07 | Heavy entry bundle and OCR payload              | Perfective | PARTIAL | `6c95e077`             | V-07       |
| P-08 | Repeated full-table loads                       | Perfective | PARTIAL | `21d0258c`             | V-08       |
| P-09 | Re-imports duplicate score rows                 | Corrective | DONE    | `a1fedf0f`             | V-09       |
| P-10 | 686-line editor page + duplicated form          | Preventive | DONE    | `87c4c15f`             | V-10       |
| P-11 | Circular imports                                | Preventive | DONE    | `924e205f`             | V-11       |
| P-12 | Object URL and worker leaks                     | Corrective | DONE    | `c43c0162`             | V-12       |
| P-13 | `false` misc values hidden                      | Corrective | DONE    | `d8865ef3`             | V-13       |
| P-14 | Per-keystroke writes and full redraw            | Corrective | DONE    | `ef824f71`             | V-14       |
| P-15 | “Account”/“Leaderboard” labels mislead          | Perfective | PARTIAL | `743fa03e`             | V-15       |
| P-16 | `alert()`-only failures, no boundary or logging | Corrective | DONE    | `993d6579`             | V-16       |
| P-17 | Dead exports, unused deps/assets                | Preventive | DONE    | `52f8f150`             | V-17       |
| P-18 | No lint/format/CI gate; unused checks disabled  | Preventive | DONE    | `0c9d40cb`             | V-18       |
| P-19 | No docs/licence/tags; tracked build artifact    | Preventive | PARTIAL | `02bd87de`             | V-19       |
| P-20 | Accuracy graph fabricated a 101% tick (UAT)     | Corrective | DONE    | `ef364c17`             | V-20       |

Baseline (Phase 0): build passed; no test or lint script; 0 tests; TS6133 error; 3 high advisories;
9 outdated packages; 2.55% duplicated lines; 1 known cycle; entry 474.00 kB / 148.59 kB gzip;
`dist/index.html` tracked; no tag.

Final code state (before Phase 4 docs): 171 tests in 25 files; 88.28% line coverage; typecheck
clean; lint 0 errors / 9 warnings; format clean; 0 cycles; 0.11% duplicated lines; entry 266.36 kB
/ 84.73 kB gzip; `dist/` untracked; tag `v0.1.0`; 14 advisories (8 high / 6 moderate, external
regression); 2 outdated packages.

---

## P-01 — Backup omits game configs and restore skips scores

**Reproduction (E-11, E-18).** Created configs A and B with 2 scores each, exported JSON, opened a
fresh profile, and imported. Result: 0 scores restored and “skipped unknown games: A, B”; the
export envelope had no `gameConfigs`.

**Change.** `89815420` added `schemaVersion: 2` and `gameConfigs[]` to the export. Import restores
configs first, maps scores by `gameName`, keeps the Android nested and legacy flat shapes working,
and reports imported/duplicate/skipped counts.

**Validation.** V-01 fixture: 2 configs + 10 scores round-trip into an empty profile with
`imported=10`, `skipped=0`, and identical fields. Verified during P-06 UI smoke after upgrades
(1 config + 1 score restored, skipped=0).

**Status.** DONE. A-01 target met.

---

## P-02 — Unconfirmed config deletion orphans scores

**Reproduction (E-12).** With 5 scores under a config, one Delete click removed the config
immediately; scores showed game “Unknown” and raw detail keys.

**Change.** `b2d66cb8` added an impact count and typed confirmation, then a persistent soft delete:
`deletedAt` + `deletedScoreIds` on the config, scores moved to sentinel `configId = 0`, and an
undo/Recently deleted path that relinks them. Re-adding or re-importing the same game name also
reactivates the row and relinks its scores. Active-config queries and imports ignore soft-deleted
rows.

**Validation.** V-02: 5 linked scores → warning shows 5 → confirmed delete leaves 5 explicitly
unlinked rows → undo restores 5 links, surviving a reload. Covered by `tests/db/delete.test.ts`.

**Status.** DONE. A-02 target met.

---

## P-03 — Config JSON is trusted without validation

**Reproduction (E-18, E-29).** Importing
`{"gameName":"X","judgments":[{"key":"perfect","weight":"high","type":"banana"}]}` was accepted,
and `"x": -1` rects reached the canvas/OCR path.

**Change.** `a10302b6` added a zod schema. Structural problems (wrong types, empty keys, unknown
field types, malformed rects) reject with dotted paths; out-of-range rects, weights, thresholds,
versions, null holes, and duplicate keys normalize with warnings. Rects are clamped and fitted so
`x + w <= 1` and `y + h <= 1`. Signed Android ARGB colors remain valid. `ConfigsPage`
import/draft and the editor surface the messages; `parseGameConfig` throws
`ConfigValidationError`, so backup/OCR/manual-entry consumers cannot inject bad values.

**Validation.** V-03: 20/20 malformed configs flagged with messages; 0 uncaught exceptions. Suite
at the time: 122 tests, 84.46% `src/lib` line coverage. `tests/config/validation.test.ts` covers
paths, clamping, null holes, duplicate keys, and ARGB.

**Status.** DONE. A-03 target met.

---

## P-04 — No automated tests or runner

**Reproduction (E-04, E-28).** `npm test` returned “Missing script: test”; the repository had no
test files or framework.

**Change.** `41ab48bd` added Vitest, `fake-indexeddb`, and 31 characterization tests for scoring,
config parsing, dates, numbers, and export/import. Because the repository has no gameplay layer
(E-01), the golden harness is unit-level characterization rather than input-to-judgement latency.
`878f9122` added 67 tests for pasteBus, fuzzy/image helpers, bench orchestration with a mocked
runtime, date/config extras, and the DB repository, raising `src/lib` line coverage from 23.48% to
80.96%. Coverage thresholds enforce 60% lines.

**Validation.** V-04: current suite is 171 tests in 25 files, 88.28% lines, 0 skipped. `npm
test:coverage` passes. A-04 target (≥30 tests, ≥60% lines) is exceeded. React Testing Library was
not added; component/OCR behavior is covered by browser smoke checks and the harness is pure
logic/DB.

**Status.** DONE.

---

## P-05 — Keyboard and assistive-technology access missing

**Reproduction (E-25).** Boxes moved only through pointer handlers; Tab could not reach box
selection, file pickers used `<label>` + hidden input, and there was no skip link or focus ring.

**Change.** `351ff0f4` made the canvas focusable (`role="application"`, dynamic label,
`aria-keyshortcuts`), added a pure keyboard rect helper (arrows move, Ctrl/Cmd + arrows resize,
Shift = 5% steps), and kept the same draft/Save-rect flow. Replaced five label-based file pickers
with the real `FileButton`. Added a skip link, `:focus-visible` rings, reduced-motion rules,
icon-button names, corrected heading order, and control labels across Configs, Import, Data,
Debug, ManualEntry, and EditScore.

**Validation.** V-05: ArrowRight moved x 0.100→0.110; Ctrl+ArrowRight resized w 0.400→0.410;
Shift+ArrowDown moved y 0.300→0.350; keyboard Save persisted `{x:0.11,y:0.35,w:0.41,h:0.1}`.
Skip link focused `main-content` without changing the route. Lighthouse accessibility was 1.00 on
Scores, Configs, BoxEditor, Import, Debug, and Data (remaining failures were SEO-only:
`meta-description`, `robots-txt`). 130 tests at the time.

**Status.** DONE. A-05 target met.

---

## P-06 — Vulnerable and outdated dependencies

**Reproduction (E-06, E-07).** `npm audit` reported 3 high advisories; `npm outdated` reported 9
packages.

**Change.** `51c1a7f3` refreshed patch/minor dependencies and the flagged packages:
`@vitejs/plugin-react 6.3.0`, `dexie 4.4.7`, `papaparse 5.7.1`, `react`/`react-dom 19.3.1`,
`react-router-dom 7.18.5`, `vite 8.3.8`, `zod 4.6.7`, `source-map-js 1.2.2`. TypeScript stayed on
6.0.3 because 7.0 is a deferred major. The CI audit job became blocking at `--audit-level=high`,
and Dependabot checks npm and Actions weekly (TypeScript major ignored). Each install was followed
by the full 130-test suite.

**Post-item refresh.** `8addd02e` updated `eslint-plugin-react-refresh` 0.5.7→0.5.8 (patch) with
typecheck, lint, 171 tests, format, build, and bundle guard passing. An attempted
`typescript-eslint` 8.73.0 update was **reverted**: it removed 6 moderates but promoted five
`@typescript-eslint/*` packages to high (8 high → 13 high), so the tree returned to 8.72.2.

**Validation.** V-06 at commit time: high/critical 3→0; 7 moderate remained (one upstream
minimatch advisory via typescript-eslint; npm’s only fix was a downgrade, rejected). Outdated 9→1
(TypeScript 7). UI smoke after upgrades: JSON import restored 1 score + 1 config with skipped=0;
manual entry saved a score with 4 details; the analytics graph rendered both scores.

**Final state (external advisory drift).** `npm audit` now reports 14 vulnerabilities: 8 high
(`@typescript-eslint/typescript-estree`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `fdir`,
`picomatch`, `tinyglobby`, `vite`, `vitest`) and 6 moderate (`@typescript-eslint/eslint-plugin`,
`parser`, `type-utils`, `utils`, `typescript-eslint`, `minimatch`). `npm outdated` reports 2
(`typescript 7.0.2` deferred; `typescript-eslint 8.73.0` rejected because it worsens the audit).
`npm audit --audit-level=high` exits 1, so the CI audit job will fail until upstream ships fixed
releases. The gate was not weakened or ignored.

**Status.** PARTIAL. The original 3→0 result was achieved, but newer advisories in the same current
majors leave the final audit above target. Recorded in the addendum.

---

## P-07 — Heavy entry bundle and OCR payload

**Reproduction (E-03).** The entry was 474.00 kB (148.59 kB gzip) at assessment time and 576.57 kB
after earlier fixes; every route and the OCR path shipped together. Importing the first screenshot
could fetch an 11.3 MB worker, 28.3 MB WASM, and 10.5 MB OCR bundle.

**Change.** `6c95e077` lazy-loaded every route with a named `Suspense` fallback in `Layout` and
added `scripts/check-bundle.mjs` (entry budget plus lazy-OCR marker guard) with a CI Bundle budget
job. OCR engines stay behind the Import/Debug paths.

**Validation.** V-07: entry 266.35 kB / 84.73 kB gzip (script: 260.12 KiB / 81.86 KiB), down from
the pre-P-07 576.57 kB single entry. The initial Scores route loads 9 JS chunks, 482.55 KiB /
150.88 KiB gzip. Production smoke visited all 8 routes with no `worker-entry`, `ort-wasm`,
`paddle`, `dist-*`, or `traineddata` request before OCR/Paddle use.

**Deviation.** A-07’s target was ≤250 kB / ≤80 kB gzip. React 19 + ReactDOM 19 + react-router 7
alone floor at ~260 kB / ~82 kB, so the target is missed. The guard tracks the achieved floor
(262 KiB / 83 KiB) rather than silently changing the approved target. Vendor splitting or a
router replacement is a follow-up, not part of this phase.

**Status.** PARTIAL (A-07 numeric target unmet, lazy-loading target met).

---

## P-08 — Every view reloads all rows

**Reproduction (E-20).** With 10,000 scores, each route navigation performed 4 IndexedDB reads and
rendered 10,000 cards; the baseline navigation took 23,947 ms.

**Change.** `21d0258c` added `readScoreSnapshot()` (one read transaction over scores, details, and
active configs) and a session-wide Dexie `liveQuery` cache exposed through
`useSyncExternalStore`. `useFullScores`/`useConfigMap` and `GameIcon` read the cache; the debug
inspector uses `count()` plus 100/200-row reads. ScoresPage renders 50-row pages with
Previous/Next and a range label; paging is pure, unit-tested logic.

**Validation.** V-08: 10k baseline 4 reads/navigation and 10,000 cards in 23,947 ms. After: 0 IDB
reads per route switch, 50 cards per page, one snapshot load per session. Production route
switches: 225 ms first after cold load, then 70/85 ms to first card, 318/114/134 ms to pager; all
0 reads. Unit load: 263.9 ms / 3 reads versus `fullScores()` 1,086.5 ms.

**Deviation.** A-08’s “10,000-row first render <100 ms” target is not met on the cold first
render (225 ms) and the cache still holds the full 10k snapshot in memory; the rendered list is
bounded to 50 rows. Route switches after warm-up are under 100 ms. Recorded as a partial target.

**Status.** PARTIAL (data-access and paging goals met; cold-render target missed).

---

## P-09 — Re-imports duplicate rows

**Reproduction (E-11).** Importing the same 10-image folder twice produced 20 rows because
`saveFullScore()` always called `add()`.

**Change.** `a1fedf0f` looks up the composite-index bucket
(`configId + songTitle + difficultyName + difficultyVal`) before insert and treats an equal
`playTimestamp` as the same play, returning `{ id, duplicate }` without writing details.
`ImportReport` gained `duplicates`; DataPage, both ImportPage save paths, and ManualEntry report
duplicates instead of silently re-adding. The old duplicate characterization expectation was
updated to the idempotent behavior.

**Validation.** V-09: new duplicate suite covers identical play, different play time, different
config, and a 10-score backup imported twice → 10 rows, 10 details, second report
`imported=0 duplicates=10`. UI: first import 1 score, second 0 scores with “duplicates skipped:
1”, one row in IndexedDB. 134 tests at the time.

**Status.** DONE. A-09 target met.

---

## P-10 — God page and duplicated score form

**Reproduction (E-08, E-10).** `BoxEditorPage.tsx` was 686 lines at the start of this work
(the assessment’s 557 was pre-P-03/P-05), and the manual/edit form blocks shared a 45-line
duplicate.

**Change.** `87c4c15f` extracted `useBoxEditor` (state, validation, pointer/keyboard drag),
`BoxCanvas`, `FieldPanel`, and pure `boxGeometry` with 5 unit tests. Extracted
`ScoreFormFields`, shared by `ManualEntry` and `EditScore`; the duplicated block fell to 5
identical lines.

**Validation.** V-10: BoxEditorPage 686→105 lines (current 103); duplicated form block 45→5;
jscpd 0.11% (1 pre-existing clone in `bench.ts`); 161 tests; 88.16% lines; lint 0 errors / 10
warnings; build 575.05 kB (177.71 gzip); 0 cycles. Smoke: keyboard move/resize, pointer drag, save
rect; manual-entry and edit-dialog save/cancel/validation.

**Note.** jscpd does not detect the former JSX form clone, so the 45→5 direct identical-line
measurement is the evidence for that part.

**Status.** DONE. A-10 target met.

---

## P-11 — Circular dependencies

**Reproduction (E-09).** madge found `components/scores.tsx > components/gameIcon.tsx`; after
P-03, a second cycle existed between `lib/config/types.ts` and `lib/config/schema.ts` (2 total).

**Change.** `924e205f` moved `initials()` to `src/lib/format.ts` and the shared config shapes to
`src/lib/config/model.ts`; `schema.ts` and `types.ts` each depend on the model, not each other.
Behavior is unchanged; the new `initials()` test records the legacy leading-whitespace quirk rather
than fixing it. Added `check:cycles` (pinned `npx --yes madge@8.0.0`, because madge 8 peers
TypeScript ^5.4.4 while this project uses TypeScript 6) and a CI Structure guards job.

**Validation.** V-11: before, 2 cycles and exit 1; after, 49 files processed, “No circular
dependency found”, exit 0. Scores page smoke renders logo initials with no boundary fallback. 156
tests at the time.

**Status.** DONE. A-11 target met (1→0 known cycle, plus the new P-03 cycle removed).

---

## P-12 — Object URL and OCR worker leaks

**Reproduction (E-13, E-16, E-17).** A corrupt image left its blob URL alive, config export never
revoked its URL, and Tesseract workers had no unload path (`terminateOcr` had no call site).

**Change.** `c43c0162` revokes `loadImage` URLs on error as well as load; the box editor releases
its decoded/failed source URL; config export uses the shared `downloadFile` helper. Tesseract
workers stay cached for the tab by design, so `client.ts` registers one `pagehide` teardown the
first time a worker is created. The wiring lives in a unit-testable `onPageHide` helper.

**Validation.** V-12: the strengthened image-error test failed before the fix (revoke not called
for `blob:bad`) and passes now. Tests cover one worker per language, `terminateOcr` releasing the
cache, pagehide terminating cached workers, and the disposer. Browser: corrupt PNG → 1 URL
created, 0 live; config export → 2 created, 0 live after delayed revoke; real Tesseract run read
42, pagehide changed created=1/live=1 to live=0/terminated=1. 143 tests, 87.77% lines.

**Status.** DONE. A-12 target met.

---

## P-13 — `false` misc values are hidden

**Reproduction (E-19).** A score with `fullCombo=false` rendered no row, making an explicit false
indistinguishable from an unrecorded field.

**Change.** `d8865ef3` keeps false misc rows. Every config-defined boolean yields a display value:
`true` → Yes, `false` → No, missing → em dash. Non-boolean misc shows its label and value; unknown
configs keep raw values. The edit dialog marks an unrecorded boolean with a dash next to the
unchecked box.

**Validation.** V-13: three new tests cover true/false/absent, unknown keys, and the no-config
fallback; they failed before (false missing, display undefined) and pass now. UI with three scores
shows Yes/No/dash in detail and an unchecked dash for an absent boolean in the edit dialog. 146
tests, 87.91% lines.

**Status.** DONE. A-13 target met.

---

## P-14 — Per-keystroke writes and full canvas redraws

**Reproduction (E-14, E-15).** A 10-character label rename issued 10 puts and 20 gets; 20 pointer
updates 2 ms apart drew 20 times.

**Change.** `ef824f71` updates local state immediately and queues one 300 ms debounced write for
field edits, while toggles/add/delete/Save-rect stay immediate; unmount flushes a pending edit.
The canvas effect runs on `img/rect/cfg/sel/lockOthers`, keeps a single pending
`requestAnimationFrame` that reads the latest state, and only resizes the bitmap when the image
size changed.

**Validation.** V-14: after the change, the same rename issues 1 put and 2 gets (Dexie re-reads
the row); 20 updates produce 10 paints over 10 frame ticks and never more than one per frame; a
same-frame 20-event burst produces 1 paint. Debounce tests cover coalescing, flush, and cancel; UI
checks confirmed debounced rename, flush on navigate-away, immediate toggle, and Save-rect
persistence. 149 tests, 88.22% lines.

**Deviation.** The headless browser tab does not composite, so frames were simulated with a 16 ms
timer driving the same rAF path. The ≤1 draw/frame behavior is what was measured.

**Status.** DONE. A-14 target met.

---

## P-15 — Misleading “Account” and “Leaderboard” labels

**Reproduction (E-23, E-24).** The top-bar Account icon opened `/data`, and three headings called
local-only lists “Leaderboard”.

**Change.** `743fa03e` renamed the button to “Data and backups” and the headings to “Local chart
rankings”, “Local game rankings”, and “Local game performance”. Added a source-level guard test
(`tests/unit/labels.test.ts`, 3 checks) so sign-in/shared-ranking wording cannot return unnoticed.

**Validation.** V-15 automated portion: the tests failed before and pass after; the production
build exposes `aria-label`/`title="Data and backups"`; the Data, Game Details, and Chart Details
screens show the local headings and no “Leaderboard” text. 172 tests at the time.

**Deviation.** The required 5-player moderated UAT (≥4/5 answer “no sign-in” and “only mine/local”)
was **not run**. The automated and DOM checks cannot substitute for that human validation.

**Status.** PARTIAL (UAT outstanding).

---

## P-16 — `alert()`-only failures, no boundary or logging

**Reproduction (E-26).** Forcing a render error unmounted the React tree; failures used four
`alert()` calls and left no structured context.

**Change.** `993d6579` added a `ToastProvider` live region (`role=status` for info/success,
`role=alert` for errors, Dismiss, 6 s auto-dismiss) and a route-keyed `RouteErrorBoundary` around
the outlet. Fallback actions: Try again, Back to scores, Reload app. `logError` records one
structured `console.error` entry with route, action context, and component stack. Silent catches
now log with config/file context; ManualEntry shows an unreadable-config banner; DB failures
surface as error toasts. All four `alert()` calls were removed.

**Validation.** V-16 fault injection on the production build: a score row with `accuracy: null`
throws during render; the boundary shows the route and error, navigation stays visible, and exactly
one `[P-16]` render-error entry carries route `/` plus a component stack. Navigating to `#/configs`
renders Manage Configs and clears the fallback (after fixing the initial `location.key` issue by
keying on the route string). Toast checks: missing new-field key → `role=alert` toast, no native
dialog; manual save → `role=status` success toast. `alert(` call sites: 0. 152 tests, 88.33% lines.

**Status.** DONE. A-16 target met.

---

## P-17 — Dead exports, unused dependencies, and unused assets

**Reproduction (E-21, E-22).** `tsc --noEmit --noUnusedLocals --noUnusedParameters` failed with
TS6133; `LineChart` and `booleanLabels` had no call sites; `papaparse` and `zod` had no imports;
four assets were unreferenced.

**Change.** `52f8f150` deleted `LineChart`, `booleanLabels`, `papaparse` +
`@types/papaparse`, `src/assets/{hero.png,typescript.svg,vite.svg}`, and `public/icons.svg`.
`zod` stays because P-03 now imports it in `config/schema.ts`. `terminateOcr` is live (P-12) and
`cleanNumericInput` had already been removed by P-18.

**Validation.** V-17: `tsc --noEmit --noUnusedLocals --noUnusedParameters` exits 0; `src` and
`tests` contain 0 references to the deleted symbols/assets; `npm ls papaparse` is empty; zod is
imported by the schema. 171 tests, 88.28% lines.

**Disclosure.** `tests/unit/calc-extras.test.ts` contained the only characterization test for
`booleanLabels`. Because the function was dead and deleted, that test was deleted with its subject
(172→171 tests). This is the one exception to the “never delete tests” rule and is recorded here
rather than hidden. No other test was removed or weakened.

**Status.** DONE. A-17 target met.

---

## P-18 — No lint, format, or CI gate; unused checks disabled

**Reproduction (E-05, E-02).** `npm run lint` was missing; there was no `.github` workflow;
`noUnusedLocals`/`noUnusedParameters` were disabled.

**Change.** `0c9d40cb` added ESLint 10 flat config (classic `react-hooks` rules), Prettier, a
typecheck script, and GitHub Actions. Enabled the unused-local/parameter checks; removed the
unused `cleanNumericInput` that the new check exposed. The audit job was initially non-blocking
until P-06 fixed the known advisories.

**Validation.** V-18: `npm run lint` → 0 errors (9 current warnings), `format:check` passes,
`tsc --noEmit` passes. CI now has 6 jobs (typecheck, tests, lint/format, structure guards, bundle,
audit), exceeding the 4-check target. Every push and pull request runs them; the audit job is
blocking at high severity (currently red because of upstream advisories, not a weakened gate).
`src/**` is intentionally in `.prettierignore` for the legacy tree; touched files are formatted
individually. The BoxEditor line budget (≤250) and duplication guard run in CI.

**Status.** DONE. A-18 target met (and exceeded).

---

## P-19 — Missing documentation, licence, tags, and artifact hygiene

**Reproduction (E-02, E-31).** `README.md` was absent, no tag existed, and `dist/index.html` was
tracked.

**Change.** `02bd87de` added `README.md` (setup, scripts, routes, privacy, accessibility, licence
status), `ARCHITECTURE.md` (module map, data flow, OCR pipeline, constraints), `DATA_FORMAT.md`
(IndexedDB schema, soft delete, dedupe, JSON/CSV backup, config JSON, OCR box semantics),
`CONTRIBUTING.md` (branch/commit rules, required checks, extension points), and `CHANGELOG.md`.
Bumped the package version to 0.1.0, untracked `dist/index.html`, and created annotated tag
`v0.1.0`.

**Validation.** V-19: a fresh clone of tag `v0.1.0` into a temp directory ran `npm ci` (71.9 s),
`npm run build` (14.0 s after install), and `npm test` (8.7 s) with exit 0; total 94.6 s, well under
15 minutes. `git ls-files dist` is empty; tag `v0.1.0` exists and points at the release commit.
`npm ci` reports 14 vulnerabilities (8 high / 6 moderate).

**Deviation.** `LICENSE` is **not written**: the licence type was not chosen. README and
CONTRIBUTING state that no reuse rights may be assumed. This is the remaining P-19 deliverable.

**Status.** PARTIAL (docs/tag/dist done; licence pending).

---

## P-20 — Accuracy graph fabricated a 101% tick (UAT finding)

**Reproduction.** Kent’s UAT report showed a chart whose plays were all 100% rendering Y ticks up
to 101.00%.

**Change.** `ef364c17` moved the domain math into a pure `graphDomain()` helper. A flat series pads
by 0.5 points for accuracy (1% for score), and accuracy is capped at 100 only when every recorded
value is ≤100; values genuinely stored above 100 stay visible.

**Validation.** V-20: six unit tests cover the single-100% case, flat 99.2%, mixed 97.5–100, flat
score padding, a stored 101%, and non-finite/empty input. Browser check on the 100%-only chart
shows ticks 99.50/99.67/99.83/100.00% (previously up to 101.00%). 140 tests at the time.

**Status.** DONE.

---

## R-01…R-09 — Awaiting approval

All nine requirements remain `[TEAM INPUT]` and were **not** implemented. No code, schema, or
dependency was added for them.

| ID   | Requirement                              | Status            | Note                                                                                          |
| ---- | ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| R-01 | Playable rhythm-game mode                | AWAITING APPROVAL | Product-scope decision; no gameplay layer exists (E-01).                                      |
| R-02 | One-file backup including configs        | AWAITING APPROVAL | Technical overlap with P-01 is implemented, but the requirement itself was not approved.      |
| R-03 | Optional account/cloud sync              | AWAITING APPROVAL | Needs backend, privacy policy, conflict rules.                                                |
| R-04 | Online/shared leaderboards               | AWAITING APPROVAL | Depends on R-03.                                                                              |
| R-05 | PWA/packaged mobile app                  | AWAITING APPROVAL | No manifest/service worker added.                                                             |
| R-06 | Android/third-party import               | AWAITING APPROVAL | Legacy/Android JSON import already works, but no new adapter or migration path was committed. |
| R-07 | Scheduled/reminder backups               | AWAITING APPROVAL | No reminder implemented.                                                                      |
| R-08 | Automated regression suite and CI gate   | AWAITING APPROVAL | Technical overlap with P-04/P-18 is implemented, but the requirement itself was not approved. |
| R-09 | Published data-format/config-schema spec | AWAITING APPROVAL | P-19 documents the formats; a formal JSON Schema was not published.                           |

## Commit index

| Commit     | Item(s) | Summary                                            |
| ---------- | ------- | -------------------------------------------------- |
| `ce773fea` | —       | Assessment and raw evidence added                  |
| `41ab48bd` | P-04    | Golden characterization harness                    |
| `878f9122` | P-04    | Unit coverage to 81%                               |
| `0c9d40cb` | P-18    | ESLint, Prettier, typecheck, CI                    |
| `89815420` | P-01    | Configs in JSON backups                            |
| `b2d66cb8` | P-02    | Confirmed soft delete and undo                     |
| `a10302b6` | P-03    | zod config validation                              |
| `351ff0f4` | P-05    | Keyboard editing and accessibility                 |
| `51c1a7f3` | P-06    | Dependency upgrade and blocking audit              |
| `a1fedf0f` | P-09    | Deduplicate score inserts                          |
| `ef364c17` | P-20    | Accuracy graph domain cap                          |
| `c43c0162` | P-12    | URL/worker lifecycle                               |
| `d8865ef3` | P-13    | Explicit Yes/No/unrecorded                         |
| `ef824f71` | P-14    | Debounced saves and rAF painting                   |
| `993d6579` | P-16    | Error boundary, toasts, logging                    |
| `924e205f` | P-11    | Break import cycles                                |
| `87c4c15f` | P-10    | Split editor, share form fields                    |
| `21d0258c` | P-08    | Shared snapshot and pagination                     |
| `6c95e077` | P-07    | Lazy routes and bundle guard                       |
| `743fa03e` | P-15    | Truthful local labels                              |
| `52f8f150` | P-17    | Remove dead code/assets/dependency                 |
| `02bd87de` | P-19    | Docs, version 0.1.0, untrack `dist/`, tag `v0.1.0` |
| `8addd02e` | P-06    | Patch refresh of eslint-plugin-react-refresh       |
