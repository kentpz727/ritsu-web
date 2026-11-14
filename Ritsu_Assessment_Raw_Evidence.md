# Ritsu Assessment — Raw Evidence Log

Companion file to `Ritsu_Software_Maintenance_Assessment.md`.
All commands below were executed in `C:\Projects\ritsu-web` on 2026-11-13/14.
Outputs are reproduced verbatim except: (a) ANSI colour codes removed, (b) long JSON
trimmed where marked, (c) repeated blank lines collapsed. Nothing was edited in source.

> Note: the attached template PDF (`RITSU_Software_Maintenance_Assessment_Report.pdf`)
> could not be parsed by the model (`this model does not support pdf input`). The
> report follows the full template supplied in the task text.

---

## R-00 Environment

```text
PS> node -v
v24.20.0
PS> npm -v
11.19.0
PS> git --version
git version 2.55.0.windows.5
PS> node -e "console.log('lockfileVersion', require('./package-lock.json').lockfileVersion)"
lockfileVersion 3
```

## R-01 Repository tree (node_modules, dist, .git excluded)

```text
public
  favicon.svg
  icons.svg
src
  assets
    hero.png
    typescript.svg
    vite.svg
  components
    debug.tsx
    detail.tsx
    EditScore.tsx
    gameIcon.tsx
    Layout.tsx
    ManualEntry.tsx
    scores.tsx
    useScoreForm.ts
  lib
    calc
      dates.ts
      scoring.ts
    config
      types.ts
    db
      dexie.ts
    ocr
      bench.ts
      client.ts
      fuzzy.ts
      image.ts
      paddle.ts
    numbers.ts
    pasteBus.ts
  pages
    BoxEditorPage.tsx
    ChartDetailsPage.tsx
    ConfigsPage.tsx
    DataPage.tsx
    DebugPage.tsx
    GameDetailsPage.tsx
    ImportPage.tsx
    ScoresPage.tsx
  app.tsx
  index.css
  main.tsx
.gitignore
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
```

No `README.md`, `docs/`, `CHANGELOG`, `LICENSE`, `.env.example`, `.github/`,
ESLint/Prettier config, or test config exists in the working tree.

## R-02 Lines of code (cloc unavailable; PowerShell equivalent used)

```text
PS> cloc --version
cloc : The term 'cloc' is not recognized as the name of a cmdlet, function, script file, or operable program.
EXIT: 0   (PowerShell reports 0 because the error is non-terminating; command unavailable)

PS> TS/TSX FILES: 29
PS> TS/TSX FULL LINES: 4564
PS> CSS FULL LINES: 154
PS> SRC FULL LINES: 4818

src\components : 8 files, 1341 lines
src\pages      : 8 files, 1664 lines
src\lib        : 2 files, 87 lines
src\lib\calc   : 2 files, 118 lines
src\lib\config : 1 file, 222 lines
src\lib\db     : 1 file, 336 lines
src\lib\ocr    : 5 files, 757 lines
TSX: 17
TS: 12
```

Top 15 source files by total lines:

```text
  557 src\pages\BoxEditorPage.tsx
  362 src\components\detail.tsx
  349 src\pages\DataPage.tsx
  342 src\lib\ocr\bench.ts
  336 src\lib\db\dexie.ts
  331 src\pages\ImportPage.tsx
  241 src\components\debug.tsx
  222 src\lib\config\types.ts
  209 src\components\useScoreForm.ts
  181 src\lib\ocr\image.ts
  160 src\pages\ConfigsPage.tsx
  154 src\index.css
  152 src\components\ManualEntry.tsx
  152 src\components\EditScore.tsx
   98 src\assets\hero.png   (binary; Get-Content line count is not meaningful)
```

## R-03 Manifest (package.json, numbered)

```text
  1: {
  2:   "name": "ritsu-web-app",
  3:   "private": true,
  4:   "version": "0.0.0",
  5:   "type": "module",
  6:   "scripts": {
  7:     "dev": "vite",
  8:     "build": "tsc && vite build",
  9:     "preview": "vite preview"
 10:   },
 11:   "devDependencies": {
 12:     "@types/papaparse": "^5.5.2",
 13:     "@types/react": "^19.3.0",
 14:     "@types/react-dom": "^19.3.0",
 15:     "@vitejs/plugin-react": "^6.1.1",
 16:     "typescript": "~6.0.2",
 17:     "vite": "^8.3.0"
 18:   },
 19:   "dependencies": {
 20:     "@paddleocr/paddleocr-js": "^0.4.2",
 21:     "dexie": "^4.4.6",
 22:     "dexie-react-hooks": "^4.4.0",
 23:     "papaparse": "^5.7.0",
 24:     "react": "^19.3.0",
 25:     "react-dom": "^19.3.0",
 26:     "react-router-dom": "^7.18.4",
 27:     "tesseract.js": "^7.0.0",
 28:     "zod": "^4.6.5"
 29:   }
 30: }
```

