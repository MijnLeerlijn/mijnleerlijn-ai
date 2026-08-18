import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl } from "next/experimental/testing/server";
import { proxy } from "./proxy";
import { defaultVariant } from "@/config/variants";

const mockResolveSlug = vi.fn();

vi.mock("@/lib/variant/variant-resolver-instance", () => ({
  variantResolver: { resolveSlug: (...args: unknown[]) => mockResolveSlug(...args) },
}));

beforeEach(() => {
  mockResolveSlug.mockReset();
});

function maakRequest(url: string, host: string): NextRequest {
  return new NextRequest(url, { headers: { host } });
}

// Dubbele bereikbaarheid (2026-08-11): proxy.ts is de ENE plek die beslist of
// een pad-gebaseerd verzoek op de hoofdsite naar de canonieke subdomeinvorm
// doorstuurt — zie het commentaar in proxy.ts en Plan §3. Getest tegen de
// echte, geëxporteerde `proxy`-functie (geen herimplementatie van de
// beslislogica in de test), met een gemockte VariantResolver zodat elk
// scenario onafhankelijk van de database gestuurd kan worden.
describe("proxy", () => {
  it("redirect (308) een pad-gebaseerde slug op het kale hoofddomein naar de subdomeinvorm, met behoud van pad en querystring", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("https://mijnleerlijn.chat/mijnmonti/pagina?foo=bar", "mijnleerlijn.chat");

    const response = await proxy(request);

    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://mijnmonti.mijnleerlijn.chat/pagina?foo=bar");
  });

  it("redirect ook vanaf de www-vorm van het hoofddomein", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("https://www.mijnleerlijn.chat/mijnmonti", "www.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://mijnmonti.mijnleerlijn.chat/");
  });

  it("redirect NIET op localhost — de padvorm blijft daar rechtstreeks renderen (lokale variant-simulatie zonder DNS)", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("http://localhost:3000/mijnmonti", "localhost:3000");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-request-x-variant-slug")).toBe("mijnmonti");
  });

  it("redirect NIET op een Vercel-preview-host", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("https://mijnleerlijn-ai-git-preview.vercel.app/mijnmonti", "mijnleerlijn-ai-git-preview.vercel.app");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBeNull();
  });

  it("redirect NIET op de hoofdsite wanneer de resolver terugvalt op de standaardvariant (bv. een onbekend of gereserveerd pad)", async () => {
    mockResolveSlug.mockResolvedValue(defaultVariant.slug);
    const request = maakRequest("https://mijnleerlijn.chat/contact", "mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-request-x-variant-slug")).toBe(defaultVariant.slug);
  });

  it("redirect NIET wanneer het verzoek al op het canonieke subdomein zelf binnenkomt", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("https://mijnmonti.mijnleerlijn.chat/", "mijnmonti.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-request-x-variant-slug")).toBe("mijnmonti");
  });

  it("geeft host en pathname door aan de resolver zoals ontvangen", async () => {
    mockResolveSlug.mockResolvedValue(defaultVariant.slug);
    const request = maakRequest("https://mijnleerlijn.chat/ergens/anders", "mijnleerlijn.chat");

    await proxy(request);

    expect(mockResolveSlug).toHaveBeenCalledWith("mijnleerlijn.chat", "/ergens/anders");
  });
});

// Traineromgeving V1, Ronde 1 (2026-08-19) — trainers.{ROOT_DOMAIN} moet
// volledig buiten de variant-resolver om herschreven worden naar /trainers*
// (architectuurrapport §11). Getest tegen de echte, geëxporteerde `proxy`-
// functie, zelfde stijl als hierboven.
describe("proxy — trainers.mijnleerlijn.chat host-routing", () => {
  it("herschrijft de root (/) naar /trainers, zonder de variant-resolver aan te roepen", async () => {
    const request = maakRequest("https://trainers.mijnleerlijn.chat/", "trainers.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBe("https://trainers.mijnleerlijn.chat/trainers");
    expect(mockResolveSlug).not.toHaveBeenCalled();
  });

  it("herschrijft /scholen naar /trainers/scholen", async () => {
    const request = maakRequest("https://trainers.mijnleerlijn.chat/scholen", "trainers.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBe("https://trainers.mijnleerlijn.chat/trainers/scholen");
  });

  it("herschrijft een geneste schooldetail-route en behoudt de querystring", async () => {
    const request = maakRequest("https://trainers.mijnleerlijn.chat/scholen/montessori-gorinchem?tab=logboek", "trainers.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBe("https://trainers.mijnleerlijn.chat/trainers/scholen/montessori-gorinchem?tab=logboek");
  });

  it("herschrijft /login naar /trainers/login", async () => {
    const request = maakRequest("https://trainers.mijnleerlijn.chat/login", "trainers.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBe("https://trainers.mijnleerlijn.chat/trainers/login");
  });

  it("laat /api/* ONGEWIJZIGD door — Payload's eigen /api/trainers/login blijft op zijn echte pad", async () => {
    const request = maakRequest("https://trainers.mijnleerlijn.chat/api/trainers/login", "trainers.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBeNull();
    expect(getRedirectUrl(response)).toBeNull();
    expect(mockResolveSlug).not.toHaveBeenCalled();
  });

  it("raakt een ANDER host (de gewone hoofdsite) volledig niet aan — normale variant-resolutie blijft ongewijzigd", async () => {
    mockResolveSlug.mockResolvedValue(defaultVariant.slug);
    const request = maakRequest("https://mijnleerlijn.chat/contact", "mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBeNull();
    expect(mockResolveSlug).toHaveBeenCalledWith("mijnleerlijn.chat", "/contact");
  });

  it("raakt een ANDERE variant-subdomein volledig niet aan", async () => {
    mockResolveSlug.mockResolvedValue("mijnmonti");
    const request = maakRequest("https://mijnmonti.mijnleerlijn.chat/", "mijnmonti.mijnleerlijn.chat");

    const response = await proxy(request);

    expect(getRewrittenUrl(response)).toBeNull();
    expect(mockResolveSlug).toHaveBeenCalled();
  });
});
