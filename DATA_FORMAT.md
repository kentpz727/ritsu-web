# Data format

This document specifies everything Ritsu Web stores or imports: the IndexedDB schema, the JSON
backup envelope, the CSV export, and the per-game config JSON that drives manual entry and OCR.

## IndexedDB schema

Database name: `RitsuDatabase`. Dexie schema version: `1`.

| Table            | Key               | Indexes                                                                                                          |
| ---------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `game_configs`   | `id` (auto)       | `&gameName` (unique)                                                                                             |
| `generic_scores` | `id` (auto)       | `configId`, `songTitle`, `playTimestamp`, `importTimestamp`, `[configId+songTitle+difficultyName+difficultyVal]` |
| `score_details`  | `detailId` (auto) | `scoreId`, `key`                                                                                                 |

The tables mirror the Android Room `ScoreDatabase`, so Android JSON/CSV exports remain
importable.

### `game_configs`

| Field             | Type             | Notes                                                     |
| ----------------- | ---------------- | --------------------------------------------------------- |
| `id`              | number           | Auto-increment primary key                                |
| `gameName`        | string           | Unique; scores resolve their game through this name       |
| `configData`      | string           | Raw `GameConfigData` JSON, exactly as imported/authored   |
| `configVersion`   | number           | Higher versions replace `configData` on upsert            |
| `displayIconName` | string \| null   | Optional original filename                                |
| `displayIcon`     | Blob \| null     | Downscaled PNG logo; unindexed, so no migration is needed |
| `deletedAt`       | number \| null   | Soft-delete timestamp; hidden from active lists           |
| `deletedScoreIds` | number[] \| null | Score ids unlinked by the delete, replayed by undo        |

### `generic_scores`

| Field                 | Type   | Notes                                      |
| --------------------- | ------ | ------------------------------------------ |
| `id`                  | number | Auto-increment primary key                 |
| `configId`            | number | Owning game config; `0` means unlinked     |
| `songTitle`           | string | Normalized chart title                     |
| `difficultyName`      | string | e.g. `Master`                              |
| `difficultyVal`       | string | Display level, e.g. `14+`                  |
| `difficultySortValue` | number | Numeric sort key, e.g. `14.5` for `14+`    |
| `totalScore`          | number | Finite; non-finite input is coerced to `0` |
| `maxCombo`            | number | Finite; non-finite input is coerced to `0` |
| `accuracy`            | number | Percent, `0`–`100`                         |
| `playRank`            | string | e.g. `S+`                                  |
| `playTimestamp`       | number | Epoch milliseconds                         |
| `importTimestamp`     | number | Epoch milliseconds; set at save time       |

### `score_details`

| Field      | Type   | Notes                                              |
| ---------- | ------ | -------------------------------------------------- |
| `detailId` | number | Auto-increment primary key                         |
| `scoreId`  | number | Parent score                                       |
| `key`      | string | Config field key, e.g. `perfect`                   |
| `value`    | string | Stored as text (`"true"` / `"false"` for booleans) |
| `category` | string | `Judgment`, `Metric`, or `Misc`                    |

Details whose key is no longer in the game's config are hidden on screen but not deleted. Unknown
configs show raw stored values.

## Soft delete and relinking

Deleting a game config is persistent, not immediate destruction:

1. `softDeleteConfig(id)` marks the row with `deletedAt`, records its score ids in
   `deletedScoreIds`, and moves those scores to `configId = 0` (the unlinked sentinel) in one
   transaction.
2. The config disappears from active lists; its scores still exist but show as unlinked/unknown.
3. `restoreConfig(id)` moves the recorded score ids back and clears the delete fields.
4. Importing or re-creating a config with the same `gameName` also reactivates the soft-deleted
   row and relinks its scores, so a backup restore recovers the original relationships.

Hard-deleting a config from the Debug page removes only the config row; its scores remain in the
database and display as unknown. Scores are not silently destroyed by a config deletion.

## Deduplication

A score is the same play when **game config, song title, difficulty name, difficulty value, and
play timestamp** all match. `saveFullScore` looks this up through the composite index and returns
the existing row with `duplicate: true` instead of inserting another row. Imports report both
`imported` and `duplicates` counts.

## JSON backup format

Export produces a `schemaVersion: 2` envelope. Version 2 adds `gameConfigs[]`, so a backup can
restore on a fresh browser profile where no configs exist yet.

