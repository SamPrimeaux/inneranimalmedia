type MobileNavHamburgerProps = {
  open: boolean;
  onClick: () => void;
};

/** Glassmorphic circular hamburger — mobile shell only (CSS lines, no icon lib). */
export function MobileNavHamburger({ open, onClick }: MobileNavHamburgerProps) {
  return (
    <button
      type="button"
      className="iam-mobile-nav-hamburger"
      data-open={open ? 'true' : 'false'}
      aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
      aria-expanded={open}
      onClick={onClick}
    >
      <span className="iam-mobile-nav-hamburger__lines" aria-hidden>
        <span className="iam-mobile-nav-hamburger__line iam-mobile-nav-hamburger__line--1" />
        <span className="iam-mobile-nav-hamburger__line iam-mobile-nav-hamburger__line--2" />
        <span className="iam-mobile-nav-hamburger__line iam-mobile-nav-hamburger__line--3" />
      </span>
    </button>
  );
}
