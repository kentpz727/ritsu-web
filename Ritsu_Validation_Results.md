# Ritsu Validation Results

**Branch:** `main` (merged from `Test`)  
**Base:** `64c3a235`  
**Validated code HEAD:** `2169eabf` (merge of `origin/main`); pre-merge maintenance HEAD `8addd02e`  
**Date:** 2026-11-18  
**Environment:** Windows, Node.js v24.20.0, npm 11.19.0, Chromium browser for DOM/OCR checks.  
**Method:** each item was reproduced before the change, validated with the smallest relevant test
plus the full suite, and checked through a production build where a browser behavior was involved.
No metric below is estimated; all come from commands or recorded browser checks.

> **Install note:** the audit, outdated, coverage, and build numbers were taken with the
> npm-installed tree for `8addd02e` (React 19.3.1, eslint-plugin-react-refresh 0.5.8) and re-checked
> after the `origin/main` merge with a fresh `npm ci` from the merged lockfile. The repository still
> tracks a stale `node_modules` subset; after `git checkout -- node_modules`, a local
> `npm ls`/`npm outdated` reflects those old tracked files until the next `npm ci`. See the
> addendum §3.2.

## Final gate results

| Gate                    | Command                                                  | Result                                                             | Status   |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Typecheck               | `npm run typecheck`                                      | exit 0                                                             | PASS     |
| Unused locals/params    | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | exit 0                                                             | PASS     |
| Tests                   | `npm run test:coverage`                                  | 25 files, 171 tests, 0 failed, 0 skipped                           | PASS     |
| Coverage                | `npm run test:coverage`                                  | 87.72% statements, 82.18% branches, 90.82% functions, 88.28% lines | PASS     |
| Lint                    | `npm run lint`                                           | 0 errors, 9 warnings                                               | PASS     |
| Format                  | `npm run format:check`                                   | all matched files clean                                            | PASS     |
| Circular imports        | `npm run check:cycles`                                   | 49 files, no circular dependency, exit 0                           | PASS     |
| Duplication             | `npm run check:duplication`                              | 2 clones, 13 lines, 0.20% (threshold 1%)                           | PASS     |
| Build                   | `npm run build`                                          | exit 0; entry 266.36 kB / 84.73 kB gzip                            | PASS     |
| Bundle budget           | `npm run check:bundle`                                   | 260.12 KiB / 81.86 KiB gzip against 262/83 KiB                     | PASS     |
| `alert()` removal       | source search                                            | 0 call sites                                                       | PASS     |
| Tracked build artifacts | `git ls-files dist`                                      | empty                                                              | PASS     |
| Release tag             | `git tag --list`                                         | `v0.1.0`                                                           | PASS     |
| Dependency audit        | `npm audit --audit-level=high`                           | 14 vulnerabilities: 8 high, 6 moderate; exit 1                     | **FAIL** |
| Outdated dependencies   | `npm outdated`                                           | 2 packages (`typescript` 7.0.2, `typescript-eslint` 8.73.0)        | NOTE     |

The audit failure is an upstream advisory-database regression after P-06, not a weakened gate.
A fresh `npm ci` in the V-19 clone reported the same 14 vulnerabilities, so it is not local drift.
See the addendum for the package list and the rejected `typescript-eslint` update.

Post-merge verification: the `origin/main` merge (`2169eabf`) was checked with a fresh `npm ci`
from the merged lockfile. All gates above still pass, the entry chunk is still
266.36 kB / 84.73 kB gzip, and the bundle guard still passes. The merge brought in the remote
esbuild CSS minifier, `allowScripts`, and `detect-libc` override; `dist/index.html` remains
untracked. See addendum §3.14.

## V-01…V-20 results

