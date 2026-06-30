import { ArtifactsDriveShell } from '../../src/components/library/ArtifactsDriveShell';

/** Canonical /dashboard/projects — GCP Library shell, project-scoped. */
export default function ProjectsPage() {
  return (
    <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
      <ArtifactsDriveShell />
    </div>
  );
}
