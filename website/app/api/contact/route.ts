import { NextResponse, type NextRequest } from "next/server";
import { createContactSubmission } from "@/services/payload";
import { uploadBijlage } from "@/services/storage";
import { verzendEmail } from "@/services/email";
import { optionalEnv } from "@/config/env";
import { grofApparaat, isGeldigEmail, maakRateLimiter } from "@/lib/contact/validate";

// Echte verwerking van het contactformulier — zie docs/SECURITY-AND-PRIVACY.md
// en Fase 4 Stap 8. Uitsluitend deze route mag ContactSubmissions aanmaken
// (de collection zelf staat `create` dicht voor de publieke API, zie
// payload/collections/ContactSubmissions.ts) zodat honeypot/rate-limit/
// validatie nooit omzeild kunnen worden.

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
const TOEGESTANE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

// Eenvoudige in-memory rate limiter (per IP, sliding window) — geschikt voor
// MVP-schaal op één instance. Deelt geen state tussen serverless-instances/
// regio's; bij groei vervangen door een gedeelde store (bv. Vercel KV/Upstash).
const rateLimiter = maakRateLimiter(10 * 60 * 1000, 5);

function klantIp(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "onbekend"
  );
}

export async function POST(request: NextRequest) {
  const ip = klantIp(request);
  if (!rateLimiter.magVerder(ip)) {
    return NextResponse.json(
      { error: "Te veel pogingen. Probeer het over een paar minuten opnieuw." },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ongeldige inzending." }, { status: 400 });
  }

  // Honeypot: onzichtbaar voor echte gebruikers (zie ContactForm.tsx). Bots
  // die elk veld invullen, doen dit wel — geef een schijnbaar succes terug
  // zonder verder te verwerken, zodat bots niet leren dat ze gedetecteerd zijn.
  if (String(form.get("website") ?? "").length > 0) {
    return NextResponse.json({ ok: true });
  }

  const teacherName = String(form.get("naam") ?? "").trim();
  const schoolName = String(form.get("school") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const requestType = String(form.get("soortVraag") ?? "").trim();
  const subject = String(form.get("onderwerp") ?? "").trim();
  const problemDescription = String(form.get("uitleg") ?? "").trim();
  const expected = String(form.get("verwacht") ?? "").trim() || undefined;
  const actual = String(form.get("ziet") ?? "").trim() || undefined;
  const pageUrl = String(form.get("url") ?? "").trim() || undefined;

  const verplicht = { teacherName, schoolName, email, requestType, subject, problemDescription };
  const ontbrekend = Object.entries(verplicht).filter(([, waarde]) => !waarde);
  if (ontbrekend.length > 0) {
    return NextResponse.json(
      { error: `Verplichte velden ontbreken: ${ontbrekend.map(([naam]) => naam).join(", ")}.` },
      { status: 400 }
    );
  }
  if (!isGeldigEmail(email)) {
    return NextResponse.json({ error: "Vul een geldig e-mailadres in." }, { status: 400 });
  }

  const bestanden = form.getAll("bijlagen").filter((b): b is File => b instanceof File && b.size > 0);
  if (bestanden.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Maximaal ${MAX_ATTACHMENTS} bijlagen toegestaan.` }, { status: 400 });
  }
  for (const bestand of bestanden) {
    if (bestand.size > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: `Bijlage "${bestand.name}" is groter dan 10MB.` }, { status: 400 });
    }
    if (!TOEGESTANE_MIME_TYPES.has(bestand.type)) {
      return NextResponse.json(
        { error: `Bestandstype van "${bestand.name}" wordt niet ondersteund.` },
        { status: 400 }
      );
    }
  }

  try {
    const attachments = await Promise.all(
      bestanden.map(async (bestand) => {
        const geupload = await uploadBijlage(bestand);
        return { ...geupload, uploadedAt: new Date().toISOString() };
      })
    );

    const variantSlug = request.headers.get("x-variant-slug") ?? undefined;
    const helpCenterUrl = optionalEnv("NEXT_PUBLIC_SERVER_URL") ?? request.nextUrl.origin;

    const { id } = await createContactSubmission({
      teacherName,
      schoolName,
      email,
      requestType,
      subject,
      problemDescription,
      expected,
      actual,
      pageUrl,
      variantSlug,
      helpCenterUrl,
      deviceInfo: grofApparaat(request.headers.get("user-agent")),
      attachments,
    });

    const notificatieAdres = optionalEnv("CONTACT_NOTIFICATION_EMAIL");
    if (notificatieAdres) {
      await verzendEmail({
        aan: notificatieAdres,
        onderwerp: `Nieuwe contactmelding: ${subject}`,
        tekst: `${teacherName} (${schoolName}, ${email}) heeft een nieuwe melding ingediend.\n\nSoort vraag: ${requestType}\nOnderwerp: ${subject}\n\n${problemDescription}\n\nMelding-ID: ${id}`,
      });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[api/contact] Verwerken van contactmelding mislukt:", error);
    return NextResponse.json(
      { error: "Er ging iets mis bij het versturen. Probeer het later opnieuw." },
      { status: 500 }
    );
  }
}
