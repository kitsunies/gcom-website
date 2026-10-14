import { Icon } from './Icon';
import { useEffect, useRef, useState } from 'react';
import {
  content,
  asset,
  href,
  local,
  membership,
  type PageName,
} from '../content';
export function Header({ page }: { page: PageName }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 1100) setOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', dismiss);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  const { links } = content.navigation;
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a
          className="brand"
          href={local()}
          aria-label={content.navigation.brandLabel}
        >
          <img
            src={asset(content.settings.logo)}
            alt={content.settings.logo.alt}
            width="36"
            height="36"
          />
          <span>
            {content.settings.brand.before}
            <span className="yellow-text">
              {content.settings.brand.highlight}
            </span>
            {content.settings.brand.after}
          </span>
        </a>
        <button
          className="menu-toggle"
          ref={toggle}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? content.navigation.menuClose : content.navigation.menuOpen}{' '}
          <span aria-hidden="true">{open ? '×' : '+'}</span>
        </button>
        <nav
          id="main-navigation"
          className={open ? 'nav open' : 'nav'}
          aria-label={content.navigation.label}
        >
          {links.map(({ key, url, label }) => (
            <a
              key={key}
              href={href(url)}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <a className="button small" href={membership}>
            {content.navigation.joinLabel} <Icon name="arrow-up-right" />
          </a>
        </nav>
      </div>
    </header>
  );
}
