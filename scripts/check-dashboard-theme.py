#!/usr/bin/env python3
"""Check dashboard HTML for broken newline, theme API, loadThemes."""
import re
import sys

path = sys.argv[1]
try:
    content = open(path).read()
except FileNotFoundError:
    print("fetch_failed (key missing or not downloaded)")
    sys.exit(0)

has_broken = bool(re.search(r"css \+= .{0,60}\}\n'", content))
has_theme_api = "settings/theme" in content
has_loadthemes = "loadThemes" in content
print(f"broken_newline={has_broken} has_api_call={has_theme_api} has_loadthemes={has_loadthemes}")
