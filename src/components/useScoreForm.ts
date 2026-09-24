import { useMemo, useState } from 'react';
import { hasSlot, isAccuracyEnabled, isRankEnabled, type GameConfigData } from '../lib/config/types.ts';
import { fromLocalInputValue, toLocalInputValue } from '../lib/calc/dates.ts';
import { calculateAccuracy, parseDifficultySort, universalCombo } from '../lib/calc/scoring.ts';
import { normalizeLevel, normalizeRank, normalizeScore, normalizeTitle, stripLeadingZeros } from '../lib/ocr/image.ts';

export interface ScoreFormState {
  songTitle: string;
  difficultyName: string;
  difficultyVal: string;
  totalScore: string;
  maxCombo: string;
  accuracy: string;
  playRank: string;
}

export interface ScoreFormInitial extends Partial<ScoreFormState> {
  playedAt?: number;
  dyn?: Record<string, string>;
}

export interface CollectedScore {
  songTitle: string;
  difficultyName: string;
  difficultyVal: string;
  difficultySortValue: number;
  totalScore: number;
  maxCombo: number;
  accuracy: number;
  playRank: string;
  playTimestamp: number;
  details: Array<{ key: string; value: string; category: string }>;
}

const EMPTY_FORM: ScoreFormState = {
  songTitle: '',
  difficultyName: '',
  difficultyVal: '1',
  totalScore: '',
  maxCombo: '',
  accuracy: '',
  playRank: 'S',
};

/** Numeric text cleaned xxx-only ("007" -> "7"); non-numeric text untouched. */
function cleanNumericInput(v: string): string {
  const t = v.trim();
  if (t === '' || !/^[0-9.]+$/.test(t)) return t;
  return stripLeadingZeros(t);
}

/**
 * Shared state + validation for every score write path (manual entry, edit).
 * Invalid input never saves: collect() returns per-field errors instead.
 */
