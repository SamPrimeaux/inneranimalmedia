import { MobileNavDrawer } from './MobileNavDrawer';
import { MobileNavHamburger } from './MobileNavHamburger';
import { MobileNavBackButton } from './MobileNavBackButton';

type MobileNavShellProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  settingsIntegrationsActive: boolean;
  showBack?: boolean;
  backLabel?: string | null;
  onBack?: () => void;
  /** Agent thread active — hamburger morphs to back chevron. */
  hamburgerBackMode?: boolean;
  onHamburgerBack?: () => void;
};

/**
 * Mobile-only nav: floating back (when needed) + glass hamburger + left drawer — not in the top header.
 */
export function MobileNavShell({
  open,
  onToggle,
  onClose,
  settingsIntegrationsActive,
  showBack = false,
  backLabel = null,
  onBack,
  hamburgerBackMode = false,
  onHamburgerBack,
}: MobileNavShellProps) {
  return (
    <>
      <div
        className="iam-mobile-nav-controls hidden max-phone:flex"
        data-drawer-open={open ? 'true' : 'false'}
        data-has-back={showBack ? 'true' : 'false'}
      >
        {showBack && onBack ? (
          <MobileNavBackButton label={backLabel} onClick={onBack} />
        ) : null}
        <div className="iam-mobile-nav-hamburger-anchor">
          <MobileNavHamburger
            open={open}
            backMode={hamburgerBackMode}
            onClick={hamburgerBackMode && onHamburgerBack ? onHamburgerBack : onToggle}
          />
        </div>
      </div>
      <MobileNavDrawer
        open={open}
        onClose={onClose}
        settingsIntegrationsActive={settingsIntegrationsActive}
      />
    </>
  );
}
