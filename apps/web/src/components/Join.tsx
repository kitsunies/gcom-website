import { Icon } from './Icon';
import { membership } from '../content';
const invitation = {
  heading: 'Build connections.',
  highlight: ' Build Games.',
  text: 'It takes less than a minute to join GCOM.',
  action: 'Join GCOM',
};
export function Join() {
  const copy = invitation;
  return (
    <section className="join-section container" aria-labelledby="join-heading">
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
