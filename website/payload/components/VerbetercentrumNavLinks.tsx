import Link from "next/link";

// AI Verbetercentrum (2026-07-27): zelfde registratiepatroon als
// DownloadNavLinks.tsx — custom views krijgen geen automatische nav-link,
// dit wordt apart toegevoegd aan admin.components.afterNavLinks
// (payload.config.ts), naast DownloadNavLinks.
export function VerbetercentrumNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">AI Verbetercentrum</div>
      <Link className="nav__link" href="/admin/verbetercentrum">
        AI Verbetercentrum
      </Link>
    </div>
  );
}
