import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifyTrainerSessionCookie } from "@/lib/trainers/auth";
import { wijzigEigenWachtwoord } from "@/lib/trainers/wachtwoord";

// Correctieronde Admin Traineromgeving (2026-08-25) — dekt uitsluitend de
// HTTP-laag (sessieverificatie/validatie/statuscodes/ratelimiet/uitkomst-
// vertaling), zelfde opzet als app/api/trainers/logboek/route.test.ts. De
// eigenlijke wachtwoordlogica heeft eigen dekking in lib/trainers/
// wachtwoord.test.ts (gemockt) en app/api/trainers/wachtwoord/
// route.real-auth.test.ts (echte bcrypt/login-round-trip).
vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/trainers/auth", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/trainers/auth")>();
  return { ...echt, verifyTrainerSessionCookie: vi.fn() };
});
vi.mock("@/lib/trainers/wachtwoord", () => ({ wijzigEigenWachtwoord: vi.fn() }));

const mockVerify = vi.mocked(verifyTrainerSessionCookie);
const mockWijzig = vi.mocked(wijzigEigenWachtwoord);

const TRAINER = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "board-1", mondayUitvoerderItemId: "uitv-1", actief: true };

function maakRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/trainers/wachtwoord", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const GELDIGE_BODY = { huidigWachtwoord: "HuidigWachtwoord1!", nieuwWachtwoord: "NieuwWachtwoord2!", nieuwWachtwoordBevestiging: "NieuwWachtwoord2!" };

beforeEach(() => {
  mockVerify.mockReset();
  mockWijzig.mockReset();
  mockVerify.mockResolvedValue({ trainer: TRAINER, cookieAanwezig: true });
});

describe("POST /api/trainers/wachtwoord", () => {
  it("weigert zonder geldige trainer-sessie (401) — unauthenticated", async () => {
    mockVerify.mockResolvedValue({ trainer: null, cookieAanwezig: false, reden: "geen-cookie" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(401);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("geeft 400 bij ontbrekende velden", async () => {
    const response = await POST(maakRequest({ huidigWachtwoord: "x" }));
    expect(response.status).toBe(400);
    expect(mockWijzig).not.toHaveBeenCalled();
  });

  it("wijzigt uitsluitend het account van de daadwerkelijk ingelogde trainer — trainer.id komt uit de sessie, nooit uit de request-body", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok" });
    // Body bevat bewust GEEN trainerId-veld — er bestaat domweg geen zo'n veld in de route.
    await POST(maakRequest(GELDIGE_BODY));
    expect(mockWijzig).toHaveBeenCalledWith(expect.anything(), TRAINER, "HuidigWachtwoord1!", "NieuwWachtwoord2!", "NieuwWachtwoord2!");
  });

  it("geeft 200 terug bij een geslaagde wijziging, zonder de wachtwoorden in de respons", async () => {
    mockWijzig.mockResolvedValue({ soort: "ok" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
    expect(JSON.stringify(data)).not.toContain("HuidigWachtwoord1!");
    expect(JSON.stringify(data)).not.toContain("NieuwWachtwoord2!");
  });

  it("geeft 422 + duidelijke, veilige melding bij een onjuist huidig wachtwoord", async () => {
    mockWijzig.mockResolvedValue({ soort: "onjuist_huidig_wachtwoord" });
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Het huidige wachtwoord is onjuist.");
    // Nooit het aangeleverde wachtwoord zelf terugsturen.
    expect(JSON.stringify(data)).not.toContain("HuidigWachtwoord1!");
  });

  it("geeft 422 terug bij een afwijkende bevestiging", async () => {
    mockWijzig.mockResolvedValue({ soort: "ongeldige_invoer", boodschap: "De bevestiging komt niet overeen met het nieuwe wachtwoord." });
    const response = await POST(maakRequest({ ...GELDIGE_BODY, nieuwWachtwoordBevestiging: "AndereBevestiging" }));
    expect(response.status).toBe(422);
  });

  it("blokkeert na te veel pogingen van dezelfde trainer (rate limiting)", async () => {
    // Eigen, verder-nergens-in-dit-bestand-gebruikt trainer-ID: de ratelimiter
    // is module-level state gekeyed op trainer.id, dus een gedeeld ID zou hier
    // ook de budget-consumptie van eerdere tests in dit bestand meetellen.
    const eigenTrainer = { ...TRAINER, id: 12345 };
    mockVerify.mockResolvedValue({ trainer: eigenTrainer, cookieAanwezig: true });
    mockWijzig.mockResolvedValue({ soort: "onjuist_huidig_wachtwoord" });
    for (let i = 0; i < 10; i += 1) {
      const response = await POST(maakRequest(GELDIGE_BODY));
      expect(response.status).toBe(422);
    }
    const geblokkeerd = await POST(maakRequest(GELDIGE_BODY));
    expect(geblokkeerd.status).toBe(429);
  });

  it("logt nooit de wachtwoorden zelf bij een onverwachte fout", async () => {
    const eigenTrainer = { ...TRAINER, id: 23456 };
    mockVerify.mockResolvedValue({ trainer: eigenTrainer, cookieAanwezig: true });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockWijzig.mockRejectedValue(new Error("onverwachte databasefout"));
    const response = await POST(maakRequest(GELDIGE_BODY));
    expect(response.status).toBe(500);
    const gelogd = consoleSpy.mock.calls.flat().map(String).join(" ");
    expect(gelogd).not.toContain("HuidigWachtwoord1!");
    expect(gelogd).not.toContain("NieuwWachtwoord2!");
    consoleSpy.mockRestore();
  });
});
