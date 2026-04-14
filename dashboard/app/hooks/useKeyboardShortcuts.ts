import { useEffect } from 'react';

export interface ShortcutConfig {
  key: string;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: (e: KeyboardEvent) => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const metaMatch = !!s.meta === (e.metaKey || e.ctrlKey);
        const altMatch = !!s.alt === e.altKey;
        const shiftMatch = !!s.shift === e.shiftKey;

        if (keyMatch && metaMatch && altMatch && shiftMatch) {
          e.preventDefault();
          s.action(e);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}
