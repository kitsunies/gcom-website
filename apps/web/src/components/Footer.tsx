import { Icon } from './Icon';
import { settings, asset, local, membership } from '../content';
const footer = {
  tagline: 'Make games. Make friends.',
  description: 'Monash University Game Development Club',
  joinLabel: 'Join the Club',
  instagram: {
    label: 'Instagram',
    url: 'https://www.instagram.com/gcom_club/',
  },
  discord: { label: 'Discord', url: 'https://discord.com/invite/KmMVxTY2E' },
};
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <a className="brand" href={local()}>
          <img
            src={asset(settings.logo)}
            alt={settings.logo.alt}
            width="48"
            height="48"
          />
          <span>
            {settings.brand.before}
            <span className="yellow-text">{settings.brand.highlight}</span>
            {settings.brand.after}
          </span>
        </a>
        <p>
          {footer.tagline}
          <br />
          <span>{footer.description}</span>
        </p>
        <div className="footer-links">
          <a href={membership}>
            {footer.joinLabel} <Icon name="arrow-up-right" />
          </a>
          <a href={footer.instagram.url}>
            {footer.instagram.label} <Icon name="arrow-up-right" />
          </a>
          <a href={footer.discord.url}>
            {footer.discord.label} <Icon name="arrow-up-right" />
          </a>
        </div>
      </div>
    </footer>
  );
}
