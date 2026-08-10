import Link from "next/link";

// Menu-herindeling (2026-07-31): vervangt VerbetercentrumNavLinks.tsx (eigen
// "AI Verbetercentrum"-groepje) — AI Verbetercentrum hoort onder Basis, zie
// het technisch ontwerp. Ruimte voor toekomstige Basis-schermen zonder
// eigen collectie-nav-link (naar dit patroon, niet een nieuw groepje per
// scherm).
export function BasisNavLinks() {
  return (
    <div className="nav-group">
      <div className="nav-group__label">Basis</div>
      <Link className="nav__link" href="/admin/verbetercentrum">
        AI Verbetercentrum
      </Link>
      <Link className="nav__link" href="/admin/curriculum-werkplaats">
        Curriculum Werkplaats
      </Link>
    </div>
  );
}
