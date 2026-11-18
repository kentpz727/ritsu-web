# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use annotated tags.

## [Unreleased]

### Changed

- Merged the `origin/main` Vercel deployment fixes: esbuild CSS minification, `allowScripts` for
  esbuild/protobufjs/tesseract.js, and a `detect-libc` v1 override. No application behavior changed.

## [0.1.0] - 2026-11-18

First documented release. This release closes the approved maintenance plan for the prototype and
adds the documentation, tests, and release hygiene needed to hand the project over.

### Added

- **Test harness (P-04).** Vitest with `fake-indexeddb`, unit/config/DB suites, a golden
  characterization baseline for scoring, dates, numbers, configs, and persistence, and V8 coverage
  with a line floor.
- **Validation and errors (P-03, P-16).** zod validation for game configs with dotted-path errors
  and clamp warnings; a route-keyed error boundary, shared toast live region, and contextual
  logging instead of `alert()`.
- **Data safety (P-01, P-02, P-09).** JSON backups now include game configs (`schemaVersion: 2`)
  so scores restore on a fresh profile; config deletion is a persistent soft delete with an impact
  count and undo; re-imports deduplicate by game, song, difficulty, and play time.
- **Accessibility (P-05).** Keyboard box editing (arrows move, Ctrl/Cmd + arrows resize, Shift =
  5% steps), visible focus, a skip link, and real buttons for file pickers.
- **Shared data access and paging (P-08).** One live score/config snapshot per session via
  `useSyncExternalStore`, one read transaction over the three tables, and 50-row score pages.
- **Release guardrails (P-06, P-18, P-19).** ESLint 10 + Prettier, CI jobs for typecheck, tests,
  lint/format, structure, bundle, and audit, Dependabot updates, a bundle-budget script, README,
  architecture/data-format/CONTRIBUTING docs, untracked `dist/`, and the `v0.1.0` tag.

### Changed

- **OCR and resources (P-12).** Object URLs and OCR workers are released through one lifecycle;
  workers are created lazily per language and torn down on `pagehide`.
- **Editor structure (P-10, P-11, P-14).** `BoxEditorPage` was split into `useBoxEditor`,
  `BoxCanvas`, and `FieldPanel`; the duplicated manual/edit form block became shared
  `ScoreFormFields`; config writes are debounced and canvas paints are coalesced into one
  `requestAnimationFrame`; the sole import cycle was removed.
- **Bundles (P-07).** Every route is lazy-loaded, OCR assets stay off the entry path, and CI
  enforces the entry budget.
- **Truthful labels (P-15).** “Account” is now “Data and backups”; local list headings say
  “Local … rankings/performance”.
- **Misc display (P-13).** Explicit `false` values render as “No”, unrecorded booleans render as
  “—”, and unknown configs keep raw values.
- **Graph scaling (P-20).** A flat series no longer fabricates a 101% top tick.
- **Dependency refresh (P-06).** `eslint-plugin-react-refresh` was updated to 0.5.8 after the
  initial audit. An attempted `typescript-eslint` 8.73.0 update was rejected because it raised
  high advisories from 8 to 13; the tree stays on 8.72.2.

### Removed

- Dead exports (`LineChart`, `booleanLabels`), the unused `papaparse` dependency and its types,
  and four unreferenced assets. `terminateOcr` is live; `zod` is now used for config validation.

### Known limitations

- **Bundle target missed.** The entry chunk is about 260 KiB raw / 82 KiB gzip against the
  assessment target of 250/80; React 19 + ReactDOM 19 + react-router 7 set the floor. The
  achieved floor is guarded in CI and the gap is recorded in the validation results.
- **Audit gate depends on upstream fixes.** New high advisories in `picomatch`, `vite`, `vitest`,
  and related tooling have no fixed release in the current major line at release time. The CI
  audit job is intentionally not weakened; it will pass once upstream patches ship.
- **Licence pending.** No `LICENSE` file has been added because the licence type has not been
  chosen. Do not assume reuse rights.
- **Manual checks remain manual.** Real OCR engines/browsers, Lighthouse runs, and the
  5-player moderated usability session are documented as manual/human validation, not automated
  tests.
- **`node_modules` is still partly tracked.** The prototype's vendored subset remains in git
  pending a repository-hygiene decision; do not commit changes under it.
