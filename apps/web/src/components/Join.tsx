import { Icon } from './Icon';
import { content, membership } from '../content';
export function Join() {
  const copy = content.navigation.invitation;
  return (
    <section className="join-section container" aria-labelledby="join-heading">
      <span className="pixel eyebrow">{copy.eyebrow}</span>
      <h2 id="join-heading">
        {copy.heading}
        <span>{copy.highlight}</span>
      </h2>
      <p>{copy.text}</p>
      <a className="button" href={membership}>
        {copy.action} <Icon name="arrow-up-right" />
      </a>
    </section>
  );
}
