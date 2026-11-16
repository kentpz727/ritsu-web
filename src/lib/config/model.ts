// Shared game-config data shapes. Validation (schema.ts) and the config barrel
// (types.ts) both depend on this module, never on each other (P-11).
// All coordinates are normalized 0.0–1.0 so configs are resolution-independent.

export interface OcrRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ConfigFieldType = 'number' | 'text' | 'boolean';
export type ConfigCategory = 'Judgment' | 'Metric' | 'Misc';

export interface ConfigField {
  key: string;
  label: string;
  type?: ConfigFieldType;
  ocrRect?: OcrRect | null;
  /** ARGB int, mirrors Android targetColor for boolean fields */
  targetColor?: number | null;
  /** 0.0–1.0 color-match threshold */
  threshold?: number;
  /** Weight for accuracy calc (e.g. Perfect = 1.0) */
  weight?: number | null;
  /** Marks the miss judgment: excluded from hits in universal accuracy/combo.
      When unset, falls back to key/label containing "miss". */
  isMiss?: boolean;
  shortLabel?: string | null;
}

export interface GameConfigData {
  gameName: string;
  configVersion?: number;
  judgments?: ConfigField[];
  metrics?: ConfigField[];
  misc?: ConfigField[];
  formula?: string | null;
  titleRect?: OcrRect | null;
  scoreRect?: OcrRect | null;
  comboRect?: OcrRect | null;
  accuracyRect?: OcrRect | null;
  difficultyNameRect?: OcrRect | null;
  difficultyValRect?: OcrRect | null;
  rankRect?: OcrRect | null;
  useRankOcr?: boolean;
  useAccuracyOcr?: boolean;
}
