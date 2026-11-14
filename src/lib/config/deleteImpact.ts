/** Copy and guard for the config delete dialog (P-02). */

export function configDeleteImpact(count: number, gameName: string): string {
  if (count === 0) return `This deletes the config for "${gameName}". No scores are linked to it.`;
  const scores = count === 1 ? '1 score' : `${count} scores`;
  return `This deletes the config for "${gameName}" and unlinks ${scores}. You can undo this from Recently deleted.`;
}

/** Typed confirmation: the entered name must match the game name exactly (trimmed). */
export function canConfirmDelete(input: string, gameName: string): boolean {
  return input.trim() === gameName;
}
