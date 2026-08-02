type IconProps = { size?: number; className?: string };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function DashboardIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function SourcesIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M4.5 20c0-3.5 3.2-6 7.5-6s7.5 2.5 7.5 6" />
    </svg>
  );
}

export function TopicsIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2 2 8.5l10 6 10-6L12 2Z" />
      <path d="M2 15.5 12 22l10-6.5" />
      <path d="M2 12l10 6.5L22 12" />
    </svg>
  );
}

export function AlertsIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 8.5c0-3.3-2.7-6-6-6s-6 2.7-6 6c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M10.3 19a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}

export function DiscoveryIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.4-4.4" />
      <path d="m13.2 8.8-1.7 3.7-3.7 1.7 1.7-3.7 3.7-1.7Z" />
    </svg>
  );
}

export function KnowledgeIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 4.5h9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H4Z" />
      <path d="M4 4.5v13" />
    </svg>
  );
}

export function SettingsIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8.6a1.7 1.7 0 0 0 1-1.55V2.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8.6a1.7 1.7 0 0 0 1.55 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </svg>
  );
}

export function SearchIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.4-4.4" />
    </svg>
  );
}

export function BellIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 8.5c0-3.3-2.7-6-6-6s-6 2.7-6 6c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
      <path d="M10.3 19a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}

export function PlusIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChevronRightIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ExternalLinkIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 13v5.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11" />
    </svg>
  );
}

export function CheckIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function XIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function RefreshIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function SparkleIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

export function TrendUpIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function LightbulbIcon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a6.5 6.5 0 0 0-4 11.6c.7.6 1.1 1.4 1.1 2.4h5.8c0-1 .4-1.8 1.1-2.4A6.5 6.5 0 0 0 12 2Z" />
    </svg>
  );
}
