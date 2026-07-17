-- 919: Keep Layout quickstarts aligned with the Sketch incubation surface.
-- Behavior stays D1-driven; React carries matching offline fallback copy.

UPDATE agentsam_subagent_profile
SET instructions_markdown = CASE slug
      WHEN 'card-wireframe' THEN
        'Quickstart: Product wireframe. Sketch is open in Layout mode. Before placing components, ask me 2–4 short questions: which screen(s), desktop/tablet/mobile, primary user goal, and any must-have blocks (nav, hero, form, table). Wait for my answers. Then guide me on the canvas or place a starter layout — do not output ASCII wireframes.'
      WHEN 'card-blank-canvas' THEN
        'Quickstart: Blank canvas. Sketch is open in Layout mode for a freeform interface concept. Ask what screen I want to design, then help me build it with the component palette.'
      ELSE instructions_markdown
    END,
    output_schema_json = json_set(
      COALESCE(output_schema_json, '{}'),
      '$.quickstart.task_type', 'visual_canvas',
      '$.quickstart.route_key', 'visual_canvas',
      '$.quickstart.open_surface', 'wireframe'
    ),
    updated_at = datetime('now')
WHERE slug IN ('card-wireframe', 'card-blank-canvas')
  AND is_platform_global = 1;
