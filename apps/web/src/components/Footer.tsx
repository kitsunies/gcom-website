import { Icon } from './Icon';
import { content, asset, local, membership } from '../content';
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <a className="brand" href={local()}>
          <img
            src={asset(content.settings.logo)}
            alt={content.settings.logo.alt}
            width="48"
            height="48"
          />
          <span>
            {content.settings.brand.before}
            <span className="yellow-text">
              {content.settings.brand.highlight}
            </span>
            {content.settings.brand.after}
          </span>
        </a>
        <p>
          {content.navigation.footer.tagline}
          <br />
          <span>{content.navigation.footer.description}</span>
        </p>
        <div className="footer-links">
          <a href={membership}>
            {content.navigation.footer.joinLabel} <Icon name="arrow-up-right" />
          </a>
          <a href={content.navigation.footer.instagram.url}>
            {content.navigation.footer.instagram.label}{' '}
            <Icon name="arrow-up-right" />
          </a>
          <a href={content.navigation.footer.discord.url}>
            {content.navigation.footer.discord.label}{' '}
            <Icon name="arrow-up-right" />
          </a>
        </div>
      </div>
    </footer>
  );
}
