export type UseCaseStage =
  | "TOFU"
  | "MOFU"
  | "BOFU"
  | "POST_SALE"
  | "INTERNAL"
  | "VERTICAL"
  | "FORMAT";

export type EvidenceSignal =
  | "before_after"
  | "timeline"
  | "quant_claim"
  | "stakeholder_perspective"
  | "implementation_detail"
  | "risk_control"
  | "competitor_comparison";

export type QuantPriority =
  | "cost_savings"
  | "revenue"
  | "time_saved"
  | "efficiency"
  | "error_reduction"
  | "adoption"
  | "risk"
  | "roi"
  | "other";

export interface UseCaseSpec {
  objective: string;
  narrativeAngle: string;
  backendPromptTemplate: string;
  primaryAudience: string[];
  requiredEvidenceSignals: EvidenceSignal[];
  quantitativePriority: QuantPriority[];
  requiredSections: string[];
  dataGapQuestions: string[];
  reusableMessagingOutputs: string[];
  forbiddenMoves: string[];
  minimumQuoteCount: number;
  minimumClaimCount: number;
}

export interface UseCaseDefinition {
  id: string;
  name: string;
  stage: UseCaseStage;
  focus: string;
  spec: UseCaseSpec;
}

interface UseCaseSeed {
  id: string;
  name: string;
  stage: UseCaseStage;
  focus: string;
}

const REQUIRED_SECTIONS = [
  "Executive Summary",
  "Context",
  "Trigger / Problem",
  "Evaluation / Decision Dynamics",
  "Implementation / Adoption",
  "Outcomes and Metrics",
  "Quantitative Evidence Table",
  "Notable Quotes (with direct attribution)",
  "Risks, Gaps, and What Is Still Unknown",
  "Reusable Messaging",
] as const;

const COMMON_FORBIDDEN_MOVES = [
  "Do not invent numbers, dates, or customer claims.",
  "Do not claim ROI/payback unless explicit numeric evidence exists.",
  "Do not present inferred facts as confirmed facts.",
  "Do not attribute quotes to named speakers unless attribution evidence exists.",
];

