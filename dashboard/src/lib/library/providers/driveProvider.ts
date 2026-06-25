import { mapDriveFile, sortLibraryItems } from '../mappers';
import { fetchDriveListing, fetchGoogleIntegrationReady, searchDriveFiles } from '../libraryApi';
import type { LibraryListResult, LibraryProvider } from '../types';

export const driveProvider: LibraryProvider = {
  source: 'drive',
  label: 'Google Drive',
  async list(params) {
    const connected = await fetchGoogleIntegrationReady(params.signal);
    if (!connected) {
      return {
        items: [],
        driveConnected: false,
        error: 'Connect Google Drive to browse files',
      };
    }

    const q = params.query?.trim();
    if (q && q.length >= 2) {
      const search = await searchDriveFiles(q, params.signal);
      if (!search.ok) return { items: [], driveConnected: true, error: search.error };
      return {
        items: sortLibraryItems(search.files.map(mapDriveFile)),
        driveConnected: true,
      };
    }

    const folderId = params.driveFolderId || 'root';
    const listing = await fetchDriveListing(folderId, params.signal);
    if (listing.unauthorized) {
      return {
        items: [],
        driveConnected: false,
        error: listing.error,
      };
    }
    if (!listing.ok) {
      return { items: [], driveConnected: true, error: listing.error };
    }
    return {
      items: sortLibraryItems(listing.files.map(mapDriveFile)),
      driveConnected: true,
    };
  },
};
