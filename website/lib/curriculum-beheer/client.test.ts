import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stuurCurriculumBeheerVerzoek } from "./client";

// lib/curriculum-beheer/client.ts is de enige plek die het gedeelde
// ADMIN_API_SECRET richting Curriculum Werkplaats stuurt (zie
// ARCHITECTUUR-HELPDESK-BEHEERKOPPELING.md) — deze tests bewaken vooral het
// fail-closed gedrag (nooit een aanroep zonder geldig secret) en de exacte
// URL-/headeropbouw, niet de daadwerkelijke netwerkaanroep (fetch wordt
// gemockt).

const ORIGINELE_ENV = { ...process.env };

beforeEach(() => {
  process.env.CURRICULUM_ADMIN_API_URL = "https://curriculum.mijnleerlijn.chat";
  process.env.CURRICULUM_ADMIN_API_SECRET = "test-secret-waarde";
});

afterEach(() => {
  process.env = { ...ORIGINELE_ENV };
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

describe("stuurCurriculumBeheerVerzoek", () => {
  it("gooit een fout als CURRICULUM_ADMIN_API_URL ontbreekt", async () => {
    delete process.env.CURRICULUM_ADMIN_API_URL;
    await expect(stuurCurriculumBeheerVerzoek("projecten", { method: "GET" })).rejects.toThrow(
      /CURRICULUM_ADMIN_API_URL/
    );
  });

  it("gooit een fout als CURRICULUM_ADMIN_API_SECRET ontbreekt", async () => {
    delete process.env.CURRICULUM_ADMIN_API_SECRET;
    await expect(stuurCurriculumBeheerVerzoek("projecten", { method: "GET" })).rejects.toThrow(
      /CURRICULUM_ADMIN_API_SECRET/
    );
  });

  it("bouwt de juiste URL op (zonder trailing slash op de basis-URL) en stuurt het Bearer-secret mee", async () => {
    process.env.CURRICULUM_ADMIN_API_URL = "https://curriculum.mijnleerlijn.chat/";
    const fetchMock = mockFetch(200, { status: "OK", projecten: [] });
    vi.stubGlobal("fetch", fetchMock);

    await stuurCurriculumBeheerVerzoek("projecten", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://curriculum.mijnleerlijn.chat/api/beheer/projecten");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-secret-waarde" });
  });

  it("voegt zoekparameters toe, maar slaat undefined/lege waarden over", async () => {
    const fetchMock = mockFetch(200, { status: "OK", projecten: [] });
    vi.stubGlobal("fetch", fetchMock);

    await stuurCurriculumBeheerVerzoek("projecten", {
      method: "GET",
      zoek: { zoek: "de school", status: undefined, leeg: "" },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://curriculum.mijnleerlijn.chat/api/beheer/projecten?zoek=de+school");
  });

  it("stuurt een JSON-body + Content-Type mee bij een muterend verzoek", async () => {
    const fetchMock = mockFetch(200, { status: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    await stuurCurriculumBeheerVerzoek("projecten/abc/blokkeren", {
      method: "POST",
      body: { beheerderNaam: "Test Beheerder" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const typedInit = init as RequestInit;
    expect(typedInit.method).toBe("POST");
    expect(typedInit.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(typedInit.body).toBe(JSON.stringify({ beheerderNaam: "Test Beheerder" }));
  });

  it("stuurt geen Content-Type/body mee zonder body-optie (bv. GET)", async () => {
    const fetchMock = mockFetch(200, { status: "OK" });
    vi.stubGlobal("fetch", fetchMock);

    await stuurCurriculumBeheerVerzoek("auditlog", { method: "GET" });

    const [, init] = fetchMock.mock.calls[0]!;
    const typedInit = init as RequestInit;
    expect(typedInit.body).toBeUndefined();
    expect((typedInit.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("geeft de HTTP-status en het geparste JSON-lichaam van de respons terug", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { status: "NIET_GEVONDEN" }));

    const resultaat = await stuurCurriculumBeheerVerzoek("projecten/onbekend", { method: "GET" });

    expect(resultaat.status).toBe(404);
    expect(resultaat.body).toEqual({ status: "NIET_GEVONDEN" });
  });

  it("geeft body null terug als de respons geen geldige JSON is (nooit gooien op een lege 500)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultaat = await stuurCurriculumBeheerVerzoek("projecten", { method: "GET" });

    expect(resultaat.status).toBe(500);
    expect(resultaat.body).toBeNull();
  });
});
