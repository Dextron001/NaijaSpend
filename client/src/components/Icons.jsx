const Svg = ({ size = 18, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const IconDashboard = (p) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>;
export const IconReceipt = (p) => <Svg {...p}><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z" /><path d="M9 8h6M9 12h6" /></Svg>;
export const IconWallet = (p) => <Svg {...p}><path d="M19 7V6a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5" /><circle cx="16.5" cy="14" r="1.2" /></Svg>;
export const IconTarget = (p) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></Svg>;
export const IconSparkles = (p) => <Svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M18.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" /></Svg>;
export const IconSettings = (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" /></Svg>;
export const IconLogout = (p) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>;
export const IconPlus = (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconPencil = (p) => <Svg {...p}><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></Svg>;
export const IconTrash = (p) => <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></Svg>;
export const IconSearch = (p) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
export const IconDownload = (p) => <Svg {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></Svg>;
export const IconSend = (p) => <Svg {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></Svg>;
export const IconX = (p) => <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>;
export const IconChevronLeft = (p) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IconChevronRight = (p) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>;
export const IconTrendUp = (p) => <Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></Svg>;
export const IconTrendDown = (p) => <Svg {...p}><path d="M3 7l6 6 4-4 8 8" /><path d="M21 17h-7v0" /><path d="M14 17h7v-7" /></Svg>;
export const IconUser = (p) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></Svg>;
export const IconCheck = (p) => <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>;
export const IconAlert = (p) => <Svg {...p}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></Svg>;
export const IconBot = (p) => <Svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></Svg>;
export const IconCalendar = (p) => <Svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>;
export const IconArrowUpRight = (p) => <Svg {...p}><path d="M7 17L17 7" /><path d="M8 7h9v9" /></Svg>;
export const IconArrowDownRight = (p) => <Svg {...p}><path d="M7 7l10 10" /><path d="M17 8v9H8" /></Svg>;