Resolved lockfile versions:

```text
react 19.3.0
react-dom 19.3.0
react-router-dom 7.18.4
dexie 4.4.6
dexie-react-hooks 4.4.0
tesseract.js 7.0.0
zod 4.6.5
papaparse 5.7.0
@paddleocr/paddleocr-js 0.4.2
vite 8.3.0
typescript 6.0.3
@vitejs/plugin-react 6.1.1
@techstark/opencv-js 4.10.0-release.1
onnxruntime-web 1.30.0
```

## R-04 Docs / CI / licence presence

```text
PS> Test-Path README.md
False
PS> Test-Path LICENSE
False
PS> Test-Path .env.example
False
PS> Test-Path .github
False
PS> Test-Path eslint.config.js
False
PS> Test-Path .prettierrc
False

--- CI ---
NO .github/workflows directory
```

README existed until commit `64c3a235` and was deleted:

```text
PS> git show 64c3a235 -- README.md
commit 64c3a2352419ff144b84470d8a16c5b3a4e0b639
Author: Nash <nash.azarcon@carsu.edu.ph>
Date:   Thu Sep 24 09:14:40 2026 +0800

    kapow

diff --git a/README.md b/README.md
deleted file mode 100644
index 061e20fb..00000000
--- a/README.md
+++ /dev/null
@@ -1,2 +0,0 @@
-# ritsu-web
-A rhythm game stats tracker on web.
```

## R-05 Git history

```text
PS> git log --oneline --all
64c3a235 kapow
6bf8c05e HI
51202ea6 Refactor project structure: migrate index.jsx to index.tsx, add TypeScript support, and update dependencies
71a1ccb4 Remove node_modules from tracking
0c9c4a11 Switched over from Parcel to Vite
43906e38 Refactor index.html
cc318fd5 Sync desktop-ui with main
af5f429e Remove parcel cache and vscode files
5204a26e Merge remote main into main
d8ea5899 Merge desktop-ui into main
ccd1e1d3 Deleted .parcel-cache files from the repository to reduce clutter
43f09a46 Add .parcel-cache and .vscode to .gitignore
da25eefb Adjusted folders structure
7eaec478 Refactor index.html to dynamically load .jsx files based on query parameters; add .keep files to backend and frontend directories
94a45a30 Update title in index.html to reflect project branding
eb41709d Update title in index.html to reflect project branding
594623af Setup Material theming
993e31b0 Setup Material theming
40687c9c Set up initial React application structure with Parcel bundler
52ac0b77 Set up initial React application structure with Parcel bundler
7068be6a Boilerplate and React setup
3d3a2bde Boilerplate and React setup
7d0d8dcc Initial commit
88304d80 Initial commit

PS> git shortlog -sne --all
    22  kentpz727 <kentdave.andres@carsu.edu.ph>
     2  Nash <nash.azarcon@carsu.edu.ph>

PS> git rev-list --count HEAD
19

First commit: 2026-08-12 20:02:22 +0800
Last commit:  2026-09-24 09:14:40 +0800

PS> git tag
(no tags)

PS> git branch -a
* main
  test
  remotes/origin/HEAD -> origin/main
  remotes/origin/desktop-ui
  remotes/origin/main
```

Whole current `src/` tree was added in one commit:

```text
PS> git log --format=%h -- src | Measure-Object
Count: 1

PS> git show --stat --oneline HEAD -- src
64c3a235 kapow
 ... (33 files)
 33 files changed, 4720 insertions(+)

PS> git log --oneline --diff-filter=A -- src/app.tsx
64c3a235 kapow
```

Churn outside `src/` (all history, node_modules excluded from grouping output):

