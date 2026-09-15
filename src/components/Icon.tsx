const paths = {
  calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h2m4 0h2m-8 4h2",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  leave: "M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M9 2h6v4H9zM14 12l2 2 5-5M7 12h3m-3 5h7",
  chart: "M4 3v18h17M9 17v-5m5 5V8m5 9V5",
  wallet: "M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6m14 7h6v4h-6z",
  user: "M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  left: "m14 6-6 6 6 6", right: "m10 6 6 6-6 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3m7-1v4m-2-2h4",
  check: "m5 12 4 4L19 6",
  shield: "m12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7l9-4m-4 9 3 3 5-6",
  logout: "M9 3H4v18h5m5-14 5 5-5 5m-6-5h13",
  menu: "M4 6h16M4 12h16M4 18h16", close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4m-4 4v3",
  info: "M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="icon"><path d={paths[name]} /></svg>;
}
export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand${light ? " brand-light" : ""}`}><span className="brand-mark"><Icon name="calendar" size={23} /></span><span>Roster<span className="brand-sub">GENERATOR</span></span></div>;
}
