# CMS / Dashboard / R2 Schema Audit

Generated: `2026-05-08T06:30:18.107830+00:00`
Database: `inneranimalmedia-business`

## Tables Included

| Table | Rows | Columns | Indexes | Foreign Keys |
|---|---:|---:|---:|---:|
| `cms_pages` | 17 | 40 | 3 | 0 |
| `cms_page_sections` | 46 | 13 | 1 | 2 |
| `cms_section_components` | 93 | 10 | 1 | 1 |
| `cms_component_templates` | 24 | 16 | 1 | 1 |
| `cms_navigation_menus` | 3 | 14 | 2 | 0 |
| `dashboard_assets` | 60 | 14 | 2 | 1 |
| `dashboard_versions` | 5326 | 20 | 2 | 0 |
| `r2_bucket_bindings` | 26 | 8 | 1 | 0 |
| `r2_bucket_class_daily` | 0 | 5 | 1 | 0 |
| `r2_bucket_daily` | 16 | 5 | 2 | 0 |
| `r2_bucket_largest` | 0 | 3 | 1 | 0 |
| `r2_bucket_list` | 112 | 4 | 2 | 0 |
| `r2_bucket_summary` | 107 | 15 | 3 | 0 |
| `r2_buckets` | 109 | 23 | 5 | 0 |
| `r2_deploy_manifest_objects` | 0 | 13 | 3 | 0 |
| `r2_deploy_manifests` | 0 | 16 | 2 | 0 |
| `r2_intended_paths` | 11 | 6 | 2 | 0 |
| `r2_object_inventory` | 4157 | 30 | 9 | 0 |
| `r2_object_media` | 0 | 8 | 3 | 1 |
| `r2_objects` | 64 | 22 | 7 | 1 |
| `r2_objects_fts` | 64 | 3 | 0 | 0 |
| `r2_objects_fts_config` | 1 | 2 | 1 | 0 |
| `r2_objects_fts_data` | 3 | 2 | 0 | 0 |
| `r2_objects_fts_docsize` | 64 | 2 | 0 | 0 |
| `r2_objects_fts_idx` | 1 | 3 | 1 | 0 |

## `cms_pages`