```text
Count Name
   11 package.json
   10 index.html
    9 dist/ritsu-web.2002cba6.js.map
    9 .parcel-cache/lock.mdb
    9 dist/ritsu-web.2002cba6.js
    9 dist/index.html
    8 package-lock.json
    7 index.jsx
    5 dist/ritsu-web.3a01df49.css
```

Build artifact tracked despite `.gitignore`:

```text
.gitignore:11  dist

PS> git ls-files dist
dist/index.html

PS> git status --porcelain   (after `npm run build`, before restore)
 M dist/index.html
```

`dist/index.html` was restored with `git checkout -- dist/index.html`; final status clean.

## R-06 Build

```text
PS> npm run build
> ritsu-web-app@0.0.0 build
> tsc && vite build

vite v8.3.0 building client environment for production...
transforming...
[plugin rolldown:vite-resolve] Module "fs" has been externalized for browser compatibility,
  imported by ".../@techstark/opencv-js/dist/opencv.js".
[plugin rolldown:vite-resolve] Module "path" has been externalized for browser compatibility,
  imported by ".../@techstark/opencv-js/dist/opencv.js".
[plugin rolldown:vite-resolve] Module "crypto" has been externalized for browser compatibility,
  imported by ".../@techstark/opencv-js/dist/opencv.js".
✓ 82 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                             0.84 kB │ gzip:     0.47 kB
dist/assets/worker-entry-C9UNuyOJ-EhIzhVdm.js          11,341.48 kB
dist/assets/ort-wasm-simd-threaded.jsep-MDYUKy93.wasm  28,312.02 kB │ gzip: 6,804.65 kB
dist/assets/index-DKoxzGEm.css                              6.18 kB │ gzip:     1.89 kB
dist/assets/paddle-BgHoqeK2.js                              0.98 kB │ gzip:     0.59 kB
dist/assets/ort.bundle.min-CUWLqu2r.js                    403.10 kB │ gzip:   109.02 kB
dist/assets/index-C_3bjGQV.js                             474.00 kB │ gzip:   148.59 kB
dist/assets/dist-DKOZvoWR.js                           10,476.36 kB │ gzip: 3,459.56 kB

(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.85s
npm notice New major version of npm available: 11.19.0 -> 12.2.2
```

Exit code 0. First-OCR-path artifact sum: 11,341.48 + 28,312.02 + 403.10 + 10,476.36 = 50,532.96 kB (≈50.5 MB uncompressed). Initial app chunk: 474.00 kB (148.59 kB gzip).

## R-07 Tests

```text
PS> Get-ChildItem -Recurse -File -Path src | Where-Object { $_.Name -match '\.(test|spec)\.(ts|tsx|js|jsx)$' }
(no output)
COUNT: 0

PS> npm test
npm error Missing script: "test"
EXIT: 1
```

No `vitest`, `jest`, `playwright`, or `cypress` entry in `package.json` (R-03).

## R-08 Lint / format

```text
PS> npm run lint
npm error Missing script: "lint"
npm error Did you mean this?
npm error   npm link # Symlink a package folder
EXIT: 1

No eslint/prettier config found by recursive search (R-04).
```

## R-09 Dependency audit

```text
PS> npm audit --json
{
  "vulnerabilities": {
    "source-map-js": { "severity": "high", "isDirect": false, "range": "1.0.0 - 1.2.1" },
    "vite":          { "severity": "high", "isDirect": true,  "range": "8.3.0 - 8.3.2" },
    "zod":           { "severity": "high", "isDirect": true,  "range": "<4.6.6" }
  },
  "metadata": {
    "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 3, "critical": 0, "total": 3 },
    "dependencies": { "prod": 48, "dev": 46, "optional": 27, "peer": 0, "total": 93 }
  }
}
EXIT: 1
```

Advisory titles (trimmed):

```text
source-map-js  GHSA-68fv-2mgg-jv7q  event-loop denial of service (CVSS 7.5)
vite           GHSA-698v-4r3x-3vcv  launch-editor escapeCmdArgs() omits % escaping on Windows
vite           GHSA-r825-w8mm-5pxw  editor CLI flag misinterpretation -> arbitrary command execution
vite           GHSA-587h-7wmj-h5pm  fs.existsSync() existence check bypass on Windows
vite           GHSA-9jrq-w75r-8gcw  cross-origin script execution through custom middleware
vite           GHSA-rq7h-c2jc-7f22  files outside server.fs.allow served on non-Windows
vite           GHSA-vfpm-58rq-9qcg  first 4 bytes outside server.fs exposed by ?vite-wasm-instance
zod            GHSA-mrhx-c7xc-m3w5  memory exhaustion on oversized constrained collections (CVSS 7.5)
```

