# Ritsu Report Addendum

This addendum records what changed relative to `Ritsu_Software_Maintenance_Assessment.md` and
`Ritsu_Assessment_Raw_Evidence.md` during implementation. It covers scope changes, corrected
baselines, newly discovered risks, and the items that remain open. It does not reopen approved
scope; R-01…R-09 are still `[TEAM INPUT]`.

## 1. Scope changes

| Item      | Change                                                         | Why                                                                                                                                                                                                                        |
| --------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-20      | **Added and implemented** (not in the original P-01…P-19 list) | Kent’s UAT screenshot showed a 101% axis tick on an all-100% chart. It is a real correctness defect and was fixed with `graphDomain()` and six tests (`ef364c17`).                                                         |
| P-06      | **Partial at final validation**                                | The approved upgrade achieved 3→0 high advisories at commit time. New advisories later appeared in the same current-major toolchain; the final `npm audit` reports 8 high / 6 moderate. No compliant upgrade exists today. |
| P-07      | **Partial**                                                    | Lazy routes and the bundle guard landed, but A-07’s 250 kB/80 kB target is not reachable with React 19 + ReactDOM 19 + react-router 7 (floor ~260/82).                                                                     |
| P-08      | **Partial**                                                    | The shared snapshot removed per-navigation scans and paged the DOM, but the cold first card is 225 ms (target <100 ms) and the snapshot still holds all rows in memory.                                                    |
| P-15      | **Partial**                                                    | Labels and automated guards landed; the required 5-player moderated UAT was not run.                                                                                                                                       |
| P-19      | **Partial**                                                    | README, architecture/data-format/CONTRIBUTING docs, changelog, tag, and `dist/` untracking landed; `LICENSE` is pending the licence choice.                                                                                |
| R-01…R-09 | **Unchanged**                                                  | Still `[TEAM INPUT]`; no implementation was started. Technical overlap (R-02/R-08/R-09 with P-01/P-04/P-18/P-19) does not count as requirement approval.                                                                   |

## 2. Corrected baselines

The assessment and the implementation started at different times, so some numbers differ from the
Phase 0 evidence. Both are accurate for their dates; the report should not mix them.

| Metric                    | Assessment / Phase 0              | Actual immediately before the item       | Explanation                                                                                                             |
| ------------------------- | --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `BoxEditorPage.tsx` lines | 557                               | 686 before P-10                          | P-03 validation UI and P-05 keyboard/focus changes added code before the split. P-10 reduced it to 105 (103 now).       |
| Entry bundle              | 474.00 kB / 148.59 kB gzip        | 576.57 kB before P-07                    | P-03/P-05/P-08 and dependency work added code/chunks before lazy loading. P-07 reduced it to 266.36 kB / 84.73 kB gzip. |
| Circular dependencies     | 1 (`scores.tsx` ↔ `gameIcon.tsx`) | 2 before P-11                            | P-03 introduced a `types.ts` ↔ `schema.ts` cycle, which P-11 also removed.                                              |
| Tests                     | 0                                 | 98 after the P-04 commits                | 31 characterization + 67 unit tests; the suite grew to 171 by the end.                                                  |
| High advisories           | 3                                 | 0 after P-06, then 8 at final validation | The advisory database changed after the P-06 commit; see §3.1.                                                          |
| Duplicated lines          | 2.55% (146 lines)                 | 0.11% after P-10                         | jscpd still reports one 7-line pre-existing clone in `bench.ts`.                                                        |

## 3. New findings and residual risks

### 3.1 Dependency audit regressed after P-06 (external)

`npm audit --audit-level=high` now exits 1 with 14 vulnerabilities:

- **High (8):** `@typescript-eslint/typescript-estree`, `@vitejs/plugin-react`,
  `@vitest/coverage-v8`, `fdir`, `picomatch`, `tinyglobby`, `vite`, `vitest`.
- **Moderate (6):** `@typescript-eslint/eslint-plugin`, `parser`, `type-utils`, `utils`,
  `typescript-eslint`, `minimatch`.

The latest releases in the current majors are already installed (`vite 8.3.8`, `vitest 5.1.0`,
`@vitejs/plugin-react 6.3.0`, `picomatch 4.0.7`, `fdir 6.5.0`, `tinyglobby 0.2.17`). npm’s only
proposed fixes are major downgrades (for example `vite 6.2.7`, `vitest 3.1.4`), which would be a
regression and is outside P-06’s approved “no major jumps” rule. A fresh `npm ci` reports the same
result, so this is not local drift.

An attempted `typescript-eslint 8.73.0` update was reverted: it removed the 6 moderates but
promoted five `@typescript-eslint/*` packages to high, taking high advisories from 8 to 13. The
committed state stays on 8.72.2. The CI audit job remains blocking and red; it should not be
weakened just to get green.

**Recommendation.** Re-run `npm audit` when upstream patches `picomatch`/`tinyglobby`/`vite`; then
upgrade one package at a time. Keep Dependabot enabled. Consider whether dev-only advisories should
have a separate gate, but do not change the gate without approval.

### 3.2 `node_modules` is still partly tracked

The prototype tracks 151 files under `node_modules` (43 `react-dom`, 27 `react`, 15 `scheduler`,
16 `@types/*`, plus transitive tooling). Consequences:

- `npm ci` replaces the directory, so a fresh developer sees tracked files as modified/deleted.
- The local install can drift from `package.json` (the tracked React was 19.3.0 while the lock
  asks for 19.3.1; a fresh install fixes it).
- Dependency commits must avoid accidentally staging `node_modules`.

README now warns about this. **Decision needed:** untrack the whole directory in a separate,
approved hygiene change with a clean `npm ci` verification. It was not done here because it was
not an approved P-item and would touch many files.

