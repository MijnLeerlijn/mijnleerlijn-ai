import type { Payload } from "payload";

interface Row {
  requestedAt?: string | null;
  subject?: string | null;
  normalizedGoal?: string | null;
  ageGroup?: string | null;
}

function countBy(rows: Row[], key: keyof Row) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[key] ?? "").trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export async function LesplanAnalyticsDashboard({ payload }: { payload: Payload }) {
  const result = await payload.find({
    collection: "lesplan-analytics",
    limit: 500,
    sort: "-requestedAt",
    depth: 0,
    overrideAccess: true,
  });
  const rows = result.docs as Row[];
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = rows.filter((row) => row.requestedAt && new Date(row.requestedAt).getTime() >= since);
  const goals = countBy(last30, "normalizedGoal").slice(0, 7);
  const subjects = countBy(last30, "subject").slice(0, 5);
  const groups = countBy(last30, "ageGroup").slice(0, 5);

  return (
    <section style={{ marginTop: 28, padding: 24, border: "1px solid #dce7ec", borderRadius: 16, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Lesplan Generator</h2>
          <p style={{ margin: "5px 0 0", color: "#647b88", fontSize: 14 }}>Onderwijsbehoeften uit de afgelopen 30 dagen.</p>
        </div>
        <strong style={{ fontSize: 28 }}>{last30.length}</strong>
      </div>
      {last30.length === 0 ? (
        <p style={{ margin: 0, color: "#718692" }}>Nog geen lesplannen gemeten. Nieuwe aanvragen verschijnen hier automatisch.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 24 }}>
          <div>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#607784" }}>Meest gevraagde leerdoelen</h3>
            {goals.map(([label, count], index) => <div key={label} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #edf2f4" }}><span style={{ color: "#1688c7", width: 18 }}>{index + 1}</span><span style={{ flex: 1 }}>{label}</span><strong>{count}</strong></div>)}
          </div>
          <div>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#607784" }}>Vakgebieden</h3>
            {subjects.map(([label, count]) => <p key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "8px 0" }}><span>{label}</span><strong>{count}</strong></p>)}
          </div>
          <div>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".06em", color: "#607784" }}>Groep / leeftijd</h3>
            {groups.map(([label, count]) => <p key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, margin: "8px 0" }}><span>{label}</span><strong>{count}</strong></p>)}
          </div>
        </div>
      )}
    </section>
  );
}
