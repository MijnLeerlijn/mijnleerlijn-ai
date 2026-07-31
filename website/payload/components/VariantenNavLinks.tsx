import Link from "next/link";

// Menu-herindeling (2026-07-31): alle vijf Varianten-beheerschermen in één
// navigatiegroep — vervangt de eerder losse DownloadNavLinks.tsx en
// HelpdeskVragenNavLinks.tsx (verwijderd, samengevoegd hierin) zodat er nog
// maar één "Varianten"-sectie in de sidebar staat, in plaats van drie losse
// groepjes. Klasse "nav-group"/"nav__link" hergebruikt Payload's eigen
// stijl voor nav-items — geen nieuw designsysteem.
export function VariantenNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">Varianten</div>
      <Link className="nav__link" href="/admin/varianten">
        Varianten
      </Link>
      <Link className="nav__link" href="/admin/kennisbasis">
        Kennisbasis
      </Link>
      <Link className="nav__link" href="/admin/download-beheer">
        Downloadbeheer
      </Link>
      <Link className="nav__link" href="/admin/download-categorieen">
        Downloadcategorieën
      </Link>
      <Link className="nav__link" href="/admin/helpdesk-vragen">
        Helpdeskvragen
      </Link>
    </div>
  );
}
