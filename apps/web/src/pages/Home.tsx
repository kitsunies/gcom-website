import { useEffect, useRef, Fragment, type CSSProperties } from 'react';
import { asset, href, membership, art, composition } from '../content';
import { Join } from '../components/Join';
import { Mascots } from '../components/Mascots';
import { Events } from '../components/Events';

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const splitGraphemes = (text: string) =>
  Array.from(characters.segment(text), ({ segment }) => segment);
const homeCopy = {
  hero: {
    heading: ['BUILD IT', 'YOUR WAY'],
    description:
      "Explore Game Development and Game Design with GCOM. Let's create cool experiences together!",
    joinLabel: 'Join GCOM',
    explore: { label: 'Explore Game Jams', url: '#quests' },
  },
  divider: ['CREATE', 'COLLABORATE', 'PLAY', 'REPEAT'],
  questsHeading: 'Your Next Quest',
  quests: [
    {
      name: 'Game Jams',
      theme: 'purple',
      label: 'NETHERITE FORMS UNDER PRESSURE',
      text: 'Build a game in a short time with a team!',
      action: { label: 'Find a game jam', url: '#events' },
    },
    {
      name: 'Workshops',
      theme: 'green',
      label: "LET'S BUILD IT",
      text: 'Explore code, art, design and more. Learn with other people who love making games.',
      action: { label: 'Explore workshops', url: '#events' },
    },
    {
      name: 'Showcase Night',
      theme: 'yellow',
      label: 'THE SHOW MUST GO ON',
      text: 'See what the club has been building, share your experiments and celebrate the community.',
      action: { label: 'Find a showcase', url: '#events' },
    },
  ],
};

export function Home() {
  const copy = homeCopy;
  const questsSection = useRef<HTMLElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-arrived', 'true');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    questsSection.current
      ?.querySelectorAll('.quest-card')
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  const { quests } = copy;
  return (
    <>
      <section
        className={`hero container composition-${composition}`}
        aria-labelledby="hero-heading"
      >
        <div className="hero-copy">
          <h1 id="hero-heading" aria-label={copy.hero.heading.join(' ')}>
            {copy.hero.heading.map((line, index) => (
              <span className="hero-word" aria-hidden="true" key={index}>
                {splitGraphemes(line).map((letter, position) => (
                  <span
                    className="hero-letter"
                    style={
                      {
                        '--letter-index': Math.min(position, 7),
                      } as CSSProperties
                    }
                    key={position}
                  >
                    {letter === ' ' ? '\u00a0' : letter}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className="hero-description">{copy.hero.description}</p>
          <div className="hero-actions">
            <a className="button" href={membership}>
              {copy.hero.joinLabel} <span aria-hidden="true">→</span>
            </a>
            <a className="button secondary" href={href(copy.hero.explore.url)}>
              {copy.hero.explore.label}
            </a>
          </div>
        </div>
        <Mascots />
      </section>
      <div className="divider pixel" aria-hidden="true">
        <span>✣ +</span>
        <span>
          {copy.divider.map((word, index) => (
            <Fragment key={index}>
              {index ? (
                <>
                  {' '}
                  <b>+</b>{' '}
                </>
              ) : null}
              {word}
            </Fragment>
          ))}
        </span>
        <span>+ ✣</span>
      </div>
      <section
        className="quests-section container"
        id="quests"
        ref={questsSection}
        aria-labelledby="quests-heading"
      >
        <h2 id="quests-heading">
          <span className="heading-spark" aria-hidden="true">
            ✣
          </span>{' '}
          {copy.questsHeading}
        </h2>
        <div className="quest-grid">
          {quests.map((quest) => (
            <article className={`quest-card ${quest.theme}`} key={quest.name}>
              <div className="quest-heading">
                <span className="quest-symbol pixel" aria-hidden="true">
                  {quest.theme === 'purple'
                    ? '✣'
                    : quest.theme === 'green'
                      ? '</>'
                      : '★'}
                </span>
                <h3>{quest.name}</h3>
              </div>
              <p className="quest-label pixel">{quest.label}</p>
              <p>{quest.text}</p>
              <a className="text-link" href={href(quest.action.url)}>
                {quest.action.label} <span aria-hidden="true">→</span>
              </a>
              <img
                className="quest-mascot"
                src={asset(art[quest.theme as 'purple' | 'green' | 'yellow'])}
                alt={art[quest.theme as 'purple' | 'green' | 'yellow'].alt}
                width="128"
                height="128"
                loading="lazy"
              />
            </article>
          ))}
        </div>
      </section>
      <Events />
      <Join />
    </>
  );
}
