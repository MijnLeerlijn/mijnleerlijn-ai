import Link from "next/link";

// Downloadbeheer (2026-07-27): custom views (admin.components.views) krijgen
// GEEN automatische nav-link — Payload biedt daar geen config-optie voor.
// Geregistreerd via admin.components.afterNavLinks (payload.config.ts).
// Klasse "nav__link" hergebruikt Payload's eigen stijl voor nav-items
// (@payloadcms/next/dist/prod/styles.css) zodat dit niet als vreemde eend
// oogt tussen de collectie-links.
export function DownloadNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">Downloads</div>
      <Link className="nav__link" href="/admin/download-beheer">
        Downloadbeheer
      </Link>
      <Link className="nav__link" href="/admin/download-categorieen">
        Downloadcategorieën
      </Link>
    </div>
  );
}
