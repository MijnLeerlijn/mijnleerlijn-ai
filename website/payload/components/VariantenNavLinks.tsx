import Link from "next/link";

// Multi-brand variants (2026-07-30): zelfde patroon als
// HelpdeskVragenNavLinks.tsx/DownloadNavLinks.tsx — custom views krijgen
// geen automatische nav-link, geregistreerd via admin.components.afterNavLinks
// (payload.config.ts).
export function VariantenNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">Varianten</div>
      <Link className="nav__link" href="/admin/varianten">
        Varianten
      </Link>
    </div>
  );
}
