"use client";

import { RefreshCw } from "lucide-react";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import { cn } from "@/lib/utils";

export function describeStatus(state: ReturnType<typeof useOllamaStatus>["state"]): { label: string; ok: boolean; detail: string } {
  if (state.phase === "loading") return { label: "Vérification…", ok: false, detail: "Vérification du moteur IA" };
  if (state.phase === "api_down") return { label: "API hors ligne", ok: false, detail: state.error.hint ?? state.error.message };
  const s = state.status;
  if (!s.connected) return { label: "Moteur IA indisponible", ok: false, detail: s.error?.hint ?? "Vérifiez la configuration du moteur IA." };
  if (!s.model_available) return { label: "Modèle manquant", ok: false, detail: s.error?.hint ?? "Installez le modèle configuré." };
  const engine = s.engine === "groq" ? "Groq" : "Ollama";
  return { label: `${engine} connecté · ${s.model}`, ok: true, detail: "Le moteur d'analyse est prêt." };
}

export function OllamaStatusBadge() {
  const { state, refresh } = useOllamaStatus();
  const { label, ok, detail } = describeStatus(state);
  const loading = state.phase === "loading";

  return (
    <button
      type="button"
      onClick={refresh}
      title={`${detail} — cliquer pour actualiser`}
      aria-label={`${label}. Actualiser l'état`}
      className="flex min-h-9 items-center gap-2 rounded-full border border-line bg-paper px-3 text-xs text-charcoal transition-colors hover:border-muted"
    >
      <span aria-hidden className={cn("h-2 w-2 rounded-full", loading ? "bg-muted" : ok ? "bg-olive" : "bg-danger")} />
      <span className="hidden max-w-[16rem] truncate sm:inline">{label}</span>
      <RefreshCw aria-hidden className={cn("h-3 w-3 text-muted", loading && "hs-spin")} />
    </button>
  );
}
