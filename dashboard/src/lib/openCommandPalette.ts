export type CommandPaletteChip = 'all' | 'commands' | 'd1' | 'r2' | 'workflows';

export type OpenCommandPaletteDetail = {
  query?: string;
  facets?: string[];
  chip?: CommandPaletteChip;
};

export const IAM_OPEN_COMMAND_PALETTE = 'iam-open-command-palette';

/** Open the global Cmd+K palette (UnifiedSearchBar) from status bar / git chrome. */
export function openCommandPalette(detail?: OpenCommandPaletteDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(IAM_OPEN_COMMAND_PALETTE, { detail: detail ?? {} }));
}
