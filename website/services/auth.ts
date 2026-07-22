import { headers as nextHeaders } from "next/headers";
import { getPayload } from "payload";
import config from "@/payload.config";

// Authenticatie voor de beheeromgeving — zie docs/PLATFORM-FOUNDATION.md §9
// en docs/TODO.md beslissing 3 (Auth.js vs. Clerk). Payload's ingebouwde
// authenticatie (payload/collections/Users.ts, auth: true) is de gekozen
// oplossing: een aparte auth-provider zou een tweede, los sessiesysteem naast
// Payload's eigen rolgebonden access-control introduceren zonder functionele
// meerwaarde. Deze functie leest dezelfde sessie/cookie die Payload's
// admin-UI (/admin) al zet, zodat inloggen op /admin ook AuthProvider (en
// daarmee de eigen /beheer-schermen) authenticeert — één inlogsysteem, geen
// twee. Zie het Fase 4-opleveringsrapport voor de volledige motivatie.

export interface Sessie {
  gebruikerId: string;
  naam: string;
  rol: "editor" | "admin";
}

export async function haalSessieOp(): Promise<Sessie | null> {
  const payload = await getPayload({ config });
  const headerList = await nextHeaders();
  const { user } = await payload.auth({ headers: headerList });
  if (!user) return null;
  return { gebruikerId: String(user.id), naam: user.name as string, rol: user.role as "editor" | "admin" };
}
