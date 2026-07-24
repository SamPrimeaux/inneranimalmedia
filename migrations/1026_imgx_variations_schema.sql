-- imgx_generate_image: document variations (1-4) for parallel dedicated frames (not collages).
UPDATE agentsam_tools
SET
  input_schema = json_set(
    COALESCE(input_schema, '{}'),
    '$.properties.variations',
    json('{"type":"integer","minimum":1,"maximum":4,"description":"Number of separate full-frame images to generate in parallel (1-4). Do not request a collage; each variation is its own dedicated image."}'),
    '$.properties.prompt.description',
    'Concrete visual prompt. Required unless the turn text already describes the image. For multiple angles set variations>=2 — never ask for an A/B/C collage in one image.'
  ),
  updated_at = unixepoch()
WHERE tool_key = 'imgx_generate_image';
