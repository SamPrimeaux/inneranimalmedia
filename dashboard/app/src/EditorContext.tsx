/**
 * EditorContext — Multi-tab buffer management for Agent Sam IDE.
 *
 * Tab identity is derived from the most specific available source key
 * (r2Key, githubPath, driveFileId, workspacePath, name) to prevent
 * collisions across storage backends.
 */

import React, {
  createContext, useContext, useState,
  useCallback, ReactNode,
} from 'react';
import type { ActiveFile } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditorTab extends ActiveFile {
  id:               string;
  isDirty:          boolean;
  lastSavedContent: string;
}

interface EditorContextType {
  tabs:               EditorTab[];
  activeTabId:        string | null;
  openFile:           (file: ActiveFile) => void;
  closeFile:          (id: string) => void;
  setActiveTab:       (id: string) => void;
  updateActiveContent:(content: string) => void;
  updateActiveFile:   (updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => void;
  saveActiveFile:     (onSave: (id: string, content: string) => Promise<void>) => Promise<void>;
  discardChanges:     (id: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const EditorContext = createContext<EditorContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derive a stable, unique tab ID from the most specific storage key available.
 * Order: r2 → github → drive → workspacePath → name
 */
function getFileId(file: ActiveFile): string {
  if (file.r2Key && file.r2Bucket)    return `r2:${file.r2Bucket}/${file.r2Key}`;
  if (file.githubRepo && file.githubPath) return `gh:${file.githubRepo}/${file.githubPath}`;
  if (file.driveFileId)               return `drive:${file.driveFileId}`;
  if (file.workspacePath?.trim())     return `local:${file.workspacePath.trim()}`;
  return `buf:${file.name || 'untitled'}`;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs]               = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openFile = useCallback((file: ActiveFile) => {
    const id = getFileId(file);
    setTabs(prev => {
      const existing = prev.find(t => t.id === id);
      if (existing) {
        // Update content if the file has changed externally (e.g. R2 reload)
        if (existing.content !== file.content && !existing.isDirty) {
          return prev.map(t =>
            t.id === id
              ? { ...t, ...file, id, lastSavedContent: file.content, isDirty: false }
              : t
          );
        }
        return prev;
      }
      const newTab: EditorTab = {
        ...file,
        id,
        isDirty:          false,
        lastSavedContent: file.content,
      };
      return [...prev, newTab];
    });
    setActiveTabId(id);
  }, []);

  const closeFile = useCallback((id: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      setActiveTabId(current => {
        if (current !== id) return current;
        return filtered.length > 0 ? filtered[filtered.length - 1].id : null;
      });
      return filtered;
    });
  }, []);

  const updateActiveContent = useCallback((content: string) => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId
        ? { ...t, content, isDirty: content !== t.lastSavedContent }
        : t
    ));
  }, [activeTabId]);

  const updateActiveFile = useCallback((
    updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)
  ) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const result = typeof updates === 'function'
        ? updates(t as ActiveFile)
        : { ...t, ...updates };
      if (!result) return t;
      return {
        ...t,
        ...result,
        id:     t.id, // never let updates overwrite the stable tab id
        isDirty: result.content !== t.lastSavedContent,
      };
    }));
  }, [activeTabId]);

  const saveActiveFile = useCallback(async (
    onSave: (id: string, content: string) => Promise<void>
  ) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    await onSave(tab.id, tab.content);
    setTabs(prev => prev.map(t =>
      t.id === activeTabId
        ? { ...t, isDirty: false, lastSavedContent: t.content }
        : t
    ));
  }, [activeTabId, tabs]);

  const discardChanges = useCallback((id: string) => {
    setTabs(prev => prev.map(t =>
      t.id === id
        ? { ...t, content: t.lastSavedContent, isDirty: false }
        : t
    ));
  }, []);

  return (
    <EditorContext.Provider value={{
      tabs,
      activeTabId,
      openFile,
      closeFile,
      setActiveTab:        setActiveTabId,
      updateActiveContent,
      updateActiveFile,      // was missing from original
      saveActiveFile,
      discardChanges,
    }}>
      {children}
    </EditorContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within EditorProvider');
  return context;
};
