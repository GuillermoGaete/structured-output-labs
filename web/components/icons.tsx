/** 16 px line icons in `currentColor`, so they follow the text colour in both themes. */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 2.8v10.4l8.5-5.2z" fill="currentColor" />
  </Svg>
);
export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 2.8h2.8v10.4H4zM9.2 2.8H12v10.4H9.2z" fill="currentColor" />
  </Svg>
);
export const IconStepBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.5 2.8v10.4L3.5 8z" fill="currentColor" />
  </Svg>
);
export const IconStepForward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 2.8v10.4L12.5 8z" fill="currentColor" />
  </Svg>
);
export const IconSkipBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 2.8h2v10.4H3zM13 2.8v10.4L6 8z" fill="currentColor" />
  </Svg>
);
export const IconSkipForward = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 2.8h2v10.4h-2zM3 2.8v10.4L10 8z" fill="currentColor" />
  </Svg>
);
export const IconSliders = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4.5h12M2 8h12M2 11.5h12" {...stroke} />
    <circle cx="5.5" cy="4.5" r="1.6" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="10.5" cy="8" r="1.6" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="6.5" cy="11.5" r="1.6" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
  </Svg>
);
export const IconChevron = ({ open, ...p }: IconProps & { open: boolean }) => (
  <Svg {...p} className={`${p.className ?? ""} transition-transform ${open ? "rotate-90" : ""}`}>
    <path d="M6 3.5L10.5 8 6 12.5" {...stroke} />
  </Svg>
);
export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5L9 7M6.5 13.5h-4v-4M2.5 13.5L7 9" {...stroke} />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" {...stroke} />
  </Svg>
);
export const IconBranch = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 2.5v11M4 6.5c0 3 8 1.5 8 5" {...stroke} />
    <circle cx="12" cy="3.5" r="1.6" fill="currentColor" />
  </Svg>
);
/** Two columns side by side: a comparison. */
export const IconCompare = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="5" height="10" rx="1" {...stroke} />
    <rect x="9" y="3" width="5" height="10" rx="1" {...stroke} />
  </Svg>
);
/** A pencil. */
export const IconEdit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13l.8-3.2L10.6 3l2.4 2.4-6.8 6.8z" {...stroke} />
    <path d="M9.4 4.2l2.4 2.4" {...stroke} />
  </Svg>
);
/** A row of small bars: a distribution. */
export const IconBars = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13V8M6.5 13V4M10 13V9.5M13.5 13V6" {...stroke} />
  </Svg>
);
