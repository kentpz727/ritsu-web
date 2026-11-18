# Contributing

Thanks for working on Ritsu Web. This is a local-first tracker; correctness of stored scores and
backups matters more than new surface area. Keep changes small, provable, and consistent with the
existing structure.

## Setup

```bash
git clone <repository-url>
cd ritsu-web
npm ci
npm run dev
```

Node 24 and npm 11 match CI. See [README.md](README.md) for scripts and browser requirements.

> `node_modules` still contains a small tracked subset from the prototype. Do not commit changes
> under `node_modules`; whether it stays tracked is an open repository-hygiene decision.

## Ground rules

1. **Preserve behavior unless the change is the point.** No gameplay, scoring, timing, chart, or
   save-format changes as a side effect of a refactor.
2. **Prove data changes.** A change to stored data needs a migration and fixtures/tests that read
   the old format. Never destroy user scores silently.
3. **Do not weaken tests.** Do not skip, delete, or relax an assertion to get green. If a test is
   wrong, explain why in the pull request and replace it with a stronger one.
4. **One logical change per commit.** Keep refactors and fixes separate.
5. **No new dependency without a reason.** Prefer platform APIs and the existing stack. Upgrade
   one package at a time and run the full check list afterwards.
6. **No gameplay timers.** `setTimeout`/`setInterval` are for UI concerns only (toast dismissal,
   URL revocation, debounced config writes), never for input or frame logic.
7. **Keep routes lazy.** Do not import a page or an OCR engine from the entry path. The bundle
   guard enforces this.
8. **Keep modules flat.** New components go directly under `src/components/`; new helpers under
   `src/lib/`. Do not introduce feature folders without agreement.

## Required checks

Run these before opening a pull request:

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

CI runs the same commands in separate jobs, plus:

```bash
npm audit --audit-level=high
```

High or critical advisories block the audit job. If an advisory has no fixed release in the
current major line, report it; do not lower the audit level or add an ignore without approval.

## Commit messages

Use a type prefix and, when the work maps to a maintenance item, its id:

```text
<type>(<P-xx|R-xx>): <summary>
```

Allowed types: `fix`, `adapt`, `perf`, `refactor`, `test`, `docs`, `chore`.

Examples:

```text
fix(P-13): render unrecorded booleans as an em dash
perf(P-07): lazy-load routes and guard the bundle budget
docs(P-19): document setup, architecture, and data formats
```

In the body, state the evidence and the checks you actually ran. Do not claim measurements you
did not take.

## Code conventions

- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`. Keep it that way.
- Relative imports include the `.ts`/`.tsx` extension (`allowImportingTsExtensions`).
- Prefer pure helpers in `src/lib/` and thin components. If logic needs a test, it probably
  belongs in `lib`.
- Coerce numeric input at data boundaries (see `src/lib/numbers.ts`) so `NaN` never reaches the
  DB or a chart.
- Use the shared toast/live region for user-facing errors. Do not add `alert()`.
- Keep `BoxEditorPage` under 250 lines (CI enforces it). Put state and commands in
  `useBoxEditor`, drawing in `BoxCanvas`, and field UI in `FieldPanel`.
- Shared score form fields belong in `ScoreFormFields`; do not duplicate the manual/edit form.
- Format with Prettier. The maintenance scope only reformats touched files;
  `src/**` is intentionally in `.prettierignore` for the legacy tree, so run
  `npx prettier --write <file>` on files you change.

## Adding or changing a route

1. Add the page under `src/pages/`.
2. Import it with `React.lazy` in `src/app.tsx` and add the route under the `Layout` route.
3. Add navigation only if the page belongs in the top bar or bottom nav; keep labels truthful
   (local-only lists are “local rankings”, not a shared leaderboard).
4. Run the bundle guard; a new route must not pull OCR or chart code into the entry chunk.

## Changing config semantics

Config shapes live in `src/lib/config/model.ts`; validation/normalization lives in
`schema.ts`; presentation helpers live in `types.ts`.

- Add a field to `model.ts` and to the zod schema together.
- Structural errors reject with dotted paths; right-typed out-of-range values clamp with warnings.
- Update `DATA_FORMAT.md` and add a validation test in `tests/config/`.
- Keep Android-compatible behavior unless the change is explicitly a break.

## Changing the database or backup format

- Update `src/lib/db/dexie.ts` and bump the Dexie schema version if object stores/indexes change.
  Add an upgrade path that preserves existing rows.
- Keep the Android/legacy import path working, or document the break and provide a migration.
- Add or update fixtures that read an old-format payload before changing the writer.
- Update `DATA_FORMAT.md` and the golden/DB characterization tests.

## Testing

- Pure logic: `tests/unit/`.
- IndexedDB behavior: `tests/db/` with `fake-indexeddb`.
- Config validation: `tests/config/`.
- Behavior that must not drift: `tests/golden/` and `tests/golden/golden.json`.

When fixing a bug, write a failing test first. If a fix cannot be reproduced, record the attempts
and mark it not reproducible instead of changing code speculatively. The maintenance log records
which validations were automated and which remained manual (for example, real-browser OCR and
moderated usability sessions).

## Documentation and releases

- Update [README.md](README.md) when setup, scripts, or browser requirements change.
- Update [ARCHITECTURE.md](ARCHITECTURE.md) when module boundaries or data flow change.
- Update [DATA_FORMAT.md](DATA_FORMAT.md) for any stored/imported format change.
- Add release notes to [CHANGELOG.md](CHANGELOG.md).
- Releases are annotated tags (`v0.1.0` is the first). Do not commit `dist/`; it is generated and
  ignored.

## Licence

No licence has been chosen yet. Until the project owner adds one, do not assume the code may be
reused or redistributed outside this project.
