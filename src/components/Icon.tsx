import type { SVGProps } from "react";

const paths = {
  plus: "M12 5v14M5 12h14",
  folder: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 10h18",
  chevron: "m9 5 7 7-7 7",
  arrow: "M12 19V5m-6 6 6-6 6 6",
  archive: "M4 8h16v12H4ZM3 4h18v4H3Zm6 8h6",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0ZM7 10h10M7 14h6",
  sparkle: "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6ZM20 2v4m-2-2h4",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18",
  bug: "M8 9h8v7a4 4 0 0 1-8 0ZM9 9V7a3 3 0 0 1 6 0v2M5 6l3 3m8 0 3-3M3 13h5m8 0h5M4 20l4-3m8 0 4 3M12 10v10",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  terminal: "m5 7 5 5-5 5m8 0h6",
  edit: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15ZM13 20h8",
  refresh: "M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5m-4 9a8 8 0 0 0 14 2l3-3m-5 0h5v5",
  settings: "m10 3-.6 2.5-2 .9L5 5.7 3 9l1.8 1.8v2.4L3 15l2 3.3 2.4-.7 2 .9L10 21h4l.6-2.5 2-.9 2.4.7 2-3.3-1.8-1.8v-2.4L21 9l-2-3.3-2.4.7-2-.9L14 3Zm5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  shield: "M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Zm-4 9 3 3 5-6",
  stop: "M6 6h12v12H6Z",
  layers: "m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  check: "m5 12 4 4L19 6",
  attach: "m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9m-5 11 7-7",
  close: "m6 6 12 12M6 18 18 6",
  plan: "M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01",
  speaker: "M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
} as const;

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ui-icon" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
