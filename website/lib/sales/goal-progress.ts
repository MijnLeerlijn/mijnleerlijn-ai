export interface SalesGoalInput {
  id: string | number;
  naam?: string | null;
  startDatum?: string | null;
  eindDatum?: string | null;
  doelLicenties?: number | null;
}

export interface WonLicenseEvent {
  occurredAt: number;
  licenses: number;
}

export interface SalesGoalProgress {
  id: string;
  naam: string;
  startDatum: string;
  eindDatum: string;
  doelLicenties: number;
  gerealiseerdLicenties: number;
  resterendLicenties: number;
  percentageBehaald: number;
  doelSchoolEquivalenten: number;
  gerealiseerdSchoolEquivalenten: number;
  nieuweScholen: number;
  periodeVerstrekenPercentage: number;
  verwachtOpTempoLicenties: number;
  verschilTovTempoLicenties: number;
  status: "voor" | "op_schema" | "achter" | "toekomstig" | "afgerond";
  forecastLicenties: number | null;
}

export function calculateSalesGoalProgress(
  goal: SalesGoalInput,
  wins: WonLicenseEvent[],
  schoolEquivalentFactor: number,
  now: number,
): SalesGoalProgress | null {
  const start = goal.startDatum ? Date.parse(goal.startDatum) : Number.NaN;
  const end = goal.eindDatum ? Date.parse(goal.eindDatum) : Number.NaN;
  const target = Number(goal.doelLicenties ?? 0);
  const factor = schoolEquivalentFactor > 0 ? schoolEquivalentFactor : 200;

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || target <= 0) return null;

  const inPeriod = wins.filter((win) => win.occurredAt >= start && win.occurredAt <= end);
  const realized = inPeriod.reduce((sum, win) => sum + win.licenses, 0);
  const duration = end - start;
  const elapsedFraction = Math.max(0, Math.min(1, (now - start) / duration));
  const expectedByNow = target * elapsedFraction;
  const difference = realized - expectedByNow;
  const tolerance = Math.max(1, target * 0.01);

  let status: SalesGoalProgress["status"] = "op_schema";
  if (now < start) status = "toekomstig";
  else if (now > end) status = "afgerond";
  else if (difference > tolerance) status = "voor";
  else if (difference < -tolerance) status = "achter";

  const forecast = elapsedFraction > 0 && now <= end
    ? realized / elapsedFraction
    : now > end
      ? realized
      : null;

  return {
    id: String(goal.id),
    naam: goal.naam?.trim() || "Doelstelling",
    startDatum: new Date(start).toISOString(),
    eindDatum: new Date(end).toISOString(),
    doelLicenties: target,
    gerealiseerdLicenties: realized,
    resterendLicenties: Math.max(0, target - realized),
    percentageBehaald: (realized / target) * 100,
    doelSchoolEquivalenten: target / factor,
    gerealiseerdSchoolEquivalenten: realized / factor,
    nieuweScholen: inPeriod.length,
    periodeVerstrekenPercentage: elapsedFraction * 100,
    verwachtOpTempoLicenties: expectedByNow,
    verschilTovTempoLicenties: difference,
    status,
    forecastLicenties: forecast,
  };
}