| ID   | Expected target                                                                             | Actual                                                                                                                                                           | Status              |
| ---- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| V-01 | 2 configs + 10 scores restore into a fresh profile; `skipped=0`; legacy shapes accepted     | Fixture round-trip restored 10/10 scores and 2/2 configs with `skipped=0`; Android nested and legacy flat payloads covered                                       | PASS                |
| V-02 | 5 linked scores: warning 5, confirmed delete unlinks 5, undo relinks 5                      | 5 → 5 explicitly unlinked rows → 0 orphans after undo; survives reload                                                                                           | PASS                |
| V-03 | 20/20 malformed configs rejected/clamped with messages; 0 uncaught exceptions               | 20/20 flagged with dotted paths, 0 uncaught exceptions; clamping/ARGB/null-hole tests pass                                                                       | PASS                |
| V-04 | ≥30 tests; ≥60% line coverage in `src/lib`; 0 skipped                                       | 171 tests; 88.28% lines; 0 skipped                                                                                                                               | PASS                |
| V-05 | Every editor action keyboard-reachable; Lighthouse accessibility ≥90; 0 critical axe issues | Keyboard move/resize/save verified; Lighthouse accessibility 1.00 on six screens (axe-based audit), 0 accessibility failures; remaining failures were SEO-only   | PASS                |
| V-06 | 0 high advisories; ≤2 outdated; smoke passes                                                | At item time 3→0 high, 9→1 outdated, smoke passed. Final state: 8 high / 6 moderate, 2 outdated due external advisories                                          | **MISSED (final)**  |
| V-07 | Entry ≤250 kB / ≤80 kB gzip; OCR only on Import/Debug                                       | Entry 266.36 kB / 84.73 kB gzip (script 260.12/81.86 KiB); OCR lazy on all 8 routes. React 19 + ReactDOM + router floor ~260/82, so the numeric target is unmet  | **MISSED (target)** |
| V-08 | 1 cached load per navigation; 10k first render <100 ms                                      | 0 IDB reads per route switch after the first snapshot; 50 cards/page; cold first card 225 ms, then 70/85 ms; unit snapshot 263.9 ms vs 1,086.5 ms `fullScores()` | **PARTIAL**         |
| V-09 | Second import of 10 scores: 10 rows total, `duplicates=10`                                  | 10 rows, 10 details; second report `imported=0 duplicates=10`; UI shows “duplicates skipped: 1” in the 1-score check                                             | PASS                |
| V-10 | `BoxEditorPage` ≤250 lines; duplication <1%; editor/forms behave identically                | 103 lines; jscpd 0.20% final (0.11% at item time); duplicated form block 45→5 lines; keyboard/pointer/save and both forms smoke-tested                           | PASS                |
| V-11 | “No circular dependency found,” exit 0                                                      | 2 cycles at baseline (including the P-03 cycle) → 0; exit 0                                                                                                      | PASS                |
| V-12 | 0 leaked URLs per failed image; 0 workers after unload                                      | Corrupt PNG 1 created / 0 live; export 2 created / 0 live; real worker run pagehide → live=0, terminated=1                                                       | PASS                |
| V-13 | `true` → Yes, `false` → No, absent → —                                                      | Detail and edit dialog show Yes/No/dash; unknown configs keep raw values                                                                                         | PASS                |
| V-14 | 1 write per 300 ms; ≤1 draw per frame                                                       | 1 put / 2 gets per 10-char rename; ≤1 paint per frame; same-frame burst = 1 paint. Frames simulated at 16 ms because the headless tab does not composite         | PASS                |
| V-15 | ≥4/5 users answer “no sign-in” and “only mine/local”; labels do not imply sharing           | Automated label guard passes; production DOM shows “Data and backups” and local headings; **5-player UAT not run**                                               | **PARTIAL**         |
| V-16 | App navigable; 1 logged context entry; 0 `alert()`                                          | Fault injection kept navigation usable; one `[P-16]` entry with route + component stack; toast checks pass; 0 `alert()`                                          | PASS                |
| V-17 | Unused checks exit 0; `papaparse` removed; `zod` used; 0 unreferenced assets                | All true; `npm ls papaparse` empty; zod imported by `config/schema.ts`; 0 asset references                                                                       | PASS                |
| V-18 | 4/4 CI checks block a failing PR; `main` stays green                                        | 6 jobs (typecheck, tests, lint/format, structure, bundle, audit) run on push/PR. Audit currently red on upstream advisories, proving the gate blocks             | PASS (gate)         |
| V-19 | Fresh clone builds in <15 min; tag exists; `dist/` untracked                                | Temp clone of `v0.1.0`: `npm ci` 71.9 s + build 14.0 s + tests 8.7 s = 94.6 s; exit 0; tag exists; `git ls-files dist` empty                                     | PASS                |
| V-20 | No fabricated 101% tick; stored >100 values remain visible                                  | 100%-only chart ticks 99.50/99.67/99.83/100.00%; six domain tests pass, including stored 101%                                                                    | PASS                |

## Command evidence

```text
> ritsu-web-app@0.1.0 typecheck
> tsc --noEmit
EXIT: 0

> ritsu-web-app@0.1.0 lint
✖ 9 problems (0 errors, 9 warnings)
EXIT: 0

> vitest run --coverage
Test Files  25 passed (25)
Tests       171 passed (171)
All files   | 87.72 % Stmts | 82.18 % Branch | 90.82 % Funcs | 88.28 % Lines

> vite build
dist/assets/index-6aaIkP9J.css   7.46 kB │ gzip:  2.29 kB
dist/assets/index-B-LmXKzQ.js  266.36 kB │ gzip: 84.73 kB
✓ built in 1.88s

> node scripts/check-bundle.mjs
Entry index-B-LmXKzQ.js: 260.12 kB (81.86 kB gzip)
Budget: 262.00 kB (83.00 kB gzip)
Bundle budget passed; OCR assets stay out of the entry chunk.

> madge --circular --extensions ts,tsx src
Processed 49 files
✔ No circular dependency found!

> jscpd src --threshold 1
Files analyzed: 48; Total lines: 6406; Clones found: 2; Duplicated lines: 13 (0.20%)

> npm audit --audit-level=high
14 vulnerabilities (6 moderate, 8 high)
EXIT: 1

> npm outdated
typescript         6.0.3  6.0.3  7.0.2
typescript-eslint  8.72.2 8.73.0 8.73.0
```

