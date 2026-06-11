-- Contact page: remove path labels, update client CTA to Get in Touch + proposal anchor.
UPDATE cms_page_sections
SET section_data = json_remove(section_data, '$.label')
WHERE id IN ('sec_contact_path_client', 'sec_contact_path_join');

UPDATE cms_page_sections
SET section_data = json_set(
  json_set(section_data, '$.cta_label', 'Get in Touch'),
  '$.cta_href', '#contact-proposal'
)
WHERE id = 'sec_contact_path_client';