### 3.3 `parseDifficultySort` has an Android-parity quirk

`parseDifficultySort('Lv. 14+')` returns **0.64**, not 14.5, because the function concatenates
every digit and dot before adding the `+` bonus: `Lv.` contributes `.`, producing `.14` → 0.14 +
0.5. `14+` alone returns 14.5. This behavior is preserved because it mirrors Android and no P-item
covers it. It is documented in `DATA_FORMAT.md` so a future change is deliberate, not accidental.

### 3.4 `initials()` has a leading-whitespace quirk

`initials()` splits on whitespace and takes the first two words. A title with leading whitespace
produces an empty first word and therefore an empty first initial. The behavior is unchanged and
is captured by a unit test; it was not “fixed” because it is outside P-11’s refactor scope.

### 3.5 jscpd does not detect the former JSX clone

jscpd reports only 0.11% duplicated lines and did not flag the 45-line manual/edit form block.
P-10’s evidence for that part is the direct identical-line measurement (45→5), not jscpd. Do not
treat the jscpd number as proof that JSX duplication is absent.

### 3.6 The entry-chunk floor is structural

The 250 kB/80 kB target assumed more removable weight than the runtime allows. React 19 +
ReactDOM 19 + react-router 7 alone are ~260 kB raw / ~82 kB gzip in this build. The guard now
tracks 262 KiB/83 KiB so it catches regressions without pretending the target was met. Options for
a future phase: split vendor code (more requests, same total bytes), replace `react-router` with a
smaller hash router, or relax the target with approval. Do not silently change the guard.

### 3.7 The shared score cache trades memory for reads

P-08 keeps one session-wide snapshot of all scores/configs so route changes do not re-scan
IndexedDB. The DOM is bounded to 50 rows, but the snapshot is not. At 10,000 scores the unit load
was 263.9 ms and the cache held the full set. A future indexed/paged repository could remove the
memory cost, but that is a larger data-layer change than P-08 approved.

### 3.8 Import still skips scores with no matching config

P-01 restores configs before scores, so a schema-v2 backup restores on a fresh profile. However, a
legacy payload without `gameConfigs` (or a score whose game name is absent) is still skipped by
design (Android parity), and the report lists the skipped game names. This is intentional, but it
means “backup” is only complete when it includes configs. The README and `DATA_FORMAT.md` state
this.

### 3.9 Error-boundary reset is keyed by route, not `location.key`

Fault injection showed that hash navigation did not change `location.key`, so the first fallback
survived a route change. The boundary is keyed by the route string instead. If routing changes to
history-based navigation, re-check this assumption.

### 3.10 P-17 removed one test with its only subject

The `booleanLabels` characterization test was deleted with the dead function. The suite went from
172 to 171 tests. This is disclosed because the working rule was “never delete tests.” The function
had no call sites and no behavior to preserve; no other test was removed, skipped, or weakened. If
a boolean-label helper returns, add a new test with it.

### 3.11 Licence and release tag

`v0.1.0` is an annotated tag on `02bd87de` (docs/release commit). The later P-06 patch refresh
(`8addd02e`) is after the tag; the tag remains a valid release marker but does not include that
patch. If a fully final tag is required, create `v0.1.1` after the licence decision rather than
moving `v0.1.0`.

`LICENSE` is absent. The assessment’s P-19/A-19 deliverable cannot be completed until the project
owner chooses a licence. Until then, README/CONTRIBUTING say no reuse rights may be assumed.

### 3.12 Tooling note: no React Testing Library

A-04 proposed Vitest + RTL. The implementation uses Vitest in a Node environment, `fake-indexeddb`,
and browser smoke checks; RTL/jsdom was not added. This kept the dependency surface small and
avoided testing implementation details, but component-level automation is thinner than proposed.
The A-04 count and coverage targets are still met.

### 3.13 `formula` is preserved but not interpreted

Config `formula` is kept for Android compatibility and round-tripping but is not evaluated by the
web app. `DATA_FORMAT.md` says so. A future feature that uses it needs validation and tests first.

## 4. Follow-up backlog (not approved work)

| Priority | Item                                              | Reason                                                                 |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| 1        | Choose and add `LICENSE`                          | Completes P-19/A-19.                                                   |
| 2        | Decide tracked `node_modules`                     | Removes a persistent onboarding and dependency-drift trap.             |
| 3        | Re-audit when upstream fixes ship                 | CI audit is red today; do not weaken it.                               |
| 4        | Run the 5-player moderated UAT                    | Completes V-15/A-15.                                                   |
| 5        | Evaluate vendor splitting or a smaller router     | Only way to approach A-07’s 250/80 target.                             |
| 6        | Measure/optimize cold first render at 10k rows    | A-08’s <100 ms target is unmet.                                        |
| 7        | Publish a formal JSON Schema for configs          | R-09, still awaiting approval.                                         |
| 8        | Add backup reminders                              | R-07, still awaiting approval.                                         |
| 9        | Real-device OCR matrix (Tesseract/Paddle)         | Automated tests mock the engine; browser smoke is not a device matrix. |
| 10       | Re-check error-boundary keying if routing changes | Documented assumption.                                                 |

## 5. Bottom line

All approved corrective/preventive work that could be completed from the repository landed and is
covered by tests or recorded browser checks: backup restore, safe delete, config validation,
keyboard access, deduplication, editor structure, cycles, resource cleanup, boolean display,
debounced writes, error handling, dead-code removal, lint/CI, docs, tag, and `dist/` hygiene.
The remaining gaps are either external (dependency advisory database), structural (bundle floor,
cold-load target), or human (licence choice, moderated UAT, node_modules decision). None of them
should be reported as silently “done.”
