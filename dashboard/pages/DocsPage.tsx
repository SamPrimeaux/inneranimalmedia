/**
 * DocsPage — /dashboard/docs
 * Standalone documentation hub (CMS pages, rules, project context).
 */
import React from 'react';
import { DocsSection } from '../components/settings/sections/DocsSection';

export const DocsPage: React.FC = () => (
  <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-y-auto overscroll-y-contain p-4 md:p-6">
    <DocsSection />
  </div>
);
