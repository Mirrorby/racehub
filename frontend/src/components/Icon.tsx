type IconName = "home" | "calendar" | "trophy" | "more" | "flag" | "user" | "team" | "settings" | "bell" | "globe";
const paths: Record<IconName, string> = {
  home: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z", calendar: "M5 3v3m14-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1z", trophy: "M8 4h8v5a4 4 0 0 1-8 0V4zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v5m-4 2h8", more: "M5 12h.01M12 12h.01M19 12h.01", flag: "M5 21V4m0 1h11l-2 4 2 4H5", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0", team: "M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-1a2.5 2.5 0 1 0 0-5m-13 15a5 5 0 0 1 10 0m1-4a4 4 0 0 1 7 4", settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8-3.5 2-1-2-3-2 .4-1.3-1.3.4-2-3-2-1 2 .4 2-1.3 1.3-2-.4-2 3 2 1", bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9zm-8 12h4", globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-18c3 3 3 15 0 18m0-18c-3 3-3 15 0 18M3 12h18",
};
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={paths[name]} /></svg>;
}
