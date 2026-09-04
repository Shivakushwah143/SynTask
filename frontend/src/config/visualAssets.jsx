// Centralized visual assets for the SynTask frontend.
//
// Rules followed here:
//  - Product previews always use real SynTask UI (local build assets).
//  - Provider logos are official marks, inlined as SVG so no external requests.
//  - Photography is limited to human/business context sections (landing/auth/careers).
//  - Keep visuals small and restrained; never decorate dense operational screens.

export const PRODUCT_PREVIEW = {
  src: '/dashboard-preview.webp',
  alt: 'SynTask dashboard showing tasks, projects and operational metrics',
  loading: 'eager',
};

/* Human/team context photo for the auth screen (people, not product). */
export const TEAM_IMAGE = {
  src: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80',
  alt: 'Team collaborating in a modern office',
  loading: 'eager',
};

/* Official Google "G" mark (four-color). */
export function GoogleLogo({ className = 'h-5 w-5', title = 'Google Workspace' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title}>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

/* Official Meta mark (single blue loop). */
export function MetaLogo({ className = 'h-5 w-5', title = 'Meta' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={title}>
      <path fill="#0668E1" d="M12 3.6C7.9 3.6 4.5 6.9 4.5 11c0 3 1.7 5.6 4.1 6.9l.9-2.4c.1-.3.4-.5.8-.5.3 0 .6.2.7.5l.9 2.4 1.1-2.9c.1-.3.4-.5.7-.5h.3c2.7-.4 4.5-2.9 4.5-5.9 0-4.1-3.4-7-7.5-7zm0 9.4c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6 1.6.7 1.6 1.6-.7 1.6-1.6 1.6z" />
      <path fill="#0668E1" d="M12 3.6c-1.6 0-3.1.5-4.3 1.4 1.9.9 3.2 2.8 3.2 5 0 .9-.2 1.8-.6 2.5l.5-1.3h.4l1.2 3.2.8-2.1c.1-.3.4-.5.7-.5 3-.5 5-3 5-5.9 0-1.3-.3-2.5-.9-3.6-1.4.9-3.4 1.3-6 1.3z" opacity="0.35" />
    </svg>
  );
}

/* Biometric / sync visual used by the eTimeOffice attendance integration. */
export function BiometricSyncIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a4 4 0 011 7.9" />
      <path d="M8 21h.01M12 21h.01M16 21h.01" />
      <path d="M4 3l2.5 2.5M20 3l-2.5 2.5M12 3v2.5M12 3a9 9 0 100 18" opacity="0.55" />
    </svg>
  );
}

/* Crop anchors so one real product screenshot can preview multiple surfaces. */
const CROP_POSITIONS = [
  '50% 0%',   // top — nav + header band
  '50% 25%',  // upper-middle — KPI cards
  '50% 50%',  // center — main content
  '0% 50%',   // left — sidebar + first column
  '100% 20%', // right — action rail
];

/*
 * ProductPreviewImage — the real SynTask dashboard screenshot used as a
 * compact product preview on agent/capability cards. `crop` selects a
 * deterministic region of the same screenshot so cards don't look identical.
 */
export function ProductPreviewImage({ crop = 2, alt = PRODUCT_PREVIEW.alt, className = 'h-16' }) {
  const position = CROP_POSITIONS[Math.abs(crop) % CROP_POSITIONS.length];
  return (
    <img
      src={PRODUCT_PREVIEW.src}
      alt={alt}
      loading="lazy"
      width="1200"
      height="760"
      className={`w-full rounded-lg border border-gray-200 object-cover dark:border-gray-700 ${className}`}
      style={{ objectPosition: position }}
    />
  );
}

/*
 * MiniDashboard — a compact, CSS-rendered product preview (sidebar + chart)
 * used to give agent/capability cards a premium SaaS feel without fake images.
 * aria-hidden because it is decorative; real product UI lives on the landing page.
 */
export function MiniDashboard({ className = 'h-20' }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      <div className="flex h-full min-h-0">
        <div className="w-1/4 border-r border-gray-100 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-0.5 mb-1 h-1 rounded-sm bg-primary-500/70" />
          <div className="mx-0.5 mb-1 h-1 rounded-sm bg-gray-200 dark:bg-gray-700" />
          <div className="mx-0.5 mb-1 h-1 rounded-sm bg-gray-200 dark:bg-gray-700" />
          <div className="mx-0.5 mb-1 h-1 rounded-sm bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
          <div className="flex gap-1">
            <div className="h-2 flex-1 rounded-sm bg-primary-500/50" />
            <div className="h-2 flex-1 rounded-sm bg-gray-200 dark:bg-gray-700" />
            <div className="h-2 flex-1 rounded-sm bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="mt-auto flex flex-1 items-end gap-1">
            {[42, 68, 48, 82, 55, 72, 60].map((h, i) => (
              <div key={i} className="min-w-0 flex-1 rounded-sm bg-primary-500/40" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}