import React from 'react';
import { ShellDropdownLinkRow, ShellDropdownPanel, ShellDropdownRow } from './ShellDropdownPanel';

export const LOCAL_PTY_HOST = 'localpty.inneranimalmedia.com';
export const CLOUD_TERMINAL_HOST = 'terminal.inneranimalmedia.com';

export type ConnectionMenuAction =
  | 'local_pty'
  | 'cloud_terminal'
  | 'gcp_vm'
  | 'ssh_config'
  | 'pty_setup_wizard'
  | 'configure_terminal';

export type ConnectionMenuPanelProps = {
  open: boolean;
  onClose: () => void;
  onAction: (action: ConnectionMenuAction) => void;
  variant?: 'floating' | 'anchored';
};

export function ConnectionMenuPanel({
  open,
  onClose,
  onAction,
  variant = 'floating',
}: ConnectionMenuPanelProps) {
  if (!open) return null;

  const run = (action: ConnectionMenuAction) => {
    onAction(action);
    onClose();
  };

  return (
    <ShellDropdownPanel
      variant={variant}
      title="Select a connection option"
      aria-label="Terminal connection options"
      footer={
        <>
          <ShellDropdownRow
            label="PTY Setup Wizard"
            onClick={() => run('pty_setup_wizard')}
          />
          <ShellDropdownRow
            label="Configure Terminal Settings"
            onClick={() => run('configure_terminal')}
          />
        </>
      }
    >
      <div className="py-1 overflow-y-auto flex-1 min-h-0">
        <ShellDropdownRow
          label="Connect to Local PTY…"
          hint={LOCAL_PTY_HOST}
          onClick={() => run('local_pty')}
        />
        <ShellDropdownRow
          label="Connect to Cloud Terminal…"
          hint={CLOUD_TERMINAL_HOST}
          onClick={() => run('cloud_terminal')}
        />
        <ShellDropdownRow
          label="Connect to GCP VM…"
          hint="Remote-SSH"
          badge="Remote-SSH"
          onClick={() => run('gcp_vm')}
        />
        <ShellDropdownLinkRow
          label="Open SSH Configuration…"
          href="/dashboard/settings/network"
          onNavigate={() => onClose()}
        />
      </div>
    </ShellDropdownPanel>
  );
}
