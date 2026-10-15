const paths = {
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  play: 'M8 5v14l11-7Z',
  pause: 'M9 5v14M15 5v14',
  linkedin: 'M6 9v9M6 6v.01M10 18v-9m0 4a4 4 0 0 1 8 0v5M4 3h16v18H4z',
  github:
    'M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.43v-1.5c-2.52.55-3.05-1.07-3.05-1.07-.41-1.05-1-1.33-1-1.33-.82-.56.06-.55.06-.55.91.06 1.39.93 1.39.93.81 1.39 2.13.99 2.65.75.08-.59.32-.99.58-1.22-2.01-.23-4.13-1-4.13-4.47 0-.99.35-1.8.93-2.44-.09-.23-.4-1.16.09-2.41 0 0 .76-.24 2.48.93a8.6 8.6 0 0 1 4.52 0c1.72-1.17 2.48-.93 2.48-.93.49 1.25.18 2.18.09 2.41.58.64.93 1.45.93 2.44 0 3.48-2.12 4.24-4.14 4.46.33.29.62.83.62 1.68v2.32c0 .24.16.52.62.43A9 9 0 0 0 12 3Z',
  instagram:
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5-1.5h.01',
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={name === 'github' ? 'currentColor' : 'none'}
      stroke={name === 'github' ? 'none' : 'currentColor'}
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