## R-10 Outdated dependencies

```text
PS> npm outdated
Package               Current  Wanted  Latest  Location
@vitejs/plugin-react    6.1.1   6.3.0   6.3.0  node_modules/@vitejs/plugin-react
dexie                   4.4.6   4.4.7   4.4.7  node_modules/dexie
papaparse               5.7.0   5.7.1   5.7.1  node_modules/papaparse
react                  19.3.0  19.3.1  19.3.1  node_modules/react
react-dom              19.3.0  19.3.1  19.3.1  node_modules/react-dom
react-router-dom       7.18.4  7.18.5  7.18.5  node_modules/react-router-dom
typescript              6.0.3   6.0.3   7.0.2  node_modules/typescript
vite                    8.3.0   8.3.8   8.3.8  node_modules/vite
zod                     4.6.5   4.6.7   4.6.7  node_modules/zod
EXIT: 1
```

9 packages outdated (1 major: TypeScript 6.0.3 -> 7.0.2; 8 patch/minor).

## R-11 Duplication and circular dependencies

```text
PS> npx --yes jscpd@4.0.5 --min-lines 8 --min-tokens 50 --reporters console --format typescript,tsx --ignore "**/node_modules/**,**/dist/**" src

Clone found (javascript):
 - src\components\EditScore.tsx [58:2 - 145:3] (87 lines, 2094 tokens)
   src\components\ManualEntry.tsx [50:3 - 139:2]

Clone found (tsx):
 - src\components\EditScore.tsx [65:9 - 110:7] (45 lines, 1027 tokens)
   src\components\ManualEntry.tsx [53:7 - 98:12]

Clone found (tsx):
 - src\components\EditScore.tsx [120:7 - 134:5] (14 lines, 370 tokens)
   src\components\ManualEntry.tsx [108:12 - 122:2]

Total: 45 files, 5718 lines, 3 clones, 146 duplicated lines (2.55%), 3491 duplicated tokens (3.74%)
EXIT: 0

PS> npx --yes madge@8.0.0 --circular --extensions ts,tsx src
✖ Found 1 circular dependency!
1) components/scores.tsx > components/gameIcon.tsx
EXIT: 1
```

Import lines forming the cycle:

```text
src/components/scores.tsx:4:import { GameIcon } from './gameIcon.tsx';
src/components/gameIcon.tsx:4:import { initials } from './scores.tsx';
```

## R-12 TypeScript strictness / dead code

```text
PS> npx tsc --noEmit --noUnusedLocals --noUnusedParameters
src/components/useScoreForm.ts(46,10): error TS6133: 'cleanNumericInput' is declared but its value is never read.
EXIT: 2
```

Exported-but-unreferenced symbols (grep across `src`):

```text
detail.tsx:104        export function LineChart(...)          -> only definition
scoring.ts:72         export function booleanLabels(...)      -> only definition
client.ts:81          export async function terminateOcr(...)  -> only definition
useScoreForm.ts:46    function cleanNumericInput(...)          -> only definition
```

Unused dependency imports:

```text
papaparse      -> NO IMPORTS FOUND
zod            -> NO IMPORTS FOUND
@paddleocr/paddleocr-js -> used via dynamic import in src/lib/ocr/paddle.ts:23
```

Unused assets (no reference found in `src` or `index.html`):

```text
src/assets/hero.png
src/assets/typescript.svg
src/assets/vite.svg
public/icons.svg
```

## R-13 Phase 1 absence searches (gameplay, audio, input, charts)

```text
PS> git grep -n -E "requestAnimationFrame|cancelAnimationFrame|setInterval|performance\.now|deltaTime|fixed timestep|gameLoop" -- src
(no output)

PS> git grep -n -E "AudioContext|new Audio|HTMLAudioElement|howler|Howl|decodeAudioData|currentTime|latency|calibration|offset" -- src
(no output)

PS> git grep -n -E "addEventListener\('(keydown|keyup|touchstart|touchend|gamepad)|gamepad|KeyboardEvent|keyCode" -- src
(no output)

PS> git grep -n -i -E "beatmap|chart parser|\.osu|mania|note type|hold note|slide note|bpm" -- src
src/pages/BoxEditorPage.tsx:545: placeholder="mania_keys"
(only a UI placeholder string; no parser)

PS> Get-ChildItem -Recurse -File -Path src,public -Include *.mp3,*.ogg,*.wav,*.flac,*.osu,*.sm,*.aff,*.chart
(no output)

AUDIO FILES: 0
CHART/BEATMAP FILES: 0
```

