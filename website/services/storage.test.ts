import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  genereerDownloadUrl,
  classificeerBlobFout,
  DownloadUrlFout,
} from "./storage";
import {
  issueSignedToken,
  presignUrl,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobAccessError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobNotFoundError,
} from "@vercel/blob";

// Productiecontrole (2026-08-23) — dekt exact het mechanisme achter de
// live HTTP 500-fix: genereerDownloadUrl moet (a) bij succes precies het
// verwachte pathname/opties-formaat naar issueSignedToken/presignUrl
// doorgeven (§5/§6 van de diagnosevragen: "verwacht genereerDownloadUrl()
// exact hetzelfde formaat?"), en (b) bij een storagefout een DownloadUrlFout
// gooien met de juiste stap ("signed_token" vs "presign"), nooit de rauwe
// @vercel/blob-fout. classificeerBlobFout wordt apart getest: dat is de
// enige plek die bepaalt wat er (veilig, categorie-only) gelogd wordt.
vi.mock("@vercel/blob", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@vercel/blob")>();
  return { ...echt, issueSignedToken: vi.fn(), presignUrl: vi.fn(), put: vi.fn(), del: vi.fn() };
});

const mockIssueSignedToken = vi.mocked(issueSignedToken);
const mockPresignUrl = vi.mocked(presignUrl);

const SIGNED_TOKEN = { delegationToken: "d", clientSigningToken: "c", validUntil: Date.now() + 60_000 };

beforeEach(() => {
  mockIssueSignedToken.mockReset();
  mockPresignUrl.mockReset();
});

describe("genereerDownloadUrl — signed-URL-formaat", () => {
  it("geeft exact de opgegeven storageKey als pathname door aan beide stappen, en geeft de presignedUrl terug", async () => {
    mockIssueSignedToken.mockResolvedValue(SIGNED_TOKEN);
    mockPresignUrl.mockResolvedValue({ presignedUrl: "https://signed.example/x" });

    const url = await genereerDownloadUrl("trainer-bestanden/uniek.pdf");

    expect(url).toBe("https://signed.example/x");
    expect(mockIssueSignedToken).toHaveBeenCalledWith(expect.objectContaining({ pathname: "trainer-bestanden/uniek.pdf", operations: ["get"] }));
    expect(mockPresignUrl).toHaveBeenCalledWith(
      SIGNED_TOKEN,
      expect.objectContaining({ operation: "get", pathname: "trainer-bestanden/uniek.pdf", access: "private" })
    );
  });

  it("een fout bij issueSignedToken geeft een DownloadUrlFout met stap 'signed_token', presignUrl wordt dan nooit aangeroepen", async () => {
    mockIssueSignedToken.mockRejectedValue(new BlobStoreNotFoundError());

    const fout = await genereerDownloadUrl("x").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(DownloadUrlFout);
    expect(fout).toMatchObject({ stap: "signed_token", categorie: "blob_store_not_found" });
    expect(mockPresignUrl).not.toHaveBeenCalled();
  });

  it("een fout bij presignUrl geeft een DownloadUrlFout met stap 'presign'", async () => {
    mockIssueSignedToken.mockResolvedValue(SIGNED_TOKEN);
    mockPresignUrl.mockRejectedValue(new BlobServiceNotAvailable());

    const fout = await genereerDownloadUrl("x").catch((e: unknown) => e);
    expect(fout).toBeInstanceOf(DownloadUrlFout);
    expect(fout).toMatchObject({ stap: "presign", categorie: "blob_service_unavailable", statusCategorie: "5xx" });
  });
});

describe("classificeerBlobFout — veilige, categorie-only classificatie (nooit de message zelf)", () => {
  it.each([
    [new BlobStoreNotFoundError(), "blob_store_not_found", "4xx"],
    [new BlobStoreSuspendedError(), "blob_store_suspended", "4xx"],
    [new BlobAccessError(), "blob_access_denied", "4xx"],
    [new BlobNotFoundError(), "blob_not_found", "4xx"],
    [new BlobServiceRateLimited(30), "blob_rate_limited", "4xx"],
    [new BlobServiceNotAvailable(), "blob_service_unavailable", "5xx"],
  ] as const)("classificeert %o als %s / %s", (error, categorie, statusCategorie) => {
    expect(classificeerBlobFout(error)).toEqual({ categorie, statusCategorie });
  });

  it("een onbekende/generieke fout (bv. een netwerkfout) krijgt een veilige onbekend-categorie, nooit de eigen message", () => {
    expect(classificeerBlobFout(new Error("connect ETIMEDOUT 10.0.0.1:443"))).toEqual({ categorie: "onbekende_fout", statusCategorie: "onbekend" });
  });
});
