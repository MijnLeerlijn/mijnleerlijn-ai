import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTrainersOrigin } from "./env";

// Traineromgeving V1, Ronde 1 (2026-08-19) — getTrainersOrigin() bepaalt de
// payload.config.ts se csrf-allowlist-vermelding voor trainers.{ROOT_DOMAIN}
// (zie de uitgebreide toelichting in env.ts). Een fout hier faalt stil: geen
// typefout, geen crash bij opstarten — alleen een afgewezen fetch()-POST pas
// zichtbaar bij een echte /api/trainers/logout-aanroep. Vandaar expliciete
// tests voor zowel de productie- als de development-afleiding.
describe("getTrainersOrigin", () => {
  const oorspronkelijkeEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SERVER_URL;
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });

  afterEach(() => {
    process.env = { ...oorspronkelijkeEnv };
  });

  it("combineert protocol+poort van NEXT_PUBLIC_SERVER_URL met de hostnaam van NEXT_PUBLIC_ROOT_DOMAIN (productie)", () => {
    process.env.NEXT_PUBLIC_SERVER_URL = "https://mijnleerlijn.chat";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "mijnleerlijn.chat";

    expect(getTrainersOrigin()).toBe("https://trainers.mijnleerlijn.chat");
  });

  it("valt terug op http://localhost:3000 wanneer NEXT_PUBLIC_SERVER_URL ontbreekt (development)", () => {
    expect(getTrainersOrigin()).toBe("http://trainers.localhost:3000");
  });

  it("blijft de hostnaam van serverURL negeren — getRootDomain() is altijd leidend voor het subdomein, ook bij een www-mismatch", () => {
    process.env.NEXT_PUBLIC_SERVER_URL = "https://www.mijnleerlijn.chat";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "mijnleerlijn.chat";

    expect(getTrainersOrigin()).toBe("https://trainers.mijnleerlijn.chat");
  });

  it("neemt een expliciete poort over, ook op een niet-standaardpoort", () => {
    process.env.NEXT_PUBLIC_SERVER_URL = "https://staging.example.com:8443";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "example.com";

    expect(getTrainersOrigin()).toBe("https://trainers.example.com:8443");
  });
});