```json
{
  "schemaVersion": 2,
  "exportTimestamp": 1760000000000,
  "gameConfigs": [
    {
      "gameName": "Example Game",
      "configData": "{\"gameName\":\"Example Game\",\"configVersion\":1,\"judgments\":[]}",
      "configVersion": 1
    }
  ],
  "scores": [
    {
      "genericScore": {
        "songTitle": "Song Name",
        "difficultyName": "Master",
        "difficultyVal": "14+",
        "difficultySortValue": 14.5,
        "totalScore": 1000000,
        "maxCombo": 1200,
        "accuracy": 99.12,
        "playRank": "S+",
        "playTimestamp": 1759990000000,
        "importTimestamp": 1760000000000
      },
      "details": [
        { "key": "perfect", "value": "1100", "category": "Judgment" },
        { "key": "fullCombo", "value": "true", "category": "Misc" }
      ],
      "gameName": "Example Game"
    }
  ]
}
```

### Import rules

- The payload must have a `scores` array; otherwise the import fails with
  `Invalid Ritsu JSON export`.
- `gameConfigs` are processed first. A config without a non-empty `gameName` or `configData` is
  skipped. Its version defaults to `1`.
- A score resolves its game by exact `gameName` against active configs. If no config matches,
  the score is **skipped**, never stub-created (Android parity). Skipped game names are reported.
- Legacy flat web exports (score columns at the top level plus `gameName`/`details`) are still
  accepted.
- Numeric fields are coerced; missing titles/difficulties become `Unknown`, missing play time
  becomes the import time.
- Duplicate scores are counted and skipped as described above.

## CSV export

CSV is export-only. The header is:

```text
Game,Date,Song,Difficulty,Level,Score,Combo,Accuracy,Rank,Details
```

- `Date` is local time formatted `yyyy-MM-dd HH:mm:ss`.
- `Accuracy` is written with a `%` suffix.
- `Details` is `key: value; key: value; …`.
- Every data cell is quoted; embedded quotes are doubled. The header line is written as-is.
- The separator is `,` and lines end with `\n`.

## Game config JSON

A config declares a game's judgments, metrics, screenshot boxes, and OCR switches. Configs are
validated with zod on import and on save.

### Top-level shape

| Field                | Type              | Required | Meaning                                                             |
| -------------------- | ----------------- | -------- | ------------------------------------------------------------------- |
| `gameName`           | string            | yes      | Unique game name; scores resolve through it                         |
| `configVersion`      | integer           | no       | Higher versions replace older `configData`                          |
| `judgments`          | `ConfigField[]`   | no       | Counted fields used for notes, combo fallback, and accuracy         |
| `metrics`            | `ConfigField[]`   | no       | Numeric/text metrics such as Fast, Slow, Max Combo                  |
| `misc`               | `ConfigField[]`   | no       | Extra fields; `boolean` type uses color detection                   |
| `formula`            | string \| null    | no       | Preserved for Android compatibility; not interpreted by the web app |
| `titleRect`          | `OcrRect` \| null | no       | Screenshot box for the song title                                   |
| `scoreRect`          | `OcrRect` \| null | no       | Box for the total score                                             |
| `comboRect`          | `OcrRect` \| null | no       | Box for max combo; when absent, non-miss judgments are summed       |
| `accuracyRect`       | `OcrRect` \| null | no       | Box for accuracy; when absent, accuracy is weighted                 |
| `difficultyNameRect` | `OcrRect` \| null | no       | Box for the difficulty name                                         |
| `difficultyValRect`  | `OcrRect` \| null | no       | Box for the level value                                             |
| `rankRect`           | `OcrRect` \| null | no       | Box for the score rank                                              |
| `useRankOcr`         | boolean           | no       | Enables rank display when no `rankRect` exists                      |
| `useAccuracyOcr`     | boolean           | no       | Enables accuracy display when no box/judgments exist                |

### Field shape

| Field         | Type                            | Meaning                                                                 |
| ------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `key`         | string                          | Stable detail key; must be non-empty                                    |
| `label`       | string                          | Display label; defaults to `key` with a warning                         |
| `type`        | `number` \| `text` \| `boolean` | OCR/entry type; absent means `number` for OCR purposes                  |
| `ocrRect`     | `OcrRect` \| null               | Box for this field in screenshots                                       |
| `targetColor` | integer \| null                 | Android ARGB color for boolean detection (signed or unsigned accepted)  |
| `threshold`   | number \| null                  | 0–1 color-match distance; clamped                                       |
| `weight`      | number \| null                  | 0–1 accuracy weight; clamped                                            |
| `isMiss`      | boolean \| null                 | Explicit miss flag; otherwise `key`/`label` containing “miss” is a miss |
| `shortLabel`  | string \| null                  | Compact label for dense tables                                          |

### Box coordinates

`OcrRect` is `{ "x": number, "y": number, "w": number, "h": number }` in **normalized 0.0–1.0
coordinates**, relative to the screenshot:

- `x`, `y` are the top-left corner as a fraction of image width/height.
- `w`, `h` are width/height fractions.
- Coordinates are resolution-independent; the same config works at any screenshot size.
- Validation clamps each value to 0–1 and reduces `w`/`h` so `x + w <= 1` and `y + h <= 1`,
  reporting warnings. Malformed rects (missing/non-numeric members) are structural errors.

