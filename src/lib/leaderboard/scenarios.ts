export interface Scenario {
  id: string;
  tier: "baseline" | "enhanced" | "innovation";
  points: number;
  description: string;
  whatItTests: string;
  requiresSyntheticData: boolean;
}

export const SCENARIOS: Scenario[] = [
  // Tier 1: Baseline (40 pts)
  { id: "B1", tier: "baseline", points: 5, description: "Show me all GPS pings for VH-042 yesterday between 2-3 PM", whatItTests: "Data lands in S3, queryable via Athena", requiresSyntheticData: false },
  { id: "B2", tier: "baseline", points: 5, description: "Was package PKG-88201 delivered on time?", whatItTests: "Enrichment adds on_time field", requiresSyntheticData: false },
  { id: "B3", tier: "baseline", points: 5, description: "Which deliveries failed yesterday and why?", whatItTests: "Failure alerts generated", requiresSyntheticData: false },
  { id: "B4", tier: "baseline", points: 5, description: "Were any vehicles idle for more than 15 minutes yesterday?", whatItTests: "Idle detection working", requiresSyntheticData: false },
  { id: "B5", tier: "baseline", points: 5, description: "What was the fleet's on-time delivery rate yesterday?", whatItTests: "KPI calculation", requiresSyntheticData: false },
  { id: "B6", tier: "baseline", points: 5, description: "Which drivers need coaching based on last week's performance?", whatItTests: "Per-driver KPIs", requiresSyntheticData: false },
  { id: "B7", tier: "baseline", points: 5, description: "Prove VH-042 was at location X when PKG-88201 was delivered", whatItTests: "GPS + delivery event correlation via Athena", requiresSyntheticData: false },
  { id: "B8", tier: "baseline", points: 5, description: "What are the monthly AWS costs for this system? What happens at 500 vehicles?", whatItTests: "Cost analysis documented", requiresSyntheticData: false },

  // Tier 2: Enhanced (105 pts)
  { id: "E1", tier: "enhanced", points: 8, description: "Alert me the moment a delivery fails — don't wait for end of day", whatItTests: "Real-time alerting mechanism (SNS, or live alerts prefix)", requiresSyntheticData: false },
  { id: "E2", tier: "enhanced", points: 10, description: "Show me all vehicles currently within 2 miles of a failed delivery location", whatItTests: "GPS proximity calculation", requiresSyntheticData: false },
  { id: "E3", tier: "enhanced", points: 12, description: "Flag packages at risk of missing their delivery window BEFORE the delivery attempt", whatItTests: "Proactive SLA risk — requires manifest/pickup data", requiresSyntheticData: true },
  { id: "E4", tier: "enhanced", points: 12, description: "Estimate how far each vehicle is from its next scheduled delivery", whatItTests: "Requires delivery addresses + route data", requiresSyntheticData: true },
  { id: "E5", tier: "enhanced", points: 15, description: "When a delivery fails, automatically identify the nearest available vehicle that could retry", whatItTests: "Manifest + GPS proximity + availability logic", requiresSyntheticData: true },
  { id: "E6", tier: "enhanced", points: 8, description: "Show me cost-per-delivery broken down by zone (downtown vs. suburbs)", whatItTests: "Zone classification logic applied to GPS coordinates", requiresSyntheticData: false },
  { id: "E7", tier: "enhanced", points: 12, description: "Predict which drivers will miss their daily targets based on morning performance", whatItTests: "Historical baselines or manifest data", requiresSyntheticData: true },
  { id: "E8", tier: "enhanced", points: 10, description: "Generate a customer notification when their delivery is completed, including GPS proof", whatItTests: "Customer contact info + notification logic", requiresSyntheticData: true },
  { id: "E9", tier: "enhanced", points: 10, description: "Detect if a driver is deviating from their expected delivery zone", whatItTests: "Assigned zone data or geofencing logic", requiresSyntheticData: true },
  { id: "E10", tier: "enhanced", points: 8, description: "Produce a weekly trend report showing improvement or decline in SLA performance", whatItTests: "Multiple days of data + trend calculation", requiresSyntheticData: false },
];

export const MAX_BASELINE = SCENARIOS.filter((s) => s.tier === "baseline").reduce((sum, s) => sum + s.points, 0);
export const MAX_ENHANCED = SCENARIOS.filter((s) => s.tier === "enhanced").reduce((sum, s) => sum + s.points, 0);
export const MAX_INNOVATION = 45; // 3 x 15 pts max

export const BONUS_POINTS: Record<number, number> = {
  1: 15,
  2: 10,
  3: 5,
};

export interface QualitySignal {
  signal: string;
  positive: string;
  negative: string;
}

export const QUALITY_SIGNALS: QualitySignal[] = [
  { signal: "Modularity", positive: "Each Lambda does one job, clear separation", negative: "Monolithic Lambda doing everything" },
  { signal: "Error handling", positive: "Graceful degradation, malformed routing, retries", negative: "Crashes on bad data, no error logging" },
  { signal: "Documentation", positive: "Clear ADL entries, code comments", negative: "No documentation" },
  { signal: "Trade-off awareness", positive: "Chose X because Y, accepting trade-off Z", negative: "No awareness of alternatives" },
  { signal: "Code quality", positive: "Clean, readable, consistent naming", negative: "Copy-pasted, inconsistent" },
  { signal: "Scalability thinking", positive: "Considered 500 vehicles", negative: "No thought about growth" },
];
