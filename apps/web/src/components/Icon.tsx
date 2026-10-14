const paths = {
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  play: 'M8 5v14l11-7Z',
  pause: 'M9 5v14M15 5v14',
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
