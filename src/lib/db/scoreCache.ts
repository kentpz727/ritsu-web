import { useSyncExternalStore } from 'react';
import { liveQuery, type Subscription } from 'dexie';
import { readScoreSnapshot, type ScoreSnapshot } from './dexie.ts';
import { parseGameConfig, type GameConfigData } from '../config/types.ts';
import { logError } from '../errors.ts';

/**
 * Shared score/config snapshot (P-08). Every mounted consumer reads the same
 * live snapshot instead of re-scanning the three tables on each navigation.
 * The subscription stays alive for the session so a route change is a cache
 * hit; Dexie re-runs the read once whenever any of the tables change.
 */
export interface CachedScoreSnapshot extends ScoreSnapshot {
  configMap: Map<number, GameConfigData>;
}

let snapshot: CachedScoreSnapshot | undefined;
let subscription: Subscription | undefined;
let started = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

async function loadSnapshot(): Promise<CachedScoreSnapshot> {
  const raw = await readScoreSnapshot();
  const configMap = new Map<number, GameConfigData>();
  for (const config of raw.configs) {
    try {
      if (config.id != null) configMap.set(config.id, parseGameConfig(config.configData));
    } catch (error) {
      logError('config parse skipped', error, { configId: config.id, gameName: config.gameName });
    }
  }
  return { ...raw, configMap };
}

function start(): void {
  if (started) return;
  started = true;
  subscription = liveQuery(loadSnapshot).subscribe({
    next: (value) => {
      snapshot = value;
      notify();
    },
    error: (error) => logError('score cache', error),
  });
}

export function subscribeScoreCache(listener: () => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function getScoreSnapshot(): CachedScoreSnapshot | undefined {
  return snapshot;
}

/** Shared live snapshot hook: one cached load per session until data changes. */
export function useScoreSnapshot(): CachedScoreSnapshot | undefined {
  return useSyncExternalStore(subscribeScoreCache, getScoreSnapshot, getScoreSnapshot);
}

/** Test/HMR hook: drop the shared subscription so the next reader reloads. */
export function resetScoreCache(): void {
  subscription?.unsubscribe();
  subscription = undefined;
  started = false;
  snapshot = undefined;
  listeners.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(resetScoreCache);
}