App routes (all tracker pages, no play route):

```text
src/app.tsx:17  <Route index element={<ScoresPage />} />
src/app.tsx:18  <Route path="data" element={<DataPage />} />
src/app.tsx:19  <Route path="chart/:configId/:song/:diff/:val" element={<ChartDetailsPage />} />
src/app.tsx:20  <Route path="game/:configId" element={<GameDetailsPage />} />
src/app.tsx:21  <Route path="configs" element={<ConfigsPage />} />
src/app.tsx:22  <Route path="editor/:configId?" element={<BoxEditorPage />} />
src/app.tsx:23  <Route path="import" element={<ImportPage />} />
src/app.tsx:24  <Route path="debug" element={<DebugPage />} />
```

## R-14 Secrets / URLs / unsafe APIs / logging

```text
PS> git grep -n -E "https?://" -- src index.html
index.html:8   <link rel="preconnect" href="https://fonts.googleapis.com" />
index.html:9   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
index.html:11  href="https://fonts.googleapis.com/css2?family=Poppins...&family=Zen+Maru+Gothic..."

PS> git grep -n -i -E "api[_-]?key|secret|token|password|bearer|sk-[a-z0-9]" -- src
(no output; only false-positive "token" matches in comments about SVG points)

PS> git grep -n -E "innerHTML|dangerouslySetInnerHTML|eval\(|new Function" -- src
(no output)

PS> git grep -n -E "\bfetch\(|XMLHttpRequest|axios" -- src
(no output)

PS> git grep -n "console\.(log|warn|error|debug)" -- src
(no output)

PS> git grep -n "alert(" -- src
src/components/ManualEntry.tsx:41
src/pages/BoxEditorPage.tsx:276,312,352

PS> git grep -n "localStorage" -- src
src/pages/BoxEditorPage.tsx:54,409   (one key: ritsu-lock-others)
```

## R-15 Accessibility checks

```text
PS> git grep -n -E "prefers-reduced-motion|focus-visible" -- src
(no output)

PS> git grep -n -E "aria-|role=|tabIndex" -- src
Layout.tsx:28       aria-label="Primary"
debug.tsx:82        aria-label="PaddleOCR language"
debug.tsx:89        alt="bench input"
detail.tsx:116,308  role="img" aria-label=...
gameIcon.tsx:42,50  alt / aria-hidden
DataPage.tsx:249-278 aria-label on selects/inputs
ImportPage.tsx:226-241 role="button" tabIndex={0} (engine cards)
ImportPage.tsx:255  aria-label="PaddleOCR language"
ImportPage.tsx:269  alt="pasted screenshot"
ScoresPage.tsx:60,66 aria-label="Sort" / "Sort direction"

PS> git grep -n -E "animation|transition|@media" -- src/index.css
src/index.css:54:@media (max-width: 1000px) {
```

Canvas editor input model:

```text
src/pages/BoxEditorPage.tsx:423-431  canvas with onPointerDown/onPointerMove/onPointerUp/onPointerCancel only
src/pages/BoxEditorPage.tsx:415-420  numeric x/y/w/h inputs (partial keyboard alternative)
```

## R-16 Asset inventory

```text
FullName                                        Length
src\assets\hero.png                              13057
src\assets\typescript.svg                         1304
src\assets\vite.svg                               8710
public\favicon.svg                                9522
public\icons.svg                                  5055
TOTAL ASSET BYTES: 37648
ASSET COUNT: 5
AUDIO FILES: 0
CHART/BEATMAP FILES: 0
```

Fonts are loaded from Google Fonts at runtime (`index.html:8-13`); no local font files.

## R-17 Export / import shape evidence

```text
src/lib/db/dexie.ts:223-245  exportToJson() builds { exportTimestamp, scores[] }
                             -> no game configs in the payload
src/lib/db/dexie.ts:271-275  importFromJson(): if configId == null, skip score
src/lib/db/dexie.ts:292      return { imported, skipped: skippedGames.size, ... }
src/pages/DataPage.tsx:236-239 UI message: "(skipped unknown games: ...) — import their configs first."
src/components/debug.tsx:162  config export exists only in Debug DB viewer
```

