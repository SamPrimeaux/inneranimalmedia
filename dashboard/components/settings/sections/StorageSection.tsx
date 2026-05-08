import React from 'react';
import { StoragePage } from '../../StoragePage';

export type StorageSectionProps = Record<string, never>;

export function StorageSection() {
  return <StoragePage embeddedInSettings />;
}
