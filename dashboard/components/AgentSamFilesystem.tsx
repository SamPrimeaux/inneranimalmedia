import React from 'react';
import { LocalExplorer, type LocalExplorerProps } from './LocalExplorer';

/** Unified Agent Sam file browser — one tabbed surface for local, R2, GitHub, and Drive. */
export const AgentSamFilesystem: React.FC<Omit<LocalExplorerProps, 'presentation'>> = (props) => (
  <LocalExplorer {...props} presentation="unified" />
);

export default AgentSamFilesystem;
