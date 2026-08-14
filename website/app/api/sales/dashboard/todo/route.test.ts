import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { verifyAdminSessionCookie } from "@/lib/auth/verify-session";
import { haalTodoItems } from "@/lib/sales/dashboard-todo";

vi.mock("payload", () => ({ getPayload: vi.fn().mockResolvedValue({}) }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/auth/verify-session", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/auth/verify-session")>();
  return { ...echt, verifyAdminSessionCookie: vi.fn() };
});
vi.mock("@/lib/sales/dashboard-todo", () => ({ haalTodoItems: vi.fn() }));

const mockVerify = vi.mocked(verifyAdminSessionCookie);
const mockHaalTodo = vi.mocked(haalTodoItems);

function maakRequest(cookie?: string) {
  return new NextRequest("http://localhost:3000/api/sales/dashboard/todo", {
    headers: cookie ? { Cookie: `payload-token=${cookie}` } : undefined,
  });
}

beforeEach(() => {
  mockVerify.mockReset();
  mockHaalTodo.mockReset();
});

describe("GET /api/sales/dashboard/todo", () => {
  it("weigert een aanvraag zonder (geldige) beheerderssessie met 403", async () => {
    mockVerify.mockResolvedValue({ user: null, cookieAanwezig: false, reden: "geen-cookie" });

    const response = await GET(maakRequest());

    expect(response.status).toBe(403);
    expect(mockHaalTodo).not.toHaveBeenCalled();
  });

  it("geeft de To-do-data terug voor een ingelogde editor", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "editor" }, cookieAanwezig: true });
    mockHaalTodo.mockResolvedValue({ proposals: [], mogelijkAfgeslotenScholen: [] });

    const response = await GET(maakRequest("geldig-editor"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ proposals: [], mogelijkAfgeslotenScholen: [] });
  });

  it("geeft een nette 500 met foutmelding wanneer haalTodoItems faalt, geen technische details", async () => {
    mockVerify.mockResolvedValue({ user: { id: 1, role: "admin" }, cookieAanwezig: true });
    mockHaalTodo.mockRejectedValue(new Error("Database niet bereikbaar."));

    const response = await GET(maakRequest("geldig-admin"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Database niet bereikbaar.");
  });
});
