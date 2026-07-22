import { describe, it, expect } from "vitest";
import { buildGoogleAuthUrl, GMAIL_READONLY_SCOPE } from "./oauth";

describe("buildGoogleAuthUrl", () => {
  it("bevat exact de minimaal benodigde scope, offline access en de meegegeven state", () => {
    const url = new URL(buildGoogleAuthUrl("test-state-123"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(GMAIL_READONLY_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("test-state-123");
    expect(url.searchParams.get("client_id")).toBe("test-gmail-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/gmail/oauth/callback");
  });

  it("vraagt nooit meer dan de ene, minimale scope aan", () => {
    const url = new URL(buildGoogleAuthUrl("s"));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([GMAIL_READONLY_SCOPE]);
  });
});
