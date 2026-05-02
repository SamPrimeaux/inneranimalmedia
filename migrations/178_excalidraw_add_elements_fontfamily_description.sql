-- Append fontFamily guidance for Excalidraw text elements (valid values 1-3 only).
UPDATE mcp_registered_tools
SET
  description = trim(
    COALESCE(description, '')
    || ' '
    || 'For text elements: fontFamily must be 1 (handwriting/Virgil), 2 (normal/Helvetica), or 3 (code/Cascadia). Never use 4.'
  ),
  updated_at = datetime('now')
WHERE tool_name = 'excalidraw_add_elements';
