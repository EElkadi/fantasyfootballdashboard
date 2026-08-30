/** Player identity, URL slugs, and position styling — shared client/server. */

export function playerSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** Classic fantasy-board position colors; readable with white text in both themes. */
export const POSITION_COLORS: Record<string, string> = {
  QB: '#dc2626',
  RB: '#0d9488',
  WR: '#2563eb',
  TE: '#d97706',
  K: '#7c3aed',
  DEF: '#57534e',
}

export function positionColor(position?: string): string {
  return POSITION_COLORS[(position ?? '').toUpperCase()] ?? '#6b7280'
}
