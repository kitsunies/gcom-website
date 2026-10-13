import { useEffect, useRef, useState } from 'react';
import {
  art,
  calendar,
  composition,
  local,
  membership,
  type EventSummary,
  type PageName,
  type TeamMember,
} from './content';
import { ContactForm } from './ContactForm';
import roster from '../public/data/team.json';
import snapshot from '../public/data/events.json';
import { eventDate, isCurrentEvent } from './event-date';

function Header({ page }: { page: PageName }) {
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
  const links = [
    ['home', '', 'Home'],
    ['events', '#events', 'Events'],
    ['about', 'about/', 'About Us'],
    ['team', 'team/', 'Meet the Team'],
    ['contact', 'contact/', 'Contact'],
  ];
  return (
    <header className="site-header">
      <div className="container header-inner">
        <a className="brand" href={local()} aria-label="GCOM home">
          <img
            src={local('artwork/logo-original.png')}
            alt=""
            width="56"
            height="56"
          />
          <span>
            GC<span className="yellow-text">O</span>M
          </span>
        </a>
        <button
          className="menu-toggle"
          ref={toggle}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : 'Menu'}{' '}
          <span aria-hidden="true">{open ? '×' : '+'}</span>
        </button>
        <nav
          id="main-navigation"
          className={open ? 'nav open' : 'nav'}
          aria-label="Main navigation"
        >
          {links.map(([key, path, label]) => (
            <a
              key={key}
              href={local(path)}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <a className="button small" href={membership}>
            Join the Club <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

function Mascots() {
  const [paused, setPaused] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let visible = false;
    const sync = () =>
      group.current?.setAttribute(
        'data-visible',
        String(visible && !document.hidden),
      );
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    if (group.current) observer.observe(group.current);
    document.addEventListener('visibilitychange', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return (
    <div className="mascot-area">
      <div
        className="mascots"
        ref={group}
        data-visible="false"
        data-paused={paused}
        aria-hidden="true"
      >
        <div className="mascot-glow" />
        {(['green', 'cross', 'yellow', 'coral', 'hero'] as const).map((key) => (
          <img
            key={key}
            className={`mascot character-${key}`}
            src={local(`artwork/${art[key]}`)}
            alt=""
            width="128"
            height="128"
            loading={key === 'hero' ? 'eager' : 'lazy'}
            fetchPriority={key === 'hero' ? 'high' : 'auto'}
          />
        ))}
        <span className="spark spark-one">+</span>
        <span className="spark spark-two">+</span>
        <span className="spark spark-three">+</span>
        <span className="spark spark-four">+</span>
        <div className="mascot-ground" />
        <span className="scene-label label-create">CREATE</span>
        <span className="scene-label label-play">PLAY</span>
      </div>
      <button
        className="motion-toggle"
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
      >
        {paused ? 'Play animations' : 'Pause animations'}{' '}
        <span aria-hidden="true">{paused ? '▶' : 'Ⅱ'}</span>
      </button>
    </div>
  );
}

function Join() {
  return (
    <section className="join-section container" aria-labelledby="join-heading">
      <span className="pixel eyebrow">PLAYER TWO WANTED</span>
      <h2 id="join-heading">
        Got an idea? <span>Find your party.</span>
      </h2>
      <p>
        There’s a place here for your first experiment, your next project and
        the people you’ll make it with.
      </p>
      <a className="button" href={membership}>
        Join GCOM <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}

function Events() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const events = (snapshot.events as EventSummary[])
    .filter((event) => now === null || isCurrentEvent(event, now))
    .slice(0, 6);
  return (
    <section
      className="events-section container"
      id="events"
      aria-labelledby="events-heading"
    >
      <div className="section-top">
        <div>
          <span className="eyebrow pixel">SAVE YOUR SPOT</span>
          <h2 id="events-heading">Events &amp; Announcements</h2>
        </div>
        {calendar ? (
          <a className="text-link" href={calendar}>
            Open the Luma calendar <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
      {events.length ? (
        <ul className="event-list">
          {events.map((event) => (
            <li key={event.id}>
              <a href={event.url}>
                <div>
                  <time dateTime={event.start}>{eventDate(event)}</time>
                  <h3>{event.title}</h3>
                  {event.location ? <p>{event.location}</p> : null}
                </div>
                <span className="event-action">
                  View on Luma <span aria-hidden="true">↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <span className="empty-symbol pixel" aria-hidden="true">
            [ + ]
          </span>
          <div>
            <h3>
              {calendar
                ? 'The next quest is on its way.'
                : 'Our calendar is getting ready.'}
            </h3>
            <p>
              {calendar
                ? 'No upcoming events are listed right now. Check the club calendar for the latest updates.'
                : 'Once the club calendar is connected, upcoming game jams, workshops and showcases will appear here.'}
            </p>
          </div>
        </div>
      )}
      <p className="events-note">
        Event details and registration live on Luma. Times are shown in
        Melbourne time.
      </p>
    </section>
  );
}

function Home() {
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
  const quests = [
    {
      name: 'Game Jams',
      theme: 'purple',
      label: 'BUILD SOMETHING WILD',
      text: 'Find a team, try a new idea and turn a blank canvas into something playable.',
      action: 'Find a game jam',
    },
    {
      name: 'Game Dev Workshops',
      theme: 'green',
      label: 'ADD TO YOUR TOOLKIT',
      text: 'Explore code, art, design and more. Learn with other people who love making games.',
      action: 'Explore workshops',
    },
    {
      name: 'Showcase Night',
      theme: 'yellow',
      label: 'LET IT PLAY',
      text: 'See what the club has been building, share your experiments and celebrate the community.',
      action: 'Find a showcase',
    },
  ];
  return (
    <>
      <section
        className={`hero container composition-${composition}`}
        aria-labelledby="hero-heading"
      >
        <div className="hero-copy">
          <p className="eyebrow pixel">
            <span aria-hidden="true">✣</span> MONASH UNIVERSITY{' '}
            <span className="yellow-text" aria-hidden="true">
              +
            </span>{' '}
            GAME DEV CLUB
          </p>
          <h1 id="hero-heading">
            <span>MAKE GAMES.</span>
            <span>MAKE FRIENDS.</span>
          </h1>
          <p className="hero-description">
            From your first prototype to your next game jam, find your people
            and bring wild ideas to life.
          </p>
          <div className="hero-actions">
            <a className="button" href={membership}>
              Join GCOM <span aria-hidden="true">→</span>
            </a>
            <a className="button secondary" href={local('#quests')}>
              Explore Game Jams
            </a>
          </div>
        </div>
        <Mascots />
      </section>
      <div className="divider pixel" aria-hidden="true">
        <span>✣ +</span>
        <span>
          CREATE <b>+</b> COLLABORATE <b>+</b> PLAY <b>+</b> REPEAT
        </span>
        <span>+ ✣</span>
      </div>
      <section
        className="quests-section container"
        id="quests"
        ref={questsSection}
        aria-labelledby="quests-heading"
      >
        <span className="eyebrow pixel">PICK YOUR ADVENTURE</span>
        <h2 id="quests-heading">
          <span className="heading-spark" aria-hidden="true">
            ✣
          </span>{' '}
          Your Next Quest
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
              <a className="text-link" href={local('#events')}>
                {quest.action} <span aria-hidden="true">→</span>
              </a>
              <img
                className="quest-mascot"
                src={local(
                  `artwork/${art[quest.theme as 'purple' | 'green' | 'yellow']}`,
                )}
                alt=""
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

function About() {
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">A PLACE TO PRESS START</span>
        <h1>About Us</h1>
        <p className="lead">
          We’re GCOM, the Monash University game development club. We bring
          people together to explore how games are made and create something of
          their own.
        </p>
      </section>
      <section className="about-content container">
        <div className="about-copy">
          <h2>Ideas are better together.</h2>
          <p>
            Our mission is to make game development a shared experience: a place
            to learn, experiment and find collaborators.
          </p>
          <h2>Bring your curiosity.</h2>
          <p>
            You don’t need a finished game or years of experience to get
            involved. Whether you’re interested in code, art, music,
            storytelling or design, there’s something to explore.
          </p>
          <a className="button secondary" href={local('team/')}>
            Meet the Team <span aria-hidden="true">→</span>
          </a>
        </div>
        <aside className="about-activities" aria-label="Club activities">
          <img
            src={local(`artwork/${art.green}`)}
            alt=""
            width="128"
            height="128"
          />
          <h3>What we make space for</h3>
          <ul>
            <li>
              <strong>Game jams</strong>
              <span>Make something with a team.</span>
            </li>
            <li>
              <strong>Workshops</strong>
              <span>Learn tools and try new skills.</span>
            </li>
            <li>
              <strong>Collaboration</strong>
              <span>Find people to build with.</span>
            </li>
            <li>
              <strong>Showcases</strong>
              <span>Share what you’ve created.</span>
            </li>
          </ul>
        </aside>
      </section>
      <Join />
    </>
  );
}

function Team() {
  const members = roster.members as TeamMember[];
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">THE PEOPLE BEHIND THE PLAY</span>
        <h1>Meet the Team</h1>
        <p className="lead">
          Meet the committee bringing GCOM’s activities and community together.
        </p>
      </section>
      <section
        className="team-section container"
        aria-label="Current committee"
      >
        {members.length ? (
          <div className="team-grid">
            {members.map((member) => (
              <article className="team-card" key={member.id}>
                {member.photo ? (
                  <img
                    className="profile-photo"
                    src={local(member.photo)}
                    alt={member.name}
                    width="400"
                    height="400"
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder pixel" aria-hidden="true">
                    {member.name.charAt(0)}
                  </div>
                )}
                <h2>{member.name}</h2>
                <p>{member.role}</p>
                {member.links?.length ? (
                  <ul aria-label={`${member.name} public links`}>
                    {member.links.map((link) => (
                      <li key={link.url}>
                        <a href={link.url}>
                          {link.label} <span aria-hidden="true">↗</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <img
              src={local(`artwork/${art.purple}`)}
              alt=""
              width="96"
              height="96"
            />
            <div>
              <h2>The team roster is on its way.</h2>
              <p>
                Committee profiles will appear here once the roster has been
                approved and published.
              </p>
            </div>
          </div>
        )}
      </section>
      <Join />
    </>
  );
}

function Contact() {
  return (
    <>
      <section className="page-intro container">
        <span className="eyebrow pixel">LET’S CONNECT</span>
        <h1>Contact</h1>
        <p className="lead">
          Have a question, an idea for a collaboration or something you’d like
          to share with the club?
        </p>
      </section>
      <section className="contact-section container">
        <div className="contact-layout">
          <ContactForm />
          <aside className="contact-aside">
            <img
              src={local(`artwork/${art.yellow}`)}
              alt=""
              width="192"
              height="192"
            />
            <h2>Say hello.</h2>
            <p>
              Game dev questions, club enquiries or an idea you can’t stop
              thinking about: we’d love to hear it.
            </p>
            <div className="membership-note">
              <h3>Ready to join?</h3>
              <p>
                You can join directly through the Monash Student Association.
              </p>
              <a className="text-link" href={membership}>
                Join the Club <span aria-hidden="true">↗</span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

export function App({ page }: { page: PageName }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="environment">
        <Header page={page} />
        <main id="main-content">
          {page === 'home' ? (
            <Home />
          ) : page === 'about' ? (
            <About />
          ) : page === 'team' ? (
            <Team />
          ) : (
            <Contact />
          )}
        </main>
        <footer className="footer">
          <div className="container footer-inner">
            <a className="brand" href={local()}>
              <img
                src={local('artwork/logo-original.png')}
                alt=""
                width="48"
                height="48"
              />
              <span>
                GC<span className="yellow-text">O</span>M
              </span>
            </a>
            <p>
              Make games. Make friends.
              <br />
              <span>Monash University Game Development Club</span>
            </p>
            <a href={membership}>
              Join the Club <span aria-hidden="true">↗</span>
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
