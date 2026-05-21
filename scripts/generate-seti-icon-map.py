#!/usr/bin/env python3
"""Regenerate dashboard/src/lib/setiIconTheme.generated.ts from Cursor/VS Code theme-seti."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
THEME_JSON = Path(
    '/Applications/Cursor.app/Contents/Resources/app/extensions/theme-seti/icons/vs-seti-icon-theme.json'
)
OUT = REPO / 'dashboard/src/lib/setiIconTheme.generated.ts'


def main() -> int:
    if not THEME_JSON.is_file():
        print(f'missing theme json: {THEME_JSON}', file=sys.stderr)
        return 1
    d = json.loads(THEME_JSON.read_text())
    icons: dict[str, dict[str, str]] = {}
    for k, v in d['iconDefinitions'].items():
        if k.endswith('_light') or not k.startswith('_'):
            continue
        name = k[1:]
        fc = v.get('fontCharacter')
        if not fc:
            continue
        m = re.match(r'\\E([0-9A-Fa-f]{3,4})', fc)
        if not m:
            continue
        ch = chr(int(m.group(1), 16))
        icons[name] = {'char': ch, 'color': v.get('fontColor', '#d4d7d6')}

    ext_map = {k.lower(): v.lstrip('_') for k, v in d.get('fileExtensions', {}).items()}
    name_map = {k.lower(): v.lstrip('_') for k, v in d.get('fileNames', {}).items()}
    lang_map = {k: v.lstrip('_') for k, v in d.get('languageIds', {}).items()}

    lines = [
        '// AUTO-GENERATED from VS Code/Cursor theme-seti — run: python3 scripts/generate-seti-icon-map.py',
        'export type SetiGlyphDef = { char: string; color: string };',
        '',
        'export const SETI_GLYPHS: Record<string, SetiGlyphDef> = {',
    ]
    for name in sorted(icons):
        g = icons[name]
        lines.append(f'  {json.dumps(name)}: {{ char: {json.dumps(g["char"])}, color: {json.dumps(g["color"])} }},')
    lines.append('};')
    lines.append('')
    lines.append(f'export const SETI_FILE_EXTENSIONS: Record<string, string> = {json.dumps(ext_map, indent=2)};')
    lines.append('')
    lines.append(f'export const SETI_FILE_NAMES: Record<string, string> = {json.dumps(name_map, indent=2)};')
    lines.append('')
    lines.append(f'export const SETI_LANGUAGE_IDS: Record<string, string> = {json.dumps(lang_map, indent=2)};')
    lines.append('')
    lines.append("export const SETI_DEFAULT_ICON = 'default';")
    lines.append('')

    OUT.write_text('\n'.join(lines))
    print(f'wrote {OUT} ({len(icons)} glyphs, {len(ext_map)} extensions)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
