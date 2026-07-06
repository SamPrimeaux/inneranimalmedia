const STORAGE_KEY = 'colab_user_task_lists';

export function loadUserTaskLists(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || '').trim())
      .filter((name) => name && name !== 'My Tasks');
  } catch {
    return [];
  }
}

export function saveUserTaskList(name: string) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed === 'My Tasks') return;
  const lists = loadUserTaskLists();
  if (lists.includes(trimmed)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...lists, trimmed]));
}

export function removeUserTaskList(name: string) {
  const trimmed = String(name || '').trim();
  const lists = loadUserTaskLists().filter((n) => n !== trimmed);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}
