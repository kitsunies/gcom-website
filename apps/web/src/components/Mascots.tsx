import { useEffect, useRef, useState } from 'react';
import { settings, asset } from '../content';
const art = settings.artwork;
export function Mascots() {
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const group = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener('change', syncPreference);
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
      preference.removeEventListener('change', syncPreference);
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return (
    <div className="mascot-area">
      <button
        type="button"
        className="mascot-scene"
        aria-label={
          paused ? 'Play mascot animations' : 'Pause mascot animations'
        }
        aria-pressed={paused}
        title={paused ? 'Play mascot animations' : 'Pause mascot animations'}
        disabled={reducedMotion}
        onClick={() => setPaused(!paused)}
      >
        <span
          className="mascots"
          ref={group}
          data-visible="false"
          data-paused={paused}
          aria-hidden="true"
        >
          <span className="mascot-glow" />
          {(['green', 'cross', 'yellow', 'coral', 'hero'] as const).map(
            (key) => (
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
            ),
          )}
          <span className="spark spark-one">+</span>
          <span className="spark spark-two">+</span>
          <span className="spark spark-three">+</span>
          <span className="spark spark-four">+</span>
          <span className="spark spark-five">+</span>
          <span className="spark spark-six">+</span>
          <span className="spark spark-seven">+</span>
          <span className="spark spark-eight">+</span>
          <span className="spark spark-nine">+</span>
          <span className="mascot-ground" />
        </span>
      </button>
    </div>
  );
}
