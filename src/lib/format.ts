/** Small display-formatting helpers shared by list and icon components (P-11). */

/** First letter of up to two words, uppercased — used for logo placeholders. */
export function initials(title: string): string {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}