const STAGE_PROFILE: Record<UseCaseStage, Omit<UseCaseSpec, "objective" | "narrativeAngle">> = {
  TOFU: {
    primaryAudience: ["Product Marketing", "Content Marketing", "Demand Generation"],
    backendPromptTemplate:
      "Frame this as an awareness-stage narrative grounded in timeline evidence, customer context, and attributable observations.",
    requiredEvidenceSignals: ["before_after", "timeline", "stakeholder_perspective"],
    quantitativePriority: ["adoption", "risk", "efficiency", "other"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "What baseline condition existed before change?",
      "Which macro trigger is evidenced versus inferred?",
    ],
    reusableMessagingOutputs: ["Thought-leadership angle", "Awareness narrative bullets"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 3,
    minimumClaimCount: 2,
  },
  MOFU: {
    primaryAudience: ["Sales Engineering", "Solutions Consulting", "Product Marketing"],
    backendPromptTemplate:
      "Frame this as an evaluation-stage proof narrative emphasizing implementation details, decision tradeoffs, and attributable technical outcomes.",
    requiredEvidenceSignals: [
      "implementation_detail",
      "timeline",
      "quant_claim",
      "risk_control",
      "competitor_comparison",
    ],
    quantitativePriority: ["time_saved", "efficiency", "error_reduction", "adoption", "risk"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Which technical constraints were unresolved?",
      "What implementation milestones are missing dates or owners?",
    ],
    reusableMessagingOutputs: ["Evaluation-stage talk track", "Objection-handling bullets"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 3,
    minimumClaimCount: 3,
  },
  BOFU: {
    primaryAudience: ["AEs", "Revenue Leadership", "Executive Sponsors"],
    backendPromptTemplate:
      "Frame this as a decision-stage business case with explicit quantified outcomes, assumptions, and confidence labeling.",
    requiredEvidenceSignals: ["quant_claim", "before_after", "timeline", "risk_control"],
    quantitativePriority: ["roi", "cost_savings", "revenue", "time_saved", "risk"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Is financial impact net-new, avoided cost, or projected?",
      "Are payback assumptions explicit and attributable?",
    ],
    reusableMessagingOutputs: ["Decision memo bullets", "Executive summary for procurement"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 3,
    minimumClaimCount: 4,
  },
  POST_SALE: {
    primaryAudience: ["Customer Success", "Account Management", "Product"],
    backendPromptTemplate:
      "Frame this as a post-sale growth narrative covering adoption trajectory, retention signals, and expansion outcomes with attribution.",
    requiredEvidenceSignals: ["timeline", "implementation_detail", "stakeholder_perspective", "quant_claim"],
    quantitativePriority: ["adoption", "efficiency", "risk", "time_saved", "other"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Which expansion/renewal claims have hard evidence?",
      "Where are attribution gaps across lifecycle stages?",
    ],
    reusableMessagingOutputs: ["Renewal narrative", "Expansion case-study bullets"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 3,
    minimumClaimCount: 3,
  },
  INTERNAL: {
    primaryAudience: ["Sales Leadership", "RevOps", "Delivery Leadership"],
    backendPromptTemplate:
      "Frame this as an internal enablement brief with concrete lessons, operational implications, and actionable next steps.",
    requiredEvidenceSignals: ["stakeholder_perspective", "implementation_detail", "timeline", "quant_claim"],
    quantitativePriority: ["efficiency", "error_reduction", "adoption", "time_saved", "other"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Which internal process assumptions are unsupported?",
      "What evidence is missing to operationalize this lesson?",
    ],
    reusableMessagingOutputs: ["Enablement bullet set", "Playbook update suggestions"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 2,
    minimumClaimCount: 2,
  },
  VERTICAL: {
    primaryAudience: ["Industry GTM", "Field Marketing", "Strategic Sales"],
    backendPromptTemplate:
      "Frame this as a segment-specific narrative that highlights vertical constraints, regulatory nuances, and attributable outcomes.",
    requiredEvidenceSignals: ["stakeholder_perspective", "quant_claim", "risk_control", "before_after"],
    quantitativePriority: ["risk", "adoption", "roi", "efficiency", "other"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Which vertical-specific constraints are evidenced versus generic?",
      "What segment/persona assumptions need direct validation?",
    ],
    reusableMessagingOutputs: ["Vertical talk track", "Persona-tailored key points"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 3,
    minimumClaimCount: 3,
  },
  FORMAT: {
    primaryAudience: ["Content Team", "Executive Comms", "Field Marketing"],
    backendPromptTemplate:
      "Frame this in a reusable content format with concise evidence density and highly attributable quote/metric packaging.",
    requiredEvidenceSignals: ["before_after", "quant_claim", "stakeholder_perspective", "timeline"],
    quantitativePriority: ["roi", "cost_savings", "revenue", "efficiency", "other"],
    requiredSections: [...REQUIRED_SECTIONS],
    dataGapQuestions: [
      "Does this format have enough concise attributable evidence?",
      "Which sections should be downgraded due to weak support?",
    ],
    reusableMessagingOutputs: ["Portable messaging snippets", "Channel-specific content angles"],
    forbiddenMoves: [...COMMON_FORBIDDEN_MOVES],
    minimumQuoteCount: 4,
    minimumClaimCount: 2,
  },
};

type UseCaseOverride = Partial<UseCaseSpec>;

const USE_CASE_OVERRIDES: Record<string, UseCaseOverride> = {
  roi_financial_outcomes: {
    objective:
      "Prove economic value with attributable baseline, delta, and confidence-qualified financial impact.",
    narrativeAngle: "Lead with financial before/after and payback logic backed by direct evidence.",
    quantitativePriority: ["roi", "cost_savings", "revenue", "time_saved", "efficiency"],
    minimumClaimCount: 5,
  },
  quantified_operational_metrics: {
    objective:
      "Demonstrate operational improvements with concrete metrics and denominator clarity.",
    narrativeAngle: "Center the narrative on measurable throughput, cycle-time, and quality changes.",
    quantitativePriority: ["time_saved", "efficiency", "error_reduction", "adoption", "other"],
    minimumClaimCount: 5,
  },
  competitive_displacement: {
    objective:
      "Show why the customer switched from a competitor and what measurable change occurred after migration.",
    narrativeAngle: "Contrast incumbent limitations with post-migration outcomes and adoption trajectory.",
    requiredEvidenceSignals: [
      "competitor_comparison",
      "implementation_detail",
      "timeline",
      "quant_claim",
      "risk_control",
    ],
  },
  pilot_to_production: {
    objective:
      "Explain the pilot hypothesis, validation criteria, and production cutover with timeline evidence.",
    narrativeAngle: "Track milestones from pilot scope to production deployment with accountability details.",
    requiredEvidenceSignals: ["timeline", "implementation_detail", "quant_claim", "risk_control"],
  },
  deployment_speed: {
    objective:
      "Quantify speed-to-value against expectations, including what accelerated or slowed deployment.",
    narrativeAngle: "Compare planned timeline versus actual and attribute causes with direct evidence.",
    quantitativePriority: ["time_saved", "efficiency", "risk", "other", "adoption"],
    minimumClaimCount: 4,
  },
  by_the_numbers_snapshot: {
    objective: "Produce a metric-first story that can stand alone as a numbers-backed evidence snapshot.",
    narrativeAngle: "Minimize prose and maximize attributable metric density and comparability.",
    quantitativePriority: ["roi", "cost_savings", "revenue", "efficiency", "time_saved"],
    minimumClaimCount: 6,
  },
  video_testimonial_soundbite: {
    objective:
      "Curate short, high-impact attributed quotes suitable for executive testimonial snippets.",
    narrativeAngle: "Quote-first narrative with concise context and explicit confidence cues.",
    minimumQuoteCount: 6,
    minimumClaimCount: 1,
  },
  peer_reference_call_guide: {
    objective:
      "Generate a structured peer-reference talk track with attributable proof points and likely objections.",
    narrativeAngle: "Organize evidence into reusable peer-call prompts with concise factual anchors.",
    minimumQuoteCount: 5,
    minimumClaimCount: 2,
  },
  analyst_validated_study: {
    objective:
      "Package evidence for external scrutiny with explicit confidence levels, assumptions, and known gaps.",
    narrativeAngle: "Prioritize verifiability, traceability, and uncertainty labeling over narrative flourish.",
    requiredEvidenceSignals: ["quant_claim", "risk_control", "timeline", "stakeholder_perspective"],
    minimumClaimCount: 4,
  },
};

const USE_CASE_SEEDS: UseCaseSeed[] = [
  { id: "industry_trend_validation", name: "Industry Trend Validation", stage: "TOFU", focus: "How the customer navigated a macro shift." },
  { id: "problem_challenge_identification", name: "Problem/Challenge Identification", stage: "TOFU", focus: "Day-in-the-life pain point before the solution." },
  { id: "digital_transformation_modernization", name: "Digital Transformation Journey", stage: "TOFU", focus: "Modernization outcomes and transformation milestones." },
  { id: "regulatory_compliance_challenges", name: "Regulatory/Compliance Challenge", stage: "TOFU", focus: "Compliance constraints and how they were resolved." },
  { id: "market_expansion", name: "Market Expansion", stage: "TOFU", focus: "Expansion to new geographies or segments." },
  { id: "thought_leadership_cocreation", name: "Thought Leadership Co-Creation", stage: "TOFU", focus: "Joint insights/research with the customer." },
  { id: "product_capability_deepdive", name: "Product Capability Deep-Dive", stage: "MOFU", focus: "Feature/platform capability in real use." },
  { id: "competitive_displacement", name: "Competitive Displacement", stage: "MOFU", focus: "Migration off a named competitor." },
  { id: "integration_interoperability", name: "Integration/Interoperability", stage: "MOFU", focus: "How the solution integrates into existing stack." },
  { id: "implementation_onboarding", name: "Implementation/Onboarding", stage: "MOFU", focus: "Rollout plan, time-to-value, onboarding friction." },
  { id: "security_compliance_governance", name: "Security/Compliance/Governance", stage: "MOFU", focus: "Security and governance proof points in practice." },
  { id: "customization_configurability", name: "Customization/Configurability", stage: "MOFU", focus: "Unique workflow tailoring and flexibility." },
  { id: "multi_product_cross_sell", name: "Multi-Product Adoption", stage: "MOFU", focus: "Land-and-expand across multiple products." },
  { id: "partner_ecosystem_solution", name: "Partner/Ecosystem Solution", stage: "MOFU", focus: "SI/reseller/ISV role in success." },
  { id: "total_cost_of_ownership", name: "Total Cost of Ownership", stage: "MOFU", focus: "Pricing model and TCO validation." },
  { id: "pilot_to_production", name: "Pilot to Production", stage: "MOFU", focus: "POC journey and production rollout evidence." },
  { id: "roi_financial_outcomes", name: "ROI/Financial Outcomes", stage: "BOFU", focus: "Hard ROI, payback period, savings/revenue." },
  { id: "quantified_operational_metrics", name: "Quantified Operational Metrics", stage: "BOFU", focus: "Time saved, efficiency gains, error reduction." },
  { id: "executive_strategic_impact", name: "Executive Strategic Impact", stage: "BOFU", focus: "Board or C-suite strategic impact framing." },
  { id: "risk_mitigation_continuity", name: "Risk Mitigation and Continuity", stage: "BOFU", focus: "Risk reduction and continuity outcomes." },
  { id: "deployment_speed", name: "Deployment Speed", stage: "BOFU", focus: "Speed vs initial deployment expectations." },
  { id: "vendor_selection_criteria", name: "Vendor Selection Criteria", stage: "BOFU", focus: "Why vendor was chosen over alternatives." },
  { id: "procurement_experience", name: "Procurement Experience", stage: "BOFU", focus: "Contracting and procurement journey." },
  { id: "renewal_partnership_evolution", name: "Renewal and Long-Term Partnership", stage: "POST_SALE", focus: "Renewal signals and relationship maturity." },
  { id: "upsell_cross_sell_expansion", name: "Upsell/Cross-Sell Expansion", stage: "POST_SALE", focus: "Expansion path and incremental value." },
  { id: "customer_success_support", name: "Customer Success and Support", stage: "POST_SALE", focus: "CS/support quality and outcomes." },
  { id: "training_enablement_adoption", name: "Training and Enablement", stage: "POST_SALE", focus: "Enablement programs and adoption lift." },
  { id: "community_advisory_participation", name: "Community/Advisory Participation", stage: "POST_SALE", focus: "Community engagement and advocacy." },
  { id: "co_innovation_product_feedback", name: "Co-Innovation/Product Feedback", stage: "POST_SALE", focus: "Roadmap influence and feedback loop." },
  { id: "change_management_champion_dev", name: "Change Management/Champions", stage: "POST_SALE", focus: "Internal champion growth and change mgmt." },
  { id: "scaling_across_org", name: "Scaling Across Organization", stage: "POST_SALE", focus: "Usage growth across teams/geographies." },
  { id: "platform_governance_coe", name: "Platform Governance/CoE", stage: "POST_SALE", focus: "Governance model and center-of-excellence setup." },
  { id: "sales_enablement", name: "Sales Enablement", stage: "INTERNAL", focus: "Objections, competitive intel, deal strategy." },
  { id: "lessons_learned_implementation", name: "Lessons Learned", stage: "INTERNAL", focus: "What failed and how it was fixed." },
  { id: "cross_functional_collaboration", name: "Cross-Functional Collaboration", stage: "INTERNAL", focus: "Sales + CS + product + engineering dynamics." },
  { id: "voice_of_customer_product", name: "Voice of Customer to Product", stage: "INTERNAL", focus: "Customer insights feeding product roadmap." },
  { id: "pricing_packaging_validation", name: "Pricing/Packaging Validation", stage: "INTERNAL", focus: "Pricing iterations and evidence." },
  { id: "churn_save_winback", name: "Churn Save and Win-Back", stage: "INTERNAL", focus: "Retention recovery and save stories." },
  { id: "deal_anatomy", name: "Deal Anatomy", stage: "INTERNAL", focus: "How deal was sourced, structured, and closed." },
  { id: "customer_health_sentiment", name: "Customer Health/Sentiment", stage: "INTERNAL", focus: "Sentiment trajectory across the lifecycle." },
  { id: "reference_ability_development", name: "Reference-Ability Development", stage: "INTERNAL", focus: "From customer to referenceable advocate." },
  { id: "internal_process_improvement", name: "Internal Process Improvement", stage: "INTERNAL", focus: "Operational improvements driven by customer voice." },
  { id: "industry_specific_usecase", name: "Industry-Specific Use Case", stage: "VERTICAL", focus: "Verticalized story for a target industry." },
  { id: "company_size_segment", name: "Company Size/Segment", stage: "VERTICAL", focus: "SMB/mid-market/enterprise specific lens." },
  { id: "persona_specific_framing", name: "Persona-Specific Framing", stage: "VERTICAL", focus: "Narrative tailored by buyer persona." },
  { id: "geographic_regional_variation", name: "Geographic/Regional Variation", stage: "VERTICAL", focus: "Regional nuance and geo-specific outcomes." },
  { id: "regulated_vs_unregulated", name: "Regulated vs Unregulated", stage: "VERTICAL", focus: "How constraints differ by compliance profile." },
  { id: "public_sector_government", name: "Public Sector/Government", stage: "VERTICAL", focus: "Government procurement and compliance story." },
  { id: "before_after_transformation", name: "Before/After Transformation", stage: "FORMAT", focus: "Transformation narrative arc." },
  { id: "day_in_the_life", name: "Day-in-the-Life Story", stage: "FORMAT", focus: "Workflow-level walkthrough." },
  { id: "by_the_numbers_snapshot", name: "By-the-Numbers Snapshot", stage: "FORMAT", focus: "Data-heavy metric-led output." },
  { id: "video_testimonial_soundbite", name: "Video/Testimonial Soundbite", stage: "FORMAT", focus: "Short executive-ready quote package." },
  { id: "joint_webinar_presentation", name: "Joint Webinar/Conference", stage: "FORMAT", focus: "Talk track for co-presentations." },
  { id: "peer_reference_call_guide", name: "Peer Reference Call Guide", stage: "FORMAT", focus: "Structured peer reference call script." },
  { id: "analyst_validated_study", name: "Analyst/Third-Party Validated Study", stage: "FORMAT", focus: "Evidence pack tuned for third-party review." },
];

export const USE_CASES: UseCaseDefinition[] = USE_CASE_SEEDS.map((seed) => {
  const stageProfile = STAGE_PROFILE[seed.stage];
  const override = USE_CASE_OVERRIDES[seed.id] ?? {};

  const spec: UseCaseSpec = {
    ...stageProfile,
    objective:
      override.objective ??
      `Create a ${seed.name.toLowerCase()} narrative that is fully traceable to transcript evidence.`,
    narrativeAngle:
      override.narrativeAngle ??
      `Emphasize this focus: ${seed.focus.replace(/\.$/, "")}.`,
    ...override,
  };

  return {
    ...seed,
    spec,
  };
});
