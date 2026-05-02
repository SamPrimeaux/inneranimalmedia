import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ActiveFile } from '../types';

/**
 * IDE Editor Context — Handles multi-tab buffers and state.
 */

export interface EditorTab extends ActiveFile {
  id: string; // Typically the file path
  isDirty: boolean;
  lastSavedContent: string;
}

interface EditorContextType {
  tabs: EditorTab[];
  activeTabId: string | null;
  openFile: (file: ActiveFile) => void;
  closeFile: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateActiveContent: (content: string) => void;
  updateActiveFile: (updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => void;
  saveActiveFile: (onSave: (id: string, content: string) => Promise<void>) => Promise<void>;
  discardChanges: (id: string) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export const EditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const getFileId = (file: ActiveFile) => {
    return file.workspacePath || file.name;
  };

  const openFile = useCallback((file: ActiveFile) => {
    const id = getFileId(file);
    setTabs(prev => {
      // If already open, just switch
      if (prev.find(t => t.id === id)) return prev;
      
      const newTab: EditorTab = {
        ...file,
        id,
        isDirty: false,
        lastSavedContent: file.content
      };
      return [...prev, newTab];
    });
    setActiveTabId(id);
  }, []);

  const closeFile = useCallback((id: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      // Logic for switching active tab if we closed the active one
      if (activeTabId === id) {
        setActiveTabId(filtered.length > 0 ? filtered[filtered.length - 1].id : null);
      }
      return filtered;
    });
  }, [activeTabId]);

  const updateActiveContent = useCallback((content: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, content, isDirty: content !== t.lastSavedContent };
      }
      return t;
    }));
  }, [activeTabId]);

  const updateActiveFile = useCallback((updates: Partial<ActiveFile> | ((prev: ActiveFile | null) => ActiveFile | null)) => {
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        const currentAsActiveFile: ActiveFile = { ...t };
        const result = typeof updates === 'function' ? updates(currentAsActiveFile) : { ...t, ...updates };
        if (!result) return t; // Handle null from functional update
        return { ...t, ...result, isDirty: result.content !== t.lastSavedContent };
      }
      return t;
    }));
  }, [activeTabId]);

  const saveActiveFile = useCallback(async (onSave: (id: string, content: string) => Promise<void>) => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    await onSave(tab.id, tab.content);
    
    setTabs(prev => prev.map(t => {
      if (t.id === activeTabId) {
        return { ...t, isDirty: false, lastSavedContent: t.content };
      }
      return t;
    }));
  }, [activeTabId, tabs]);

  const discardChanges = useCallback((id: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, content: t.lastSavedContent, isDirty: false };
      }
      return t;
    }));
  }, []);

  return (
    <EditorContext.Provider value={{ 
      tabs, 
      activeTabId, 
      openFile, 
      closeFile, 
      setActiveTab: setActiveTabId,
      updateActiveContent,
      updateActiveFile,
      saveActiveFile,
      discardChanges
    }}>
      {children}
    </EditorContext.Provider>
  );
};

export const useEditor = () => {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditor must be used within EditorProvider');
  return context;
};
