import { Icon } from './Icon';
import { useEffect, useRef, useState } from 'react';
import { settings, asset } from '../content';
const art = settings.artwork;
const motion = {
  create: 'CREATE',
  play: 'PLAY',
  pauseLabel: 'Pause animations',
  playLabel: 'Play animations',
};
export function Mascots() {
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
            src={asset(art[key])}
            alt={art[key].alt}
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
        <span className="scene-label label-create">{motion.create}</span>
        <span className="scene-label label-play">{motion.play}</span>
      </div>
      <button
        className="motion-toggle"
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
      >
        {paused ? motion.playLabel : motion.pauseLabel}{' '}
        <Icon name={paused ? 'play' : 'pause'} />
      </button>
    </div>
  );
}
