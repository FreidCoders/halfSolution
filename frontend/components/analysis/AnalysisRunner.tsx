"use client";

import { AlertTriangle, Check, Circle, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api, ApiClientError } from "@/lib/api";
import { clearDraft, recallPayload, rememberPayload, saveAnalysis } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AnalysisJob, AnalysisRecord, ApiErrorBody, ProductContext } from "@/types";

const POLL_MS = 2000;
const MAX_NETWORK_FAILURES = 3;

const STEP_LABELS: Record<string, string> = {
  connection: "Vérification du moteur IA",
  extraction: "Compréhension et extraction des tâches",
  evaluation: "Évaluation des capacités IA",
  scoring: "Calcul du score",
  opportunities: "Identification des opportunités",
};

type RunState =
  | { phase: "polling"; job: AnalysisJob | null }
  | { phase: "failed"; error: ApiErrorBody; failedStep?: string; job: AnalysisJob | null };

function StepIcon({ status }: { status: string }) {
  if (status === "done") return <Check aria-hidden className="h-4 w-4 text-paper" />;
  if (status === "running") return <Loader2 aria-hidden className="hs-spin h-4 w-4 text-olive" />;
  if (status === "error") return <AlertTriangle aria-hidden className="h-4 w-4 text-danger" />;
  return <Circle aria-hidden className="h-3 w-3 text-muted/60" />;
}

export function AnalysisRunner({ id, onDone }: { id: string; onDone: (record: AnalysisRecord, saved: boolean) => void }) {
  const router = useRouter();
  const [state, setState] = useState<RunState>({ phase: "polling", job: null });
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ProductContext | null>(null);
  const finished = useRef(false);

  useEffect(() => setPayload(recallPayload<ProductContext>(id)), [id]);

  // Interrogation réelle du backend : l'état affiché est celui renvoyé par l'API, rien n'est simulé.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    finished.current = false;
    setState({ phase: "polling", job: null });

    const tick = async () => {
      try {
        const job = await api.analysisJob(id);
        if (cancelled) return;
        failures = 0;
        if (job.status === "done" && job.result) {
          if (finished.current) return;
          finished.current = true;
          const record: AnalysisRecord = { id: job.id, createdAt: job.created_at, result: job.result };
          const saved = saveAnalysis(record);
          clearDraft();
          onDone(record, saved);
          return;
        }
        if (job.status === "error") {
          setState({ phase: "failed", error: job.error ?? { code: "engine_error", message: "L'analyse a échoué." }, failedStep: job.error?.step, job });
          return;
        }
        setState({ phase: "polling", job });
      } catch (e) {
        if (cancelled) return;
        const body = e instanceof ApiClientError ? e.body : { code: "api_unreachable", message: "API injoignable." };
        const fatal = e instanceof ApiClientError && e.status === 404;
        failures += 1;
        if (fatal || failures >= MAX_NETWORK_FAILURES) {
          setState({ phase: "failed", error: body, job: null });
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, onDone]);

  useEffect(() => {
    if (state.phase !== "polling") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state.phase]);

  const retry = useCallback(async () => {
    if (!payload) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const { id: newId } = await api.startAnalysis(payload);
      rememberPayload(newId, payload);
      router.replace(`/analysis/${newId}`);
    } catch (e) {
      setRetryError(e instanceof ApiClientError ? [e.body.message, e.body.hint].filter(Boolean).join(" ") : "Impossible de relancer l'analyse.");
    } finally {
      setRetrying(false);
    }
  }, [payload, router]);

  const job = state.job;
  const steps = job?.progress.steps ?? Object.keys(STEP_LABELS).map((key) => ({ key, label: STEP_LABELS[key] ?? key, status: "pending" as const }));
  const total = job?.progress.tasks_total ?? null;
  const done = job?.progress.tasks_done ?? 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="text-3xl font-medium sm:text-4xl">{state.phase === "failed" ? "L'analyse n'a pas abouti" : "Analyse en cours"}</h1>
      {state.phase === "polling" && (
        <p className="mt-3 text-[15px] text-charcoal/80">
          Le modèle tourne sur votre machine, ce qui peut prendre plusieurs minutes. Gardez cet onglet ouvert : les résultats s&apos;affichent dès que l&apos;analyse est terminée.
        </p>
      )}

      <Card className="mt-6">
        <ol className="space-y-1" aria-live="polite">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-3 py-2.5">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", s.status === "done" ? "bg-olive" : s.status === "running" ? "bg-sage" : s.status === "error" ? "bg-[#FBF1EE]" : "bg-cream")}>
                <StepIcon status={s.status} />
              </span>
              <span className={cn("text-[15px]", s.status === "pending" ? "text-muted" : "font-medium")}>
                {STEP_LABELS[s.key] ?? s.label}
                {s.key === "evaluation" && total !== null && s.status !== "pending" && (
                  <span className="ml-2 font-normal tabular-nums text-muted">tâche {Math.min(done + (s.status === "running" ? 1 : 0), total)} sur {total}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {state.phase === "polling" && (
          <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
            Temps écoulé : <span className="tabular-nums">{mm}:{ss}</span>. L&apos;API ne fournit pas de pourcentage d&apos;avancement : seules les étapes terminées sont affichées.
          </p>
        )}
      </Card>

      {state.phase === "failed" && (
        <div className="mt-6 space-y-4">
          <Alert tone="error" title={state.error.message}>
            {state.error.hint}
            {state.failedStep && <span className="mt-1 block text-xs text-muted">Étape concernée : {STEP_LABELS[state.failedStep] ?? state.failedStep}</span>}
          </Alert>
          {retryError && <Alert tone="error" title="Relance impossible">{retryError}</Alert>}
          <div className="flex flex-wrap gap-2">
            {payload ? (
              <Button onClick={retry} disabled={retrying} icon={<RotateCcw aria-hidden className={cn("h-4 w-4", retrying && "hs-spin")} />}>
                {retrying ? "Relance…" : "Réessayer l'analyse"}
              </Button>
            ) : null}
            <Button variant="secondary" href="/analyze">Modifier ma saisie</Button>
          </div>
          {!payload && <p className="text-sm text-muted">Les données de cette analyse ne sont plus disponibles dans cet onglet. Votre dernier brouillon est conservé sur <Link href="/analyze" className="underline">la page de saisie</Link>.</p>}
        </div>
      )}
    </div>
  );
}
