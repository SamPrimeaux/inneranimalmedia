#!/usr/bin/env bash
# REMOVED: GCP VM no longer hosts git clones (stateless ExecOS only).
# Repos live on user machines + GitHub. Use agentsam_github_read/write for code I/O.
echo "✗ bootstrap-gcp-vm-repo.sh is retired — do not clone repos onto iam-tunnel." >&2
echo "  GCP VM runs ExecOS only (/home/samprimeaux/ExecOS)." >&2
echo "  Sync ExecOS key: ./scripts/sync-execos-key.sh" >&2
exit 1