- Rows: `17`
- Columns: `40`
- Indexes: `3`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE cms_pages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  worker_id TEXT,
  person_uuid TEXT,

  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  route_path TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN (
    'home','about','services','work','case_study','contact','pricing',
    'privacy','terms','faq','product','collection','blog','post',
    'landing','portal','dashboard','auth','sitemap','custom'
  )),

  title TEXT NOT NULL,
  meta_description TEXT,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','archived','scheduled')),

  seo_title TEXT,
  canonical_url TEXT,
  robots TEXT DEFAULT 'index,follow',
  og_image_asset_id TEXT,

  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  content_type TEXT DEFAULT 'text/html',
  content_size_bytes INTEGER DEFAULT 0,

  config_json TEXT DEFAULT '{}',
  seo_json TEXT DEFAULT '{}',
  analytics_json TEXT DEFAULT '{}',
  metadata_json TEXT DEFAULT '{}',

  is_homepage INTEGER DEFAULT 0,
  is_system_page INTEGER DEFAULT 0,
  requires_auth INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,

  created_by TEXT,
  updated_by TEXT,
  published_by TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  archived_at INTEGER,

  UNIQUE(project_id, slug),
  UNIQUE(project_id, route_path)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `project_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `project_slug` | `TEXT` | 1 | `None` | 0 |
| 3 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 5 | `worker_id` | `TEXT` | 0 | `None` | 0 |
| 6 | `person_uuid` | `TEXT` | 0 | `None` | 0 |
| 7 | `slug` | `TEXT` | 1 | `None` | 0 |
| 8 | `path` | `TEXT` | 1 | `None` | 0 |
| 9 | `route_path` | `TEXT` | 1 | `None` | 0 |
| 10 | `page_type` | `TEXT` | 1 | `None` | 0 |
| 11 | `title` | `TEXT` | 1 | `None` | 0 |
| 12 | `meta_description` | `TEXT` | 0 | `None` | 0 |
| 13 | `description` | `TEXT` | 0 | `None` | 0 |
| 14 | `status` | `TEXT` | 1 | `'draft'` | 0 |
| 15 | `seo_title` | `TEXT` | 0 | `None` | 0 |
| 16 | `canonical_url` | `TEXT` | 0 | `None` | 0 |
| 17 | `robots` | `TEXT` | 0 | `'index,follow'` | 0 |
| 18 | `og_image_asset_id` | `TEXT` | 0 | `None` | 0 |
| 19 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 20 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 21 | `r2_url` | `TEXT` | 0 | `None` | 0 |
| 22 | `content_type` | `TEXT` | 0 | `'text/html'` | 0 |
| 23 | `content_size_bytes` | `INTEGER` | 0 | `0` | 0 |
| 24 | `config_json` | `TEXT` | 0 | `'{}'` | 0 |
| 25 | `seo_json` | `TEXT` | 0 | `'{}'` | 0 |
| 26 | `analytics_json` | `TEXT` | 0 | `'{}'` | 0 |
| 27 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 28 | `is_homepage` | `INTEGER` | 0 | `0` | 0 |
| 29 | `is_system_page` | `INTEGER` | 0 | `0` | 0 |
| 30 | `requires_auth` | `INTEGER` | 0 | `0` | 0 |
| 31 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 32 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 33 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 34 | `updated_by` | `TEXT` | 0 | `None` | 0 |
| 35 | `published_by` | `TEXT` | 0 | `None` | 0 |
| 36 | `created_at` | `INTEGER` | 1 | `None` | 0 |
| 37 | `updated_at` | `INTEGER` | 1 | `None` | 0 |
| 38 | `published_at` | `INTEGER` | 0 | `None` | 0 |
| 39 | `archived_at` | `INTEGER` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_cms_pages_3",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_cms_pages_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 2,
    "name": "sqlite_autoindex_cms_pages_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `cms_page_sections`

- Rows: `46`
- Columns: `13`
- Indexes: `1`
- Foreign keys: `2`

### CREATE TABLE

```sql
CREATE TABLE cms_page_sections (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  section_name TEXT NOT NULL,
  section_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  css_classes TEXT,
  custom_css TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')), liquid_section_id TEXT REFERENCES cms_liquid_sections(id) ON DELETE SET NULL, shopify_section_key TEXT DEFAULT NULL,
  FOREIGN KEY (page_id)
    REFERENCES cms_pages(id)
    ON DELETE CASCADE
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `page_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `section_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `section_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `section_data` | `TEXT` | 1 | `'{}'` | 0 |
| 5 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 6 | `is_visible` | `INTEGER` | 0 | `1` | 0 |
| 7 | `css_classes` | `TEXT` | 0 | `None` | 0 |
| 8 | `custom_css` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 10 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 11 | `liquid_section_id` | `TEXT` | 0 | `None` | 0 |
| 12 | `shopify_section_key` | `TEXT` | 0 | `NULL` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_cms_page_sections_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "cms_pages",
    "from": "page_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
  },
  {
    "id": 1,
    "seq": 0,
    "table": "cms_liquid_sections",
    "from": "liquid_section_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "SET NULL",
    "match": "NONE"
  }
]
```

## `cms_section_components`

- Rows: `93`
- Columns: `10`
- Indexes: `1`
- Foreign keys: `1`

### CREATE TABLE

```sql
CREATE TABLE cms_section_components (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  section_id TEXT NOT NULL,
  component_type TEXT NOT NULL,
  component_data TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_visible INTEGER DEFAULT 1,
  tenant_id TEXT,
  project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (section_id) REFERENCES cms_page_sections(id) ON DELETE CASCADE
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `section_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `component_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `component_data` | `TEXT` | 1 | `'{}'` | 0 |
| 4 | `sort_order` | `INTEGER` | 0 | `0` | 0 |
| 5 | `is_visible` | `INTEGER` | 0 | `1` | 0 |
| 6 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 7 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 8 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 9 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_cms_section_components_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "cms_page_sections",
    "from": "section_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
  }
]
```

## `cms_component_templates`

- Rows: `24`
- Columns: `16`
- Indexes: `1`
- Foreign keys: `1`

### CREATE TABLE

```sql
CREATE TABLE cms_component_templates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL, 
  category TEXT NOT NULL, 
  preview_image_url TEXT,
  template_data TEXT NOT NULL, 
  is_system INTEGER DEFAULT 1, 
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, r2_bucket TEXT, r2_key TEXT, s3_endpoint TEXT, tenant_id TEXT, source_liquid_file TEXT DEFAULT NULL, shopify_section_key TEXT DEFAULT NULL, liquid_import_id TEXT REFERENCES cms_liquid_imports(id) ON DELETE SET NULL)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `template_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `template_type` | `TEXT` | 1 | `None` | 0 |
| 3 | `category` | `TEXT` | 1 | `None` | 0 |
| 4 | `preview_image_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `template_data` | `TEXT` | 1 | `None` | 0 |
| 6 | `is_system` | `INTEGER` | 0 | `1` | 0 |
| 7 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 8 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 9 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 10 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 11 | `s3_endpoint` | `TEXT` | 0 | `None` | 0 |
| 12 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 13 | `source_liquid_file` | `TEXT` | 0 | `NULL` | 0 |
| 14 | `shopify_section_key` | `TEXT` | 0 | `NULL` | 0 |
| 15 | `liquid_import_id` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_cms_component_templates_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "cms_liquid_imports",
    "from": "liquid_import_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "SET NULL",
    "match": "NONE"
  }
]
```

## `cms_navigation_menus`

- Rows: `3`
- Columns: `14`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE cms_navigation_menus (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  project_id TEXT NOT NULL,
  project_slug TEXT,
  tenant_id TEXT,

  menu_name TEXT NOT NULL,
  menu_type TEXT DEFAULT 'site',
  menu_items TEXT NOT NULL,

  is_active INTEGER DEFAULT 1,

  r2_bucket TEXT,
  r2_key TEXT,
  r2_url TEXT,
  s3_endpoint TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(project_id, menu_name)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `lower(hex(randomblob(16)))` | 1 |
| 1 | `project_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `project_slug` | `TEXT` | 0 | `None` | 0 |
| 3 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 4 | `menu_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `menu_type` | `TEXT` | 0 | `'site'` | 0 |
| 6 | `menu_items` | `TEXT` | 1 | `None` | 0 |
| 7 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 8 | `r2_bucket` | `TEXT` | 0 | `None` | 0 |
| 9 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 10 | `r2_url` | `TEXT` | 0 | `None` | 0 |
| 11 | `s3_endpoint` | `TEXT` | 0 | `None` | 0 |
| 12 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 13 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_cms_navigation_menus_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_cms_navigation_menus_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `dashboard_assets`

- Rows: `60`
- Columns: `14`
- Indexes: `2`
- Foreign keys: `1`

### CREATE TABLE

```sql
CREATE TABLE dashboard_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('logo','wordmark','image','file','template','attachment')),
  title TEXT,
  storage TEXT NOT NULL DEFAULT 'r2' CHECK (storage IN ('r2','cf_images')),
  r2_key TEXT,
  url TEXT,
  mime TEXT,
  size_bytes INTEGER,
  tags_json TEXT,
  is_official INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `kind` | `TEXT` | 1 | `None` | 0 |
| 3 | `title` | `TEXT` | 0 | `None` | 0 |
| 4 | `storage` | `TEXT` | 1 | `'r2'` | 0 |
| 5 | `r2_key` | `TEXT` | 0 | `None` | 0 |
| 6 | `url` | `TEXT` | 0 | `None` | 0 |
| 7 | `mime` | `TEXT` | 0 | `None` | 0 |
| 8 | `size_bytes` | `INTEGER` | 0 | `None` | 0 |
| 9 | `tags_json` | `TEXT` | 0 | `None` | 0 |
| 10 | `is_official` | `INTEGER` | 1 | `0` | 0 |
| 11 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 12 | `created_at` | `TEXT` | 1 | `None` | 0 |
| 13 | `updated_at` | `TEXT` | 1 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_dashboard_assets_workspace_kind_created",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_dashboard_assets_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "workspaces",
    "from": "workspace_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
  }
]
```

## `dashboard_versions`

- Rows: `5326`
- Columns: `20`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE dashboard_versions (id TEXT PRIMARY KEY, page_name TEXT NOT NULL, version TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE, file_size INTEGER NOT NULL, r2_path TEXT NOT NULL, local_backup_path TEXT, description TEXT, is_locked INTEGER DEFAULT 0, is_production INTEGER DEFAULT 0, screenshot_url TEXT, created_at INTEGER DEFAULT (unixepoch()), locked_at INTEGER, locked_by TEXT, metadata_json TEXT DEFAULT '{}', environment TEXT DEFAULT 'production', git_commit TEXT, session_tag TEXT, is_active INTEGER DEFAULT 0, build_pipeline TEXT DEFAULT 'cursor')
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `page_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `version` | `TEXT` | 1 | `None` | 0 |
| 3 | `file_hash` | `TEXT` | 1 | `None` | 0 |
| 4 | `file_size` | `INTEGER` | 1 | `None` | 0 |
| 5 | `r2_path` | `TEXT` | 1 | `None` | 0 |
| 6 | `local_backup_path` | `TEXT` | 0 | `None` | 0 |
| 7 | `description` | `TEXT` | 0 | `None` | 0 |
| 8 | `is_locked` | `INTEGER` | 0 | `0` | 0 |
| 9 | `is_production` | `INTEGER` | 0 | `0` | 0 |
| 10 | `screenshot_url` | `TEXT` | 0 | `None` | 0 |
| 11 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 12 | `locked_at` | `INTEGER` | 0 | `None` | 0 |
| 13 | `locked_by` | `TEXT` | 0 | `None` | 0 |
| 14 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 15 | `environment` | `TEXT` | 0 | `'production'` | 0 |
| 16 | `git_commit` | `TEXT` | 0 | `None` | 0 |
| 17 | `session_tag` | `TEXT` | 0 | `None` | 0 |
| 18 | `is_active` | `INTEGER` | 0 | `0` | 0 |
| 19 | `build_pipeline` | `TEXT` | 0 | `'cursor'` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_dashboard_versions_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_dashboard_versions_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_bindings`

- Rows: `26`
- Columns: `8`
- Indexes: `1`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_bindings (id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, r2_bucket TEXT NOT NULL, s3_url TEXT, catalog_url TEXT, warehouse TEXT, created_at INTEGER DEFAULT (unixepoch()), updated_at INTEGER DEFAULT (unixepoch()))
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `worker_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `r2_bucket` | `TEXT` | 1 | `None` | 0 |
| 3 | `s3_url` | `TEXT` | 0 | `None` | 0 |
| 4 | `catalog_url` | `TEXT` | 0 | `None` | 0 |
| 5 | `warehouse` | `TEXT` | 0 | `None` | 0 |
| 6 | `created_at` | `INTEGER` | 0 | `unixepoch()` | 0 |
| 7 | `updated_at` | `INTEGER` | 0 | `unixepoch()` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_r2_bucket_bindings_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_class_daily`

- Rows: `0`
- Columns: `5`
- Indexes: `1`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_class_daily (
  bucket TEXT NOT NULL,
  day TEXT NOT NULL,
  class TEXT NOT NULL,
  object_count INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  PRIMARY KEY (bucket, day, class)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `bucket` | `TEXT` | 1 | `None` | 1 |
| 1 | `day` | `TEXT` | 1 | `None` | 2 |
| 2 | `class` | `TEXT` | 1 | `None` | 3 |
| 3 | `object_count` | `INTEGER` | 0 | `0` | 0 |
| 4 | `total_bytes` | `INTEGER` | 0 | `0` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_r2_bucket_class_daily_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_daily`

- Rows: `16`
- Columns: `5`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_daily (
  bucket TEXT NOT NULL,
  day TEXT NOT NULL,
  total_bytes INTEGER DEFAULT 0,
  object_count INTEGER DEFAULT 0,
  last_modified_at TEXT,
  PRIMARY KEY (bucket, day)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `bucket` | `TEXT` | 1 | `None` | 1 |
| 1 | `day` | `TEXT` | 1 | `None` | 2 |
| 2 | `total_bytes` | `INTEGER` | 0 | `0` | 0 |
| 3 | `object_count` | `INTEGER` | 0 | `0` | 0 |
| 4 | `last_modified_at` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_bucket_daily_day",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_r2_bucket_daily_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_largest`

- Rows: `0`
- Columns: `3`
- Indexes: `1`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_largest (
  bucket TEXT PRIMARY KEY,
  captured_at TEXT DEFAULT (datetime('now')),
  items_json TEXT DEFAULT '[]'
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `bucket` | `TEXT` | 0 | `None` | 1 |
| 1 | `captured_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 2 | `items_json` | `TEXT` | 0 | `'[]'` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_r2_bucket_largest_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_list`

- Rows: `112`
- Columns: `4`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_list (
  bucket_name TEXT PRIMARY KEY,
  creation_date TEXT,
  account_id TEXT NOT NULL DEFAULT 'ede6590ac0d2fb7daf155b35653457b2',
  last_synced_at TEXT DEFAULT (datetime('now'))
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `bucket_name` | `TEXT` | 0 | `None` | 1 |
| 1 | `creation_date` | `TEXT` | 0 | `None` | 0 |
| 2 | `account_id` | `TEXT` | 1 | `'ede6590ac0d2fb7daf155b35653457b2'` | 0 |
| 3 | `last_synced_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_bucket_list_account",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_r2_bucket_list_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_bucket_summary`

- Rows: `107`
- Columns: `15`
- Indexes: `3`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_bucket_summary (
  bucket_name TEXT PRIMARY KEY,
  object_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  total_mb REAL,
  by_content_type_json TEXT DEFAULT '{}',
  prefix_breakdown_json TEXT DEFAULT '{}',
  is_live_connected INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 50,
  last_inventoried_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
, cleanup_status TEXT DEFAULT 'unreviewed', cleanup_notes TEXT, owner TEXT, project_ref TEXT)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `bucket_name` | `TEXT` | 0 | `None` | 1 |
| 1 | `object_count` | `INTEGER` | 1 | `0` | 0 |
| 2 | `total_bytes` | `INTEGER` | 1 | `0` | 0 |
| 3 | `total_mb` | `REAL` | 0 | `None` | 0 |
| 4 | `by_content_type_json` | `TEXT` | 0 | `'{}'` | 0 |
| 5 | `prefix_breakdown_json` | `TEXT` | 0 | `'{}'` | 0 |
| 6 | `is_live_connected` | `INTEGER` | 1 | `0` | 0 |
| 7 | `priority` | `INTEGER` | 1 | `50` | 0 |
| 8 | `last_inventoried_at` | `TEXT` | 0 | `None` | 0 |
| 9 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 10 | `updated_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 11 | `cleanup_status` | `TEXT` | 0 | `'unreviewed'` | 0 |
| 12 | `cleanup_notes` | `TEXT` | 0 | `None` | 0 |
| 13 | `owner` | `TEXT` | 0 | `None` | 0 |
| 14 | `project_ref` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_bucket_summary_priority",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "idx_r2_bucket_summary_live",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 2,
    "name": "sqlite_autoindex_r2_bucket_summary_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_buckets`

- Rows: `109`
- Columns: `23`
- Indexes: `5`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_buckets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    bucket_name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    region TEXT DEFAULT 'auto',
    public_access INTEGER DEFAULT 0, -- 1 = public bucket
    cors_enabled INTEGER DEFAULT 0,
    cors_config_json TEXT DEFAULT '{}', -- JSON: CORS configuration
    lifecycle_rules_json TEXT DEFAULT '{}', -- JSON: lifecycle rules
    is_active INTEGER DEFAULT 1,
    total_objects INTEGER DEFAULT 0,
    total_size_bytes INTEGER DEFAULT 0,
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
, s3_url TEXT, catalog_url TEXT, warehouse_name TEXT, public_dev_url TEXT, custom_domain TEXT, upload_enabled INTEGER DEFAULT 0, credentials_encrypted TEXT)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'system'` | 0 |
| 2 | `bucket_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `display_name` | `TEXT` | 1 | `None` | 0 |
| 4 | `description` | `TEXT` | 0 | `None` | 0 |
| 5 | `region` | `TEXT` | 0 | `'auto'` | 0 |
| 6 | `public_access` | `INTEGER` | 0 | `0` | 0 |
| 7 | `cors_enabled` | `INTEGER` | 0 | `0` | 0 |
| 8 | `cors_config_json` | `TEXT` | 0 | `'{}'` | 0 |
| 9 | `lifecycle_rules_json` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 11 | `total_objects` | `INTEGER` | 0 | `0` | 0 |
| 12 | `total_size_bytes` | `INTEGER` | 0 | `0` | 0 |
| 13 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 14 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 15 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 16 | `s3_url` | `TEXT` | 0 | `None` | 0 |
| 17 | `catalog_url` | `TEXT` | 0 | `None` | 0 |
| 18 | `warehouse_name` | `TEXT` | 0 | `None` | 0 |
| 19 | `public_dev_url` | `TEXT` | 0 | `None` | 0 |
| 20 | `custom_domain` | `TEXT` | 0 | `None` | 0 |
| 21 | `upload_enabled` | `INTEGER` | 0 | `0` | 0 |
| 22 | `credentials_encrypted` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_buckets_public",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "idx_r2_buckets_name",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 2,
    "name": "idx_r2_buckets_tenant",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 3,
    "name": "sqlite_autoindex_r2_buckets_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 4,
    "name": "sqlite_autoindex_r2_buckets_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_deploy_manifest_objects`

- Rows: `0`
- Columns: `13`
- Indexes: `3`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_deploy_manifest_objects (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  content_type TEXT,
  etag TEXT,
  sha256_hash TEXT,
  r2_public_url TEXT,
  live_url TEXT,
  status TEXT DEFAULT 'expected',
  metadata_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(manifest_id, bucket_name, object_key)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `manifest_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `bucket_name` | `TEXT` | 1 | `None` | 0 |
| 3 | `object_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `size_bytes` | `INTEGER` | 0 | `0` | 0 |
| 5 | `content_type` | `TEXT` | 0 | `None` | 0 |
| 6 | `etag` | `TEXT` | 0 | `None` | 0 |
| 7 | `sha256_hash` | `TEXT` | 0 | `None` | 0 |
| 8 | `r2_public_url` | `TEXT` | 0 | `None` | 0 |
| 9 | `live_url` | `TEXT` | 0 | `None` | 0 |
| 10 | `status` | `TEXT` | 0 | `'expected'` | 0 |
| 11 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 12 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_deploy_manifest_objects_manifest_bucket_key",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_r2_deploy_manifest_objects_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 2,
    "name": "sqlite_autoindex_r2_deploy_manifest_objects_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_deploy_manifests`

- Rows: `0`
- Columns: `16`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_deploy_manifests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  site_slug TEXT,
  deploy_id TEXT NOT NULL,
  deploy_tag TEXT,
  source TEXT NOT NULL DEFAULT 'deploy',
  manifest_json TEXT NOT NULL DEFAULT '{}',
  object_count INTEGER NOT NULL DEFAULT 0,
  total_size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'created',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at TEXT
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `None` | 0 |
| 2 | `workspace_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `project_id` | `TEXT` | 1 | `None` | 0 |
| 4 | `bucket_name` | `TEXT` | 1 | `None` | 0 |
| 5 | `site_slug` | `TEXT` | 0 | `None` | 0 |
| 6 | `deploy_id` | `TEXT` | 1 | `None` | 0 |
| 7 | `deploy_tag` | `TEXT` | 0 | `None` | 0 |
| 8 | `source` | `TEXT` | 1 | `'deploy'` | 0 |
| 9 | `manifest_json` | `TEXT` | 1 | `'{}'` | 0 |
| 10 | `object_count` | `INTEGER` | 1 | `0` | 0 |
| 11 | `total_size_bytes` | `INTEGER` | 1 | `0` | 0 |
| 12 | `status` | `TEXT` | 1 | `'created'` | 0 |
| 13 | `created_by` | `TEXT` | 0 | `None` | 0 |
| 14 | `created_at` | `TEXT` | 1 | `datetime('now')` | 0 |
| 15 | `applied_at` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_deploy_manifests_bucket_ws_proj_created",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_r2_deploy_manifests_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_intended_paths`

- Rows: `11`
- Columns: `6`
- Indexes: `2`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_intended_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_name TEXT NOT NULL,
  prefix_pattern TEXT NOT NULL,
  purpose TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(bucket_name, prefix_pattern)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `INTEGER` | 0 | `None` | 1 |
| 1 | `bucket_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `prefix_pattern` | `TEXT` | 1 | `None` | 0 |
| 3 | `purpose` | `TEXT` | 0 | `None` | 0 |
| 4 | `is_active` | `INTEGER` | 1 | `1` | 0 |
| 5 | `created_at` | `TEXT` | 0 | `datetime('now')` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_intended_paths_bucket",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "sqlite_autoindex_r2_intended_paths_1",
    "unique": 1,
    "origin": "u",
    "partial": 0
  }
]
```

## `r2_object_inventory`

- Rows: `4157`
- Columns: `30`
- Indexes: `9`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE r2_object_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  last_modified_iso TEXT,
  content_type TEXT,
  etag TEXT,
  inventoried_at TEXT DEFAULT (datetime('now')), sha256_hash TEXT, r2_public_url TEXT, live_url TEXT, edited_by TEXT, site_slug TEXT, file_type TEXT, tenant_id TEXT, workspace_id TEXT, project_id TEXT, deploy_id TEXT, deploy_tag TEXT, source_manifest_id TEXT, status TEXT DEFAULT 'active', first_seen_at TEXT, last_seen_at TEXT, last_seen_deploy_id TEXT, stale_since TEXT, prune_after TEXT, protected INTEGER DEFAULT 0, protected_reason TEXT, cache_control TEXT, content_hash TEXT,
  UNIQUE(bucket_name, object_key)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `INTEGER` | 0 | `None` | 1 |
| 1 | `bucket_name` | `TEXT` | 1 | `None` | 0 |
| 2 | `object_key` | `TEXT` | 1 | `None` | 0 |
| 3 | `size_bytes` | `INTEGER` | 1 | `0` | 0 |
| 4 | `last_modified_iso` | `TEXT` | 0 | `None` | 0 |
| 5 | `content_type` | `TEXT` | 0 | `None` | 0 |
| 6 | `etag` | `TEXT` | 0 | `None` | 0 |
| 7 | `inventoried_at` | `TEXT` | 0 | `datetime('now')` | 0 |
| 8 | `sha256_hash` | `TEXT` | 0 | `None` | 0 |
| 9 | `r2_public_url` | `TEXT` | 0 | `None` | 0 |
| 10 | `live_url` | `TEXT` | 0 | `None` | 0 |
| 11 | `edited_by` | `TEXT` | 0 | `None` | 0 |
| 12 | `site_slug` | `TEXT` | 0 | `None` | 0 |
| 13 | `file_type` | `TEXT` | 0 | `None` | 0 |
| 14 | `tenant_id` | `TEXT` | 0 | `None` | 0 |
| 15 | `workspace_id` | `TEXT` | 0 | `None` | 0 |
| 16 | `project_id` | `TEXT` | 0 | `None` | 0 |
| 17 | `deploy_id` | `TEXT` | 0 | `None` | 0 |
| 18 | `deploy_tag` | `TEXT` | 0 | `None` | 0 |
| 19 | `source_manifest_id` | `TEXT` | 0 | `None` | 0 |
| 20 | `status` | `TEXT` | 0 | `'active'` | 0 |
| 21 | `first_seen_at` | `TEXT` | 0 | `None` | 0 |
| 22 | `last_seen_at` | `TEXT` | 0 | `None` | 0 |
| 23 | `last_seen_deploy_id` | `TEXT` | 0 | `None` | 0 |
| 24 | `stale_since` | `TEXT` | 0 | `None` | 0 |
| 25 | `prune_after` | `TEXT` | 0 | `None` | 0 |
| 26 | `protected` | `INTEGER` | 0 | `0` | 0 |
| 27 | `protected_reason` | `TEXT` | 0 | `None` | 0 |
| 28 | `cache_control` | `TEXT` | 0 | `None` | 0 |
| 29 | `content_hash` | `TEXT` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_object_inventory_last_seen_deploy",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "idx_r2_object_inventory_bucket_object_key",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 2,
    "name": "idx_r2_object_inventory_tenant_workspace_project",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 3,
    "name": "idx_r2_object_inventory_bucket_status",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 4,
    "name": "uniq_r2_inventory_bucket_object",
    "unique": 1,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 5,
    "name": "idx_r2_inv_bucket_key",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 6,
    "name": "idx_r2_inv_key_prefix",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 7,
    "name": "idx_r2_inv_bucket",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 8,
    "name": "sqlite_autoindex_r2_object_inventory_1",
    "unique": 1,
    "origin": "u",
    "partial": 0
  }
]
```

## `r2_object_media`

- Rows: `0`
- Columns: `8`
- Indexes: `3`
- Foreign keys: `1`

### CREATE TABLE

```sql
CREATE TABLE r2_object_media (
  object_id TEXT PRIMARY KEY,
  is_image INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  thumbnail_key TEXT,
  blurhash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (object_id) REFERENCES r2_objects(id) ON DELETE CASCADE
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `object_id` | `TEXT` | 0 | `None` | 1 |
| 1 | `is_image` | `INTEGER` | 1 | `0` | 0 |
| 2 | `width` | `INTEGER` | 0 | `None` | 0 |
| 3 | `height` | `INTEGER` | 0 | `None` | 0 |
| 4 | `thumbnail_key` | `TEXT` | 0 | `None` | 0 |
| 5 | `blurhash` | `TEXT` | 0 | `None` | 0 |
| 6 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 7 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_object_media_thumbnail_key",
    "unique": 0,
    "origin": "c",
    "partial": 1
  },
  {
    "seq": 1,
    "name": "idx_r2_object_media_is_image",
    "unique": 0,
    "origin": "c",
    "partial": 1
  },
  {
    "seq": 2,
    "name": "sqlite_autoindex_r2_object_media_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "r2_objects",
    "from": "object_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
  }
]
```

## `r2_objects`

- Rows: `64`
- Columns: `22`
- Indexes: `7`
- Foreign keys: `1`

### CREATE TABLE

```sql
CREATE TABLE r2_objects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'system',
    bucket_id TEXT NOT NULL,
    object_key TEXT NOT NULL, -- Full path/key in R2
    display_name TEXT, -- Human-readable name
    content_type TEXT, -- MIME type
    file_size INTEGER,
    etag TEXT, -- MD5 hash
    checksum TEXT, -- Additional checksum if available
    metadata_json TEXT DEFAULT '{}', -- JSON: user metadata
    r2_metadata_json TEXT DEFAULT '{}', -- JSON: R2 system metadata
    is_public INTEGER DEFAULT 0, -- 1 = publicly accessible
    public_url TEXT, -- CDN URL if public
    version TEXT, -- Object version if versioning enabled
    storage_class TEXT DEFAULT 'STANDARD', -- STANDARD, INFREQUENT_ACCESS, etc.
    tags TEXT, -- JSON array or comma-separated
    category TEXT, -- 'image', 'video', 'document', 'asset', 'backup', etc.
    uploaded_by TEXT,
    is_active INTEGER DEFAULT 1,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (bucket_id) REFERENCES r2_buckets(id) ON DELETE CASCADE,
    UNIQUE(bucket_id, object_key)
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `TEXT` | 0 | `None` | 1 |
| 1 | `tenant_id` | `TEXT` | 1 | `'system'` | 0 |
| 2 | `bucket_id` | `TEXT` | 1 | `None` | 0 |
| 3 | `object_key` | `TEXT` | 1 | `None` | 0 |
| 4 | `display_name` | `TEXT` | 0 | `None` | 0 |
| 5 | `content_type` | `TEXT` | 0 | `None` | 0 |
| 6 | `file_size` | `INTEGER` | 0 | `None` | 0 |
| 7 | `etag` | `TEXT` | 0 | `None` | 0 |
| 8 | `checksum` | `TEXT` | 0 | `None` | 0 |
| 9 | `metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 10 | `r2_metadata_json` | `TEXT` | 0 | `'{}'` | 0 |
| 11 | `is_public` | `INTEGER` | 0 | `0` | 0 |
| 12 | `public_url` | `TEXT` | 0 | `None` | 0 |
| 13 | `version` | `TEXT` | 0 | `None` | 0 |
| 14 | `storage_class` | `TEXT` | 0 | `'STANDARD'` | 0 |
| 15 | `tags` | `TEXT` | 0 | `None` | 0 |
| 16 | `category` | `TEXT` | 0 | `None` | 0 |
| 17 | `uploaded_by` | `TEXT` | 0 | `None` | 0 |
| 18 | `is_active` | `INTEGER` | 0 | `1` | 0 |
| 19 | `last_accessed_at` | `INTEGER` | 0 | `None` | 0 |
| 20 | `created_at` | `INTEGER` | 1 | `unixepoch()` | 0 |
| 21 | `updated_at` | `INTEGER` | 1 | `unixepoch()` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "idx_r2_objects_uploaded",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 1,
    "name": "idx_r2_objects_public",
    "unique": 0,
    "origin": "c",
    "partial": 1
  },
  {
    "seq": 2,
    "name": "idx_r2_objects_category",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 3,
    "name": "idx_r2_objects_tenant",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 4,
    "name": "idx_r2_objects_bucket",
    "unique": 0,
    "origin": "c",
    "partial": 0
  },
  {
    "seq": 5,
    "name": "sqlite_autoindex_r2_objects_2",
    "unique": 1,
    "origin": "u",
    "partial": 0
  },
  {
    "seq": 6,
    "name": "sqlite_autoindex_r2_objects_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

### Foreign Keys

```json
[
  {
    "id": 0,
    "seq": 0,
    "table": "r2_buckets",
    "from": "bucket_id",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
  }
]
```

## `r2_objects_fts`

- Rows: `64`
- Columns: `3`
- Indexes: `0`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE VIRTUAL TABLE r2_objects_fts USING fts5(
  object_key,
  display_name,
  tags,
  content='r2_objects',
  content_rowid='rowid',
  tokenize='porter'
)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `object_key` | `` | 0 | `None` | 0 |
| 1 | `display_name` | `` | 0 | `None` | 0 |
| 2 | `tags` | `` | 0 | `None` | 0 |

## `r2_objects_fts_config`

- Rows: `1`
- Columns: `2`
- Indexes: `1`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE 'r2_objects_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `k` | `` | 1 | `None` | 1 |
| 1 | `v` | `` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_r2_objects_fts_config_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```

## `r2_objects_fts_data`

- Rows: `3`
- Columns: `2`
- Indexes: `0`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE 'r2_objects_fts_data'(id INTEGER PRIMARY KEY, block BLOB)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `INTEGER` | 0 | `None` | 1 |
| 1 | `block` | `BLOB` | 0 | `None` | 0 |

## `r2_objects_fts_docsize`

- Rows: `64`
- Columns: `2`
- Indexes: `0`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE 'r2_objects_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB)
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `id` | `INTEGER` | 0 | `None` | 1 |
| 1 | `sz` | `BLOB` | 0 | `None` | 0 |

## `r2_objects_fts_idx`

- Rows: `1`
- Columns: `3`
- Indexes: `1`
- Foreign keys: `0`

### CREATE TABLE

```sql
CREATE TABLE 'r2_objects_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID
```

### Columns

| cid | name | type | notnull | default | pk |
|---:|---|---|---:|---|---:|
| 0 | `segid` | `` | 1 | `None` | 1 |
| 1 | `term` | `` | 1 | `None` | 2 |
| 2 | `pgno` | `` | 0 | `None` | 0 |

### Indexes

```json
[
  {
    "seq": 0,
    "name": "sqlite_autoindex_r2_objects_fts_idx_1",
    "unique": 1,
    "origin": "pk",
    "partial": 0
  }
]
```