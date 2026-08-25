import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Payload } from "payload";
import { wijzigEigenWachtwoord } from "./wachtwoord";
import type { AuthTrainer } from "./auth";

// Correctieronde Admin Traineromgeving (2026-08-25) — dekt de PURE
// beslislogica (validatie/foutafhandeling/uitkomst-vertaling) via een
// gemockte payload.login/payload.update — zelfde bewuste keuze als
// lib/werk/mail-reply.test.ts se fakePayload: payload.login() zelf voert
// echte bcrypt-verificatie/JWT-ondertekening uit, dat is hier niet zinvol te
// mocken (zou alleen de mock zelf bewijzen). Het ECHTE bcrypt-round-trip
// bewijs (nieuw wachtwoord werkt, oud werkt niet meer) staat apart in
// app/api/trainers/wachtwoord/route.real-auth.test.ts, exact zoals
// app/api/trainers/trainingen/[id]/route.real-auth.test.ts dat al doet voor
// sessieverificatie.

const mockLogin = vi.fn();
const mockUpdate = vi.fn();
const fakePayload = { login: mockLogin, update: mockUpdate } as unknown as Payload;

const TRAINER: AuthTrainer = { id: 1, name: "Wessel Kok", email: "wessel@mijnleerlijn.nl", mondayTrainerboardId: "18424768045", mondayUitvoerderItemId: "12419116827", actief: true };

beforeEach(() => {
  mockLogin.mockReset();
  mockUpdate.mockReset();
});

describe("wijzigEigenWachtwoord", () => {
  it("correct huidig wachtwoord → verificatie + opslag, wijziging slaagt", async () => {
    mockLogin.mockResolvedValue({ user: { id: 1 }, token: "een-token" });
    mockUpdate.mockResolvedValue({ id: 1 });

    const uitkomst = await wijzigEigenWachtwoord(fakePayload, TRAINER, "HuidigWachtwoord1!", "NieuwWachtwoord2!", "NieuwWachtwoord2!");

    expect(uitkomst).toEqual({ soort: "ok" });
    expect(mockLogin).toHaveBeenCalledWith({ collection: "trainer-accounts", data: { email: TRAINER.email, password: "HuidigWachtwoord1!" } });
    expect(mockUpdate).toHaveBeenCalledWith({ collection: "trainer-accounts", id: TRAINER.id, overrideAccess: true, data: { password: "NieuwWachtwoord2!" } });
  });

  it("verkeerd huidig wachtwoord (payload.login werpt) → geen wijziging, payload.update wordt nooit aangeroepen", async () => {
    mockLogin.mockRejectedValue(new Error("De opgegeven inloggegevens zijn onjuist."));

    const uitkomst = await wijzigEigenWachtwoord(fakePayload, TRAINER, "VerkeerdWachtwoord", "NieuwWachtwoord2!", "NieuwWachtwoord2!");

    expect(uitkomst).toEqual({ soort: "onjuist_huidig_wachtwoord" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("bevestiging nieuw wachtwoord wijkt af → geweigerd, payload.login/payload.update worden geen van beide aangeroepen", async () => {
    const uitkomst = await wijzigEigenWachtwoord(fakePayload, TRAINER, "HuidigWachtwoord1!", "NieuwWachtwoord2!", "AndereBevestiging3!");

    expect(uitkomst.soort).toBe("ongeldige_invoer");
    expect(mockLogin).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ontbrekende velden → ongeldige_invoer", async () => {
    const uitkomst = await wijzigEigenWachtwoord(fakePayload, TRAINER, "", "NieuwWachtwoord2!", "NieuwWachtwoord2!");
    expect(uitkomst.soort).toBe("ongeldige_invoer");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("wijzigt uitsluitend het account van de meegegeven trainer — payload.update krijgt exact trainer.id, geen ander/afgeleid ID", async () => {
    mockLogin.mockResolvedValue({ user: { id: 1 }, token: "een-token" });
    mockUpdate.mockResolvedValue({ id: 1 });
    const andereTrainer: AuthTrainer = { ...TRAINER, id: 42, email: "andere@mijnleerlijn.nl" };

    await wijzigEigenWachtwoord(fakePayload, andereTrainer, "HuidigWachtwoord1!", "NieuwWachtwoord2!", "NieuwWachtwoord2!");

    expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: "andere@mijnleerlijn.nl" }) }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it("payload.update weigert het nieuwe wachtwoord (Payload's eigen fieldvalidatie) → nette, generieke melding — geen Payload-interne foutdetails", async () => {
    mockLogin.mockResolvedValue({ user: { id: 1 }, token: "een-token" });
    mockUpdate.mockRejectedValue(new Error("ValidationError: password is te kort"));

    const uitkomst = await wijzigEigenWachtwoord(fakePayload, TRAINER, "HuidigWachtwoord1!", "ab", "ab");

    expect(uitkomst.soort).toBe("nieuw_wachtwoord_geweigerd");
    if (uitkomst.soort !== "nieuw_wachtwoord_geweigerd") return;
    expect(uitkomst.boodschap).not.toContain("ValidationError");
  });
});