## R-18 Config / score lifecycle evidence

```text
src/pages/ConfigsPage.tsx:103  <button className="btn" onClick={() => c.id && db.game_configs.delete(c.id)}>Delete</button>
src/lib/db/dexie.ts:114        gameName: gameById.get(score.configId) ?? 'Unknown'
src/lib/db/dexie.ts:68-75      upsertConfig(): updates only when version > existing.configVersion
src/lib/config/types.ts:79-96 parseGameConfig(): only checks gameName; JSON.parse cast; no schema
src/lib/config/types.ts:220    out.misc = out.misc.filter((m) => m.value.toLowerCase() === 'true');
src/lib/ocr/image.ts:62-65     normalizeTitle(): strips all non-letter/number/space characters
src/components/useScoreForm.ts:96  songTitle = normalizeTitle(form.songTitle.trim())
```

## R-19 BoxEditor / OCR resource evidence

```text
src/pages/BoxEditorPage.tsx:557 total lines
src/pages/BoxEditorPage.tsx:11 useState calls, 20 function declarations
src/pages/BoxEditorPage.tsx:79-84   URL.createObjectURL(f), no revoke
src/pages/BoxEditorPage.tsx:102-133 canvas redraw effect with no dependency array
src/pages/BoxEditorPage.tsx:302-321 updateField() persists on each onChange keystroke
src/lib/ocr/bench.ts:42-52          loadImage(): img.onerror = rej, no URL.revokeObjectURL
src/pages/ConfigsPage.tsx:96-102    export creates object URL, no revoke
src/lib/ocr/client.ts:12-20         workerCache map; workers never evicted
src/lib/ocr/client.ts:81-84         terminateOcr() defined but never called
src/lib/ocr/paddle.ts:1-7           "Runs main-thread for the spike (worker setup is a follow-up)"
```

## R-20 Full-table query evidence

```text
src/lib/db/dexie.ts:98-116   fullScores(): Promise.all([all scores, all details, all configs])
src/components/scores.tsx:7-27 useFullScores(): same three toArray() calls
src/pages/DataPage.tsx:59    const all = useFullScores() ?? []
src/components/debug.tsx:125-126 only the Debug tables slice to 100/200 for display
```

## R-21 Config-driven architecture evidence

```text
src/lib/config/types.ts:31-47   GameConfigData: gameName, judgments, metrics, misc, OCR rects
src/lib/config/types.ts:101-124 PRESET_FIELDS / GENERIC_SLOTS
src/lib/config/types.ts:65-77   fieldEntries(): stable "Category:index" keys
src/lib/ocr/bench.ts:139-342    readConfigBoxes(): reads every box the config defines
```

## R-22 Numeric hardening evidence

```text
src/lib/numbers.ts:6-9          finiteOr()
src/lib/numbers.ts:21-31        toGraphPoint() drops non-finite rows
src/lib/db/dexie.ts:80-95       saveFullScore() transaction + finite coercion
src/lib/db/dexie.ts:146-186     repairScores()
src/lib/calc/scoring.ts:24      if (den === 0) return 0;
```

## R-23 Local-first / no account evidence

```text
src/lib/db/dexie.ts:51          super('RitsuDatabase')
src/components/Layout.tsx:19    Account icon: onClick={() => nav('/data')}  (no auth)
No fetch/XHR/axios in src (R-14).
Leaderboard labels are local views:
  src/pages/ChartDetailsPage.tsx:52
  src/pages/DataPage.tsx:331
  src/pages/GameDetailsPage.tsx:57
```

## R-24 Responsive CSS evidence

```text
src/index.css:52    .split { grid-template-columns: 430px 1px 1fr; ... }
src/index.css:54-57 @media (max-width: 1000px) { grid-template-columns: 1fr; divider none }
src/index.css:113-125 .bottomnav fixed, width 416px, max-width calc(100vw - 32px)
```

## R-25 Verification of final citations

```text
PS> git status --porcelain
(no output; working tree clean after restoring tracked dist/index.html)
```

Every path cited in the assessment exists in the repository tree shown in R-01.
The only non-file citations are git commit `64c3a235` and command outputs above.