export function useScoreForm(config: GameConfigData | null, initial?: ScoreFormInitial) {
  const [form, setForm] = useState<ScoreFormState>({ ...EMPTY_FORM, ...pickForm(initial) });
  const [dyn, setDyn] = useState<Record<string, string>>({ ...(initial?.dyn ?? {}) });
  const [playedAt, setPlayedAt] = useState(() =>
    initial?.playedAt != null ? toLocalInputValue(initial.playedAt) : toLocalInputValue(Date.now()),
  );

  const showDiffName = hasSlot(config, 'difficultyNameRect');
  const showLevel = hasSlot(config, 'difficultyValRect');
  const showScore = hasSlot(config, 'scoreRect');
  const showCombo = hasSlot(config, 'comboRect');
  const showAccuracy = isAccuracyEnabled(config);
  const showRank = isRankEnabled(config);
  // No visible accuracy in the screenshot: derive it from the judgments.
  const computedMode = !!config && !config.useAccuracyOcr && !config.accuracyRect;
  const judgmentVals = useMemo(() => {
    const vals: Record<string, number> = {};
    for (const j of config?.judgments ?? []) vals[j.key] = Number(dyn[j.key]) || 0;
    return vals;
  }, [config, dyn]);
  const computedAccuracy = useMemo(() => {
    if (!computedMode || !config || !(config.judgments?.length)) return null;
    return calculateAccuracy(judgmentVals, config);
  }, [computedMode, config, judgmentVals]);
  // No combo box on screen: combo falls back to hits (all judgments except miss).
  const comboFallback = !!config && !hasSlot(config, 'comboRect');
  const fallbackCombo = useMemo(() => {
    if (!comboFallback || !config) return null;
    return universalCombo(config, judgmentVals);
  }, [comboFallback, config, judgmentVals]);

  function reset(next?: ScoreFormInitial) {
    setForm({ ...EMPTY_FORM, ...pickForm(next) });
    setDyn({ ...(next?.dyn ?? {}) });
    setPlayedAt(next?.playedAt != null ? toLocalInputValue(next.playedAt) : toLocalInputValue(Date.now()));
  }

  function collect(): { errors: Record<string, string>; collected: CollectedScore | null } {
    const errors: Record<string, string> = {};
    // Titles carry no symbols and keep the majority script only.
    const songTitle = normalizeTitle(form.songTitle.trim());
    if (!songTitle) errors.songTitle = 'Song title is required.';

    let difficultyVal = form.difficultyVal;
    if (showLevel) {
      difficultyVal = normalizeLevel(form.difficultyVal);
      if (!difficultyVal) errors.difficultyVal = 'Level must contain a number.';
    }

    let totalScore = 0;
    if (showScore) {
      if (!/[0-9]/.test(form.totalScore)) errors.totalScore = 'Score must contain digits.';
      else totalScore = Number(normalizeScore(form.totalScore)) || 0;
    }

    let maxCombo = 0;
    if (showCombo && !comboFallback) {
      if (!/[0-9]/.test(form.maxCombo)) errors.maxCombo = 'Combo must contain digits.';
      else maxCombo = Number(normalizeScore(form.maxCombo)) || 0;
    } else if (comboFallback && fallbackCombo != null) {
      maxCombo = fallbackCombo;
    }

    let accuracy = 0;
    if (showAccuracy && !computedMode) {
      const n = Number(form.accuracy);
      if (!Number.isFinite(n) || n < 0 || n > 100) errors.accuracy = 'Accuracy must be a number 0–100.';
      else accuracy = n;
    } else if (computedMode && computedAccuracy != null) {
      accuracy = computedAccuracy;
    }

    let playRank = '';
    if (showRank) {
      playRank = normalizeRank(form.playRank);
      if (!playRank) errors.playRank = 'Rank must be letters (e.g. S, A, B).';
    }

    const playTimestamp = fromLocalInputValue(playedAt);
    if (playTimestamp == null) errors.playedAt = 'Pick a valid date and time.';

    const details: Array<{ key: string; value: string; category: string }> = [];
    if (config) {
      const checkNumeric = (key: string, label: string, raw: string): string | null => {
        const t = raw.trim();
        if (t === '') return null;
        if (!/^[0-9.]+$/.test(t) || !Number.isFinite(Number(t))) {
          errors[`dyn:${key}`] = `${label} must be a number.`;
          return null;
        }
        return stripLeadingZeros(t);
      };
      for (const f of config.judgments ?? []) {
        const v = (dyn[f.key] ?? '').trim();
        if (!v) continue;
        if (f.type === 'text') {
          details.push({ key: f.key, value: v, category: 'Judgment' });
          continue;
        }
        const cleaned = checkNumeric(f.key, f.label, v);
        if (cleaned) details.push({ key: f.key, value: cleaned, category: 'Judgment' });
      }
      for (const f of config.metrics ?? []) {
        const v = (dyn[f.key] ?? '').trim();
        if (!v) continue;
        if (f.type === 'text') details.push({ key: f.key, value: v, category: 'Metric' });
        else {
          const cleaned = checkNumeric(f.key, f.label, v);
          if (cleaned) details.push({ key: f.key, value: cleaned, category: 'Metric' });
        }
      }
      for (const f of config.misc ?? []) {
        const v = (dyn[f.key] ?? '').trim();
        if (!v) continue;
        if (f.type === 'boolean') details.push({ key: f.key, value: v === 'true' ? 'true' : 'false', category: 'Misc' });
        else if (f.type === 'number') {
          const cleaned = checkNumeric(f.key, f.label, v);
          if (cleaned) details.push({ key: f.key, value: cleaned, category: 'Misc' });
        } else details.push({ key: f.key, value: v, category: 'Misc' });
      }
    }

    if (Object.keys(errors).length > 0) return { errors, collected: null };
    return {
      errors,
      collected: {
        songTitle,
        difficultyName: form.difficultyName.trim() || 'Unknown',
        difficultyVal,
        // Sort from the TYPED text so "14+" keeps Android's 0.5 bonus.
        difficultySortValue: parseDifficultySort(form.difficultyVal),
        totalScore,
        maxCombo,
        accuracy,
        playRank,
        playTimestamp: playTimestamp ?? Date.now(),
        details,
      },
    };
  }

  return {
    form, setForm, dyn, setDyn, playedAt, setPlayedAt,
    showDiffName, showLevel, showScore, showCombo, showAccuracy, showRank,
    computedMode, computedAccuracy, comboFallback, fallbackCombo,
    reset, collect,
  };
}

function pickForm(initial?: ScoreFormInitial): Partial<ScoreFormState> {
  if (!initial) return {};
  const { playedAt: _p, dyn: _d, ...rest } = initial;
  return rest;
}