```json
{
  "x": 0.12,
  "y": 0.72,
  "w": 0.2,
  "h": 0.06
}
```

The box editor (`#/editor/:configId?`) draws these boxes over a screenshot. Pointer drag and
keyboard edits share the same draft; **Save rect** persists the selection.

### Validation behavior

`validateGameConfigJson` / `validateGameConfigObject` return:

- `config`: the normalized config, or `null` when a structural error exists.
- `errors`: dotted paths such as `judgments[0].weight` or `misc[1].type`.
- `warnings`: safe repairs such as clamped geometry or a missing label.

Structural problems (wrong types, empty field keys, unknown field types, malformed rects) reject
the config. Right-typed but out-of-range values are clamped and reported. This lets
hand-authored configs load without giving canvas/OCR code invalid geometry.

### Example config

```json
{
  "gameName": "Example Game",
  "configVersion": 1,
  "judgments": [
    { "key": "perfect", "label": "Perfect", "type": "number", "weight": 1.0, "shortLabel": "PF" },
    { "key": "great", "label": "Great", "type": "number", "weight": 0.3333, "shortLabel": "GR" },
    { "key": "miss", "label": "Miss", "type": "number", "weight": 0, "isMiss": true, "shortLabel": "MISS" }
  ],
  "metrics": [{ "key": "fast", "label": "Fast", "type": "number" }],
  "misc": [{ "key": "fullCombo", "label": "Full Combo", "type": "boolean", "targetColor": -65536, "threshold": 0.1 }],
  "titleRect": { "x": 0.08, "y": 0.1, "w": 0.5, "h": 0.08 },
  "scoreRect": { "x": 0.55, "y": 0.72, "w": 0.2, "h": 0.07 },
  "difficultyNameRect": { "x": 0.08, "y": 0.2, "w": 0.2, "h": 0.06 },
  "difficultyValRect": { "x": 0.3, "y": 0.2, "w": 0.1, "h": 0.06 },
  "rankRect": { "x": 0.78, "y": 0.72, "w": 0.1, "h": 0.07 },
  "useRankOcr": true,
  "useAccuracyOcr": false
}
```

## OCR box semantics

For each configured box, the pipeline crops the normalized rect (with a small edge padding for
OCR), preprocesses it, and reads text. The following rules define what a raw read becomes.

### Titles

- Symbols are removed; letters, numbers, and spaces remain.
- When Latin and CJK letters are mixed, the minority script is dropped; ties keep everything.
- Whitespace is collapsed.
- Example: `Heaven's Rave` → `Heavens Rave`.
- A near-match (similarity ≥ 0.6) against titles already stored for that game replaces the raw
  read with the known spelling.

### Scores

- Non-digits are removed; leading zeros are dropped.
- `007` → `7`; `0` → `0`.

### Levels

- A leading `Lv.` / `Lvl.` prefix is removed.
- The first integer is kept; everything after it is dropped.
- Example: `Master 14+` → `14`; `4.23` → `4`; `Lv.29` → `29`.
- `difficultySortValue` is computed from the **raw** read by concatenating digit and dot
  characters and adding `0.5` when the raw text contains `+`. Thus `14+` sorts as `14.5`.
  Because dots are kept, a raw `Lv. 14+` concatenates to `.14` and sorts as `0.64`; this is
  Android-parity behavior preserved for compatibility.

### Ranks

- Non-letters are removed; the result is uppercased.
- Near-matches (≥ 0.6) snap to the game's known ranks or the generic set (`SSS+`, `SSS`, `SS+`,
  `SS`, `S+`, `S`, `A+`, `A`, `B+`, `B`, `C`, `D`, `E`, `F`).
- Example: `5` can snap to `S`; `S+` stays `S+`.

### Booleans

- Boolean fields are not OCR'd. Their box is color-matched against `targetColor` using Euclidean
  RGB distance normalized by 441.67 (the maximum RGB distance).
- A pixel counts as a hit when its distance is below `threshold`.
- The field is `true` when more than 10% of pixels hit.
- No `targetColor` means the field is skipped and reported as skipped, never guessed.

### Auto-derived values

- **Combo:** `comboRect` wins. Without it, combo is the sum of all judgments that are not marked
  as miss.
- **Accuracy:** `accuracyRect` wins. Without it, accuracy is
  `Σ(count × weight) ÷ Σ(count) × 100` across configured judgments. Misses are included in the
  denominator with weight 0.
- **Title:** `titleRect` wins. Without it, the screenshot filename is used.
- **Missing required fields:** if a configured title/score/level/rank box reads nothing, the score
  is staged for review instead of auto-saved.
