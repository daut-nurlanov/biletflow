const paths = {
  ticket: 'M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Zm11 0v3m0 3v1m0 2v3',
  search: 'M21 21l-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Zm-1 5h18M8 3v4m8-4v4',
  pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  chart: 'M3 3v18h18M8 16v-4m5 4V7m5 9v-6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  bell: 'M5 17h14l-2-3v-3a5 5 0 0 0-10 0v3l-2 3Zm5 3a2 2 0 0 0 4 0',
  chat: 'M21 11a8 8 0 0 1-8 8H8l-5 2 1-5a8 8 0 0 1 7-13h2a8 8 0 0 1 8 8Zm-13 0h8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 6h6m-6 4h6',
  shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-4-10 3 3 5-6',
  scan: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M4 12h16',
  qr: 'M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h3v3h-3zm6 0v6h-6m-3-9h9m-9 3v6',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-12-3a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01',
  tag: 'M3 3h8l10 10-8 8L3 11zM7 7h.01',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  )
}
