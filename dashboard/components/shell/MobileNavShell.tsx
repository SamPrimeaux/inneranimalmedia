import { MobileNavDrawer } from './MobileNavDrawer';
import { MobileNavHamburger } from './MobileNavHamburger';

type MobileNavShellProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  settingsIntegrationsActive: boolean;
};

/**
 * Mobile-only nav: fixed glass hamburger (left when closed, drawer right edge when open) + left drawer.
 */
export function MobileNavShell({
  open,
  onToggle,
  onClose,
  settingsIntegrationsActive,
}: MobileNavShellProps) {
  return (
    <>
      <div
        className="iam-mobile-nav-hamburger-anchor md:hidden"
        data-drawer-open={open ? 'true' : 'false'}
      >
        <MobileNavHamburger open={open} onClick={onToggle} />
      </div>
      <MobileNavDrawer
        open={open}
        onClose={onClose}
        settingsIntegrationsActive={settingsIntegrationsActive}
      />
    </>
  );
}
