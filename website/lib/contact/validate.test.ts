import { describe, it, expect } from "vitest";
import { grofApparaat, isGeldigEmail, maakRateLimiter } from "./validate";

describe("isGeldigEmail", () => {
  it("accepteert een gewoon e-mailadres", () => {
    expect(isGeldigEmail("naam@school.nl")).toBe(true);
  });

  it("weigert adressen zonder @ of domein", () => {
    expect(isGeldigEmail("geen-emailadres")).toBe(false);
    expect(isGeldigEmail("naam@")).toBe(false);
    expect(isGeldigEmail("@school.nl")).toBe(false);
  });
});

describe("grofApparaat", () => {
  it("herkent Chrome op desktop", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(grofApparaat(ua)).toBe("Chrome op desktop");
  });

  it("herkent Safari op iPhone", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
    expect(grofApparaat(ua)).toBe("Safari op iPhone");
  });

  it("geeft nooit de volledige user-agent-string terug", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0";
    expect(grofApparaat(ua)).not.toContain("Mozilla");
    expect(grofApparaat(ua)).not.toContain("Windows NT");
  });

  it("geeft 'Onbekend' terug zonder user-agent", () => {
    expect(grofApparaat(null)).toBe("Onbekend");
  });
});

describe("maakRateLimiter", () => {
  it("staat pogingen tot het maximum toe binnen het venster", () => {
    let nu = 1000;
    const limiter = maakRateLimiter(10_000, 3, () => nu);
    expect(limiter.magVerder("ip-1")).toBe(true);
    expect(limiter.magVerder("ip-1")).toBe(true);
    expect(limiter.magVerder("ip-1")).toBe(true);
    expect(limiter.magVerder("ip-1")).toBe(false);
  });

  it("houdt sleutels (IP's) onafhankelijk van elkaar bij", () => {
    let nu = 1000;
    const limiter = maakRateLimiter(10_000, 1, () => nu);
    expect(limiter.magVerder("ip-1")).toBe(true);
    expect(limiter.magVerder("ip-2")).toBe(true);
  });

  it("laat weer nieuwe pogingen toe zodra oude pogingen buiten het venster vallen", () => {
    let nu = 1000;
    const limiter = maakRateLimiter(10_000, 1, () => nu);
    expect(limiter.magVerder("ip-1")).toBe(true);
    expect(limiter.magVerder("ip-1")).toBe(false);
    nu += 10_001;
    expect(limiter.magVerder("ip-1")).toBe(true);
  });
});
