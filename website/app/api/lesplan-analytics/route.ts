import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { optionalEnv } from "@/config/env";

export const runtime = "nodejs";

const MAX = { subject: 120, rawGoal: 1000, normalizedGoal: 240, topic: 160, ageGroup: 120, planTitle: 240 } as const;

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isAuthorized(request: Request): boolean {
  const secret = optionalEnv("LESPLAN_ANALYTICS_SECRET");
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Niet toegestaan" }, { status: 401 });

  try {
    const body = await request.json();
    const data = {
      requestedAt: new Date().toISOString(),
      subject: clean(body?.subject, MAX.subject),
      rawGoal: clean(body?.rawGoal, MAX.rawGoal),
      normalizedGoal: clean(body?.normalizedGoal, MAX.normalizedGoal),
      topic: clean(body?.topic, MAX.topic) || undefined,
      ageGroup: clean(body?.ageGroup, MAX.ageGroup) || undefined,
      planTitle: clean(body?.planTitle, MAX.planTitle) || undefined,
      source: "lesplangenerator11",
    };

    if (!data.subject || !data.rawGoal || !data.normalizedGoal) {
      return NextResponse.json({ error: "Onvolledige analytics-data" }, { status: 400 });
    }

    const payload = await getPayload({ config });
    await payload.create({ collection: "lesplan-analytics", data, overrideAccess: true });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[lesplan-analytics] opslag mislukt", error);
    return NextResponse.json({ error: "Opslag mislukt" }, { status: 500 });
  }
}
