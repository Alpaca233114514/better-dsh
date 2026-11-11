export function CyberIcon({ name = 'shield', size = 18 }: { name?: 'shield' | 'findings' | 'repo' | 'scan' | 'plus' | 'close' | 'refresh' | 'arrow' | 'search' | 'chevron'; size?: number }) {
  const paths = {
    shield: 'M12 3 4.5 6v5.5c0 4 3 7.5 7.5 9.5 4.5-2 7.5-5.5 7.5-9.5V6L12 3Zm-3 9 2 2 4-4',
    findings: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    repo: 'M5 3h14v18H5a2 2 0 0 1 0-4h14M5 3a2 2 0 0 0-2 2v14M8 7h7',
    scan: 'M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10M12 8v8',
    plus: 'M12 5v14M5 12h14', close: 'm6 6 12 12M6 18 18 6',
    refresh: 'M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7v5',
    arrow: 'M19 12H5m6-6-6 6 6 6', search: 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
    chevron: 'm9 5 7 7-7 7',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
