// Centrale e-mailhandtekening (2026-08-24) — zie het onderzoeksverslag:
// er bestaat in dit project GEEN centrale bron met bedrijfsgegevens
// (adres/telefoon/KvK), en die worden hier dus bewust NIET verzonnen. De
// enige twee bevestigde, bestaande "bron van waarheid"-gegevens zijn
// hergebruikt:
//  - "MijnLeerlijn | Onderdeel van sCoolsuite B.V." — exact dezelfde tekst
//    als lib/variant/default-website-teksten.ts se standaardFooterTekst().
//  - "mijnleerlijn.chat" — NEXT_PUBLIC_ROOT_DOMAIN in .env.example, het
//    root-domein waaronder alle varianten draaien.
// Geen telefoonnummer/algemeen e-mailadres: die staan nergens in dit
// project als vaststaand gegeven (CONTACT_FROM_EMAIL/CONTACT_NOTIFICATION_EMAIL
// zijn systeemadressen — "noreply@"/een intern verzameladres — geen
// klantcontactadres om in een handtekening te zetten).
//
// Twee vormen (spec §12): HTML én plain-text, beide pure functies (geen
// env-reads/I/O hier — zelfde "geef expliciet mee wat nodig is"-conventie
// als elders in dit project, bv. lib/trainers/training-weergave.ts se
// vandaagIso-parameter).

const WEBSITE = "mijnleerlijn.chat";
const BEDRIJFSREGEL = "Onderdeel van sCoolsuite B.V.";

export interface HandtekeningInvoer {
  /** Naam van de ingelogde medewerker die deze mail verstuurt — null voor een algemene/systeemafzender (spec §11: "geen hardcoded naam in de algemene mailtemplate"). */
  naam: string | null;
}

/**
 * Plain-text-handtekening — de enige vorm met vandaag een echte consument
 * (lib/google-gmail/api.ts se verstuurAntwoord is text/plain-only, zie het
 * onderzoeksverslag). Twee lege regels vóór de handtekening, zelfde
 * conventie als een handmatig getypte e-mailhandtekening.
 */
export function handtekeningTekst({ naam }: HandtekeningInvoer): string {
  return ["", "", "Met vriendelijke groet,", "", naam ?? "Team MijnLeerlijn", "MijnLeerlijn", `${BEDRIJFSREGEL} — ${WEBSITE}`].join("\n");
}

function escapeHtml(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface HandtekeningHtmlInvoer extends HandtekeningInvoer {
  /** Absolute basis-URL (bv. NEXT_PUBLIC_SERVER_URL) voor het logo — een e-mailclient heeft geen "huidige origin", dus een relatief pad werkt hier niet. Zonder deze invoer wordt het logo weggelaten (nette teksthandtekening, spec §13: "liever een nette teksthandtekening dan een fragiele grafische handtekening"). */
  baseUrl?: string;
}

/**
 * HTML-handtekening — tabel-gebaseerd, geen JavaScript/externe CSS/lettertypen
 * (spec §12: "e-mailclientveilig"). Nog geen live consument vandaag (er
 * bestaat geen HTML-mailpad in dit project, zie het onderzoeksverslag) —
 * klaar voor zodra dat er wel is. Het logo is decoratief: alle essentiële
 * gegevens (naam/bedrijf/website) staan als gewone tekst ernaast, dus blijft
 * de handtekening volledig leesbaar als een e-mailclient afbeeldingen
 * blokkeert (spec §12: "geen externe afhankelijkheden nodig om de
 * essentiële gegevens te kunnen lezen").
 */
export function handtekeningHtml({ naam, baseUrl }: HandtekeningHtmlInvoer): string {
  const weergaveNaam = escapeHtml(naam ?? "Team MijnLeerlijn");
  const logo = baseUrl
    ? `<td style="padding-right:12px;vertical-align:top;"><img src="${escapeHtml(baseUrl)}/brand/beeldmerk-kleur.png" alt="MijnLeerlijn" width="40" height="40" style="display:block;border:0;border-radius:4px;" /></td>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#1f2937;">
  <tr><td style="padding-top:16px;border-top:1px solid #e5e7eb;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${logo}
      <td style="vertical-align:top;">
        <div style="font-weight:bold;">${weergaveNaam}</div>
        <div>MijnLeerlijn</div>
        <div style="color:#6b7280;">${BEDRIJFSREGEL}</div>
        <div><a href="https://${WEBSITE}" style="color:#1588c9;text-decoration:none;">${WEBSITE}</a></div>
      </td>
    </tr></table>
  </td></tr>
</table>`;
}