The build still emits large lazy OCR chunks (`worker-entry` 11.34 MB, `ort-wasm` 28.31 MB,
`dist-*` 10.48 MB). They are not referenced by the entry and are requested only when OCR/Paddle
is used, which is the P-07 requirement.

## Fresh onboarding drill (V-19)

A detached clone of annotated tag `v0.1.0` was created in a temp directory:

```text
npm ci           71.9 s   exit 0 (229 packages, 14 vulnerabilities)
npm run build    14.0 s   exit 0 (266.36 kB entry)
npm test          8.7 s   exit 0 (171 tests)
total            94.6 s
git ls-files dist        0 files
git tag --list           v0.1.0
```

The clone warning “refs/tags/v0.1.0 is not a commit” is expected for an annotated tag; the
checkout resolved to the release commit `02bd87de`. The fresh install confirmed
`react@19.3.1`/`react-dom@19.3.1` and the same audit result as the working copy.

## Browser and manual checks

| Area             | Check                                                            | Result                                    |
| ---------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Keyboard editing | Arrow move, Ctrl/Cmd resize, Shift 5%, keyboard Save rect        | Passed (P-05)                             |
| Skip link        | Focus `main-content` without route change                        | Passed                                    |
| Lighthouse       | Accessibility on Scores, Configs, BoxEditor, Import, Debug, Data | 1.00 on all six; SEO-only failures        |
| OCR lifecycle    | Corrupt PNG, config export, real Tesseract run + pagehide        | 0 leaked URLs; 0 live workers             |
| Error boundary   | Fault-injected `accuracy: null` row                              | Boundary shown, nav usable, one log entry |
| Toasts           | Missing field key; manual save                                   | `role=alert` and `role=status` fired      |
| Backup/restore   | JSON export → fresh profile → import                             | 10/10 scores + 2/2 configs                |
| Soft delete      | 5 linked scores → delete → undo                                  | 5 unlinked, 0 orphans after undo          |
| Duplicate import | 1-score import twice                                             | 1 row, second reports 1 duplicate         |
| Lazy routes      | Visit all 8 routes on production build                           | No OCR/Paddle assets requested            |
| Bundle           | Entry vs lazy OCR chunks                                         | Entry 266.36 kB; lazy chunks separate     |
| Graph ticks      | All-100% accuracy chart                                          | 99.50–100.00%, no 101%                    |
| Truthful labels  | Data, Game, Chart screens                                        | Local headings, no “Leaderboard”          |
| UAT              | 5-player moderated label session                                 | **Not run (human task)**                  |

## Unmet targets and deviations

1. **V-06 / A-06 — dependency audit.** The item achieved 3→0 high at commit time, but new
   advisories in `picomatch`, `fdir`, `tinyglobby`, `vite`, `vitest`, `@vitejs/plugin-react`,
   `@vitest/coverage-v8`, and `@typescript-eslint/typescript-estree` have no fixed current-major
   release. `npm audit fix` only proposes major downgrades. The blocking CI job is intentionally
   red. 2 outdated packages remain: TypeScript 7 (deferred major) and `typescript-eslint` 8.73.0
   (rejected because it raised high advisories from 8 to 13).
2. **V-07 / A-07 — bundle target.** 266.36 kB / 84.73 kB gzip misses 250/80. The measured floor
   for React 19 + ReactDOM 19 + react-router 7 is ~260/82; the guard tracks 262 KiB/83 KiB and
   records the gap. Vendor splitting or a router replacement is a follow-up.
3. **V-08 / A-08 — cold first render.** Route switches after warm-up are 70/85 ms, but the first
   card after a cold app load is 225 ms and the shared snapshot still holds all 10k score rows in
   memory (the DOM is limited to 50 cards). The <100 ms cold target was not met.
4. **V-15 / A-15 — UAT.** The required 5-player moderated session was not run. Automated tests
   and DOM checks verify wording, but not comprehension.
5. **A-19 — licence.** `LICENSE` is absent because the licence type was not chosen. This is the
   only P-19 deliverable that remains open.
6. **A-04 method.** React Testing Library was not added; the project uses a Node Vitest
   environment, pure unit/config/DB tests, and browser smoke checks. The A-04 count/coverage
   targets are met, but component-level automation is thinner than the original proposal.
7. **V-14 timing.** Headless Chromium does not composite, so frame counts were simulated with a
   16 ms timer driving the same `requestAnimationFrame` callback. The measured invariant (≤1
   paint per frame) still holds.
8. **P-17 test count.** One characterization test was removed with its only subject
   (`booleanLabels`), so the suite ends at 171 rather than 172. No other test was removed,
   skipped, or weakened. Details are in the implementation log and addendum.
9. **P-06 dependency refresh.** The post-item `eslint-plugin-react-refresh` patch is included.
   The attempted `typescript-eslint` 8.73.0 update was reverted after its audit result worsened;
   no partial dependency state was left behind.
