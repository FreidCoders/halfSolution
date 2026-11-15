/** Types alignés sur les structures réelles du moteur Python (core/, analysis/). */

export interface ProductContext {
  name: string;
  audience: string;
  problem: string;
  value_proposition: string;
  features: string[];
}

export interface TaskEvaluation {
  task: string;
  /** Importance 1–5 (core/task_extractor.py) */
  weight: number;
  /** Part de la tâche que le modèle pourrait accomplir seul, 0–100 (core/capability_tester.py) */
  capability: number;
  /** Chaînes libres produites par le LLM, normalement faible | moyenne | élevée */
  autonomy: string;
  limitation: string;
  confidence: string;
}

export interface AnalysisScore {
  ai_coverage: number;
  gap: number;
}

export interface MonetizationOpportunity {
  task: string;
  reason: string;
}

export interface AnalysisResult {
  product: ProductContext;
  score: AnalysisScore;
  evaluations: TaskEvaluation[];
  monetization_opportunities: MonetizationOpportunity[];
  methodology_note: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  hint?: string | null;
  step?: string;
}

export interface OllamaStatus {
  engine: "groq" | "ollama";
  connected: boolean;
  model: string;
  model_available: boolean;
  installed_models: string[];
  error: ApiErrorBody | null;
}

export interface AppConfig {
  model: string;
  timeout_seconds: number;
  opportunity_threshold: number;
  ollama_url?: string;
}

export type StepStatus = "pending" | "running" | "done" | "error";

export interface JobStep {
  key: string;
  label: string;
  status: StepStatus;
}

export interface AnalysisJob {
  id: string;
  status: "running" | "done" | "error";
  created_at: string;
  progress: { steps: JobStep[]; tasks_total: number | null; tasks_done: number };
  result: AnalysisResult | null;
  error: ApiErrorBody | null;
}

/** Entrée de l'historique local (navigateur). */
export interface AnalysisRecord {
  id: string;
  createdAt: string;
  result: AnalysisResult;
}

/** Opportunité enrichie, dérivée d'une analyse locale. */
export interface OpportunityView {
  id: string;
  analysisId: string;
  analysisName: string;
  analysisDate: string;
  task: string;
  reason: string;
  capability: number | null;
  weight: number | null;
  autonomy: string | null;
  confidence: string | null;
}

export type CoverageLevel = "high" | "medium" | "low";
