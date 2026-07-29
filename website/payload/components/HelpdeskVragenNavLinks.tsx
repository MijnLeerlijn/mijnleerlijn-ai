import Link from "next/link";

// Homepage-herontwerp (2026-07-29): zelfde patroon als DownloadNavLinks.tsx
// — custom views krijgen geen automatische nav-link, geregistreerd via
// admin.components.afterNavLinks (payload.config.ts).
export function HelpdeskVragenNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">Helpdesk</div>
      <Link className="nav__link" href="/admin/helpdesk-vragen">
        Helpdesk-vragen
      </Link>
    </div>
  );
}
