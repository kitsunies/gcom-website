import { useEffect, useRef, Fragment, type CSSProperties } from 'react';
import { content, asset, href, membership, art, composition } from '../content';
import { Join } from '../components/Join';
import { Mascots } from '../components/Mascots';
import { Events } from '../components/Events';

const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function Home() {
  const copy = content.home;
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
          <p className="eyebrow pixel">
            <span aria-hidden="true">✣</span> {copy.hero.university}{' '}
            <span className="yellow-text">{copy.hero.club}</span>
          </p>
          <h1 id="hero-heading" aria-label={copy.hero.heading.join(' ')}>
            {copy.hero.heading.map((line, index) => (
              <span className="hero-word" aria-hidden="true" key={index}>
                {Array.from(characters.segment(line)).map(
                  ({ segment: letter }, position) => (
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
                  ),
                )}
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
        <span className="eyebrow pixel">{copy.questsEyebrow}</span>
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
