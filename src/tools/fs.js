/**
 * Tool: FileSystem (fs)
 * Standardized CRUD operations for local and virtual workspace files.
 */

export const handlers = {
  /**
   * list_dir: Recursive directory scanner for workspace mapping.
   */
  async list_dir({ path = '.', recursive = false }, env) {
    try {
      // In CF Workers/D1 context, we proxy to the shell or a R2/D1 registry
      // For this dashboard, we primarily use the /api/fs/list endpoint
      const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
      const res = await fetch(`${origin}/api/fs/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, recursive }),
      });
      const data = await res.json();
      
      // If backend returns flat rows (e.g. from R2/S3), normalize to nested tree
      if (Array.isArray(data) && !data.some(d => d.children)) {
        return buildTree(data, path);
      }
      return data;
    } catch (e) {
      return { error: `Failed to list directory: ${e.message}` };
    }
  },

  /**
   * read_file: Fetch content of a specific file.
   */
  async read_file({ path }, env) {
    try {
      const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
      const res = await fetch(`${origin}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      return await res.json();
    } catch (e) {
      return { error: `Failed to read file: ${e.message}` };
    }
  },

  /**
   * write_file: Save content to a file.
   */
  async write_file({ path, content }, env) {
    try {
      const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
      const res = await fetch(`${origin}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      return await res.json();
    } catch (e) {
      return { error: `Failed to write file: ${e.message}` };
    }
  },
};

/** Normalizes a flat list of paths into a nested tree structure. */
function buildTree(files, rootPath) {
  const root = { name: rootPath.split('/').pop() || '.', path: rootPath, kind: 'directory', children: [] };
  const map = { [rootPath]: root };

  files.forEach(f => {
    const parts = f.path.split('/');
    let currentPath = '';
    
    parts.forEach((part, i) => {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (!map[currentPath]) {
        const isFile = i === parts.length - 1 && !f.kind?.includes('directory');
        const node = {
          name: part,
          path: currentPath,
          kind: isFile ? 'file' : 'directory',
          size: isFile ? f.size : undefined,
          mtime: f.mtime,
          children: isFile ? undefined : []
        };
        map[currentPath] = node;
        if (map[parentPath]) {
          map[parentPath].children.push(node);
        } else if (parentPath === '' || parentPath === '.') {
             root.children.push(node);
        }
      }
    });
  });
  return root.children;
}

export const definitions = [
  {
    name: 'list_dir',
    description: 'List contents of a directory (recursive optional)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Whether to scan subdirectories' },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a specific file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write or update a file with new content',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path where the file should be saved' },
        content: { type: 'string', description: 'The code or text content to write' },
      },
      required: ['path', 'content'],
    },
  },
];
