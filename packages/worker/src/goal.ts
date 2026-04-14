// Session-ephemeral goal planner. Solves the future-value annuity for the
// required monthly contribution given target, deadline, principal, and a
// blended APY assumption per risk tier.
//
// FV = PV*(1+r)^n + PMT * ((1+r)^n - 1) / r
// PMT = (FV - PV*(1+r)^n) * r / ((1+r)^n - 1),  r = apy/12

export interface PlanGoalInput {
  target_amount_usd: number;
  deadline_iso: string; // YYYY-MM-DD
  current_principal_usd?: number;
  risk_preference?: "safe" | "growth" | "bold" | "auto";
}

export interface PlanGoalResult {
  months: number;
  monthlyContribution: number;
  assumedApy: number; // decimal, e.g. 0.045
  riskTier: "safe" | "growth" | "bold";
  projection: {
    principalUsd: number;
    targetUsd: number;
    fvOfPrincipalOnly: number;
  };
  feasibility: "ok" | "already_met" | "deadline_past" | "zero_months";
  notes: string[];
}

// Blended APY assumptions — conservative floors, not investment advice:
// safe   = USDC money-market range (Aave/Morpho on Base, 2024–2026)
// growth = stable LP / mid-tier vault mix
// bold   = aggressive vaults, well below advertised peaks
const APY_BY_TIER = {
  safe: 0.045,
  growth: 0.08,
  bold: 0.14,
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function planGoal(input: PlanGoalInput): PlanGoalResult {
  const notes: string[] = [];
  const principalUsd = Math.max(0, input.current_principal_usd ?? 0);
  const targetUsd = input.target_amount_usd;

  const now = new Date();
  const deadline = new Date(input.deadline_iso);

  if (Number.isNaN(deadline.getTime())) {
    return {
      months: 0,
      monthlyContribution: 0,
      assumedApy: 0,
      riskTier: "safe",
      projection: { principalUsd, targetUsd, fvOfPrincipalOnly: principalUsd },
      feasibility: "deadline_past",
      notes: [`Invalid deadline "${input.deadline_iso}" — use YYYY-MM-DD.`],
    };
  }

  if (deadline.getTime() < now.getTime() && monthsBetween(now, deadline) < 0) {
    return {
      months: 0,
      monthlyContribution: 0,
      assumedApy: 0,
      riskTier: "safe",
      projection: { principalUsd, targetUsd, fvOfPrincipalOnly: principalUsd },
      feasibility: "deadline_past",
      notes: [`Deadline ${input.deadline_iso} is in the past.`],
    };
  }

  let months = Math.max(0, monthsBetween(now, deadline));
  if (months > 600) {
    months = 600;
    notes.push("Clamped to 600 months (50 years); restate if you mean longer.");
  }

  const preference = input.risk_preference ?? "auto";
  const tier: "safe" | "growth" | "bold" =
    preference !== "auto" ? preference : months <= 12 ? "safe" : months <= 36 ? "growth" : "bold";
  if (preference === "auto") {
    notes.push(`Auto-selected ${tier} tier based on ${months}-month horizon.`);
  }

  const assumedApy = APY_BY_TIER[tier];
  const r = assumedApy / 12;

  const fvOfPrincipalOnly = months === 0 ? principalUsd : principalUsd * Math.pow(1 + r, months);

  if (months === 0) {
    const gap = Math.max(0, targetUsd - principalUsd);
    if (gap === 0) {
      notes.push("Principal already meets target.");
      return {
        months: 0,
        monthlyContribution: 0,
        assumedApy,
        riskTier: tier,
        projection: { principalUsd, targetUsd, fvOfPrincipalOnly },
        feasibility: "already_met",
        notes,
      };
    }
    notes.push(
      `Deadline is this month — you'd need a $${round2(gap)} lump sum now to hit the target.`,
    );
    return {
      months: 0,
      monthlyContribution: round2(gap),
      assumedApy,
      riskTier: tier,
      projection: { principalUsd, targetUsd, fvOfPrincipalOnly },
      feasibility: "zero_months",
      notes,
    };
  }

  if (fvOfPrincipalOnly >= targetUsd) {
    notes.push(
      `Principal alone compounds to $${round2(fvOfPrincipalOnly)} by ${
        input.deadline_iso
      } at ${(assumedApy * 100).toFixed(1)}% APY — target already met without additional contributions.`,
    );
    return {
      months,
      monthlyContribution: 0,
      assumedApy,
      riskTier: tier,
      projection: { principalUsd, targetUsd, fvOfPrincipalOnly },
      feasibility: "already_met",
      notes,
    };
  }

  let monthlyContribution: number;
  if (r === 0) {
    monthlyContribution = (targetUsd - principalUsd) / months;
  } else {
    const growth = Math.pow(1 + r, months);
    monthlyContribution = ((targetUsd - principalUsd * growth) * r) / (growth - 1);
  }
  monthlyContribution = Math.max(0, round2(monthlyContribution));

  notes.push(
    `At ${(assumedApy * 100).toFixed(1)}% blended APY in ${tier} vaults, $${monthlyContribution}/month compounds with your existing $${round2(principalUsd)} to $${round2(targetUsd)} over ${months} months.`,
  );

  return {
    months,
    monthlyContribution,
    assumedApy,
    riskTier: tier,
    projection: { principalUsd, targetUsd, fvOfPrincipalOnly: round2(fvOfPrincipalOnly) },
    feasibility: "ok",
    notes,
  };
}
