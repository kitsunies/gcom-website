const paths = {
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  play: 'M8 5v14l11-7Z',
  pause: 'M9 5v14M15 5v14',
  linkedin:
    'M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm3.5 5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Zm-3 3v8h3v-8h-3Zm5 0v8h3v-4a1.5 1.5 0 0 1 3 0v4h3v-4.5a3.5 3.5 0 0 0-6-2.5v-1h-3Z',
  github:
    'M12 3a9 9 0 0 0-2.85 17.54c.45.08.62-.2.62-.43v-1.5c-2.52.55-3.05-1.07-3.05-1.07-.41-1.05-1-1.33-1-1.33-.82-.56.06-.55.06-.55.91.06 1.39.93 1.39.93.81 1.39 2.13.99 2.65.75.08-.59.32-.99.58-1.22-2.01-.23-4.13-1-4.13-4.47 0-.99.35-1.8.93-2.44-.09-.23-.4-1.16.09-2.41 0 0 .76-.24 2.48.93a8.6 8.6 0 0 1 4.52 0c1.72-1.17 2.48-.93 2.48-.93.49 1.25.18 2.18.09 2.41.58.64.93 1.45.93 2.44 0 3.48-2.12 4.24-4.14 4.46.33.29.62.83.62 1.68v2.32c0 .24.16.52.62.43A9 9 0 0 0 12 3Z',
  instagram:
    'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 10a5 5 0 1 0-10 0 5 5 0 0 0 10 0Zm-2 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm4.5-6a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z',
};

export function Icon({ name }: { name: keyof typeof paths }) {
  const filled = ['linkedin', 'github', 'instagram'].includes(name);
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} fillRule="evenodd" />
    </svg>
  );
}
