"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextArea, TextInput } from "@/components/ui/Field";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import { api, ApiClientError } from "@/lib/api";
import { EXAMPLE_PRODUCT } from "@/lib/constants";
import { EMPTY_DRAFT, loadDraft, persistDraft, rememberPayload, type Draft } from "@/lib/store";

const LIMITS = { name: 120, audience: 300, problem: 3000, value_proposition: 4000, features: 30 };
const MIN_LEN = 15;

type Errors = Partial<Record<keyof Draft, string>>;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.problem.trim()) e.problem = "Décrivez le problème que rencontre votre client.";
  else if (d.problem.trim().length < MIN_LEN) e.problem = `Ajoutez un peu de détail (${MIN_LEN} caractères minimum).`;
  if (!d.value_proposition.trim()) e.value_proposition = "Indiquez ce que votre SaaS permet de faire.";
  else if (d.value_proposition.trim().length < MIN_LEN) e.value_proposition = `Ajoutez un peu de détail (${MIN_LEN} caractères minimum).`;
  if (d.features.split("\n").filter((l) => l.trim()).length > LIMITS.features) e.features = `${LIMITS.features} fonctionnalités maximum.`;
  return e;
}

export function AnalyzeForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Draft, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<{ message: string; hint?: string | null } | null>(null);
  const loaded = useRef(false);
  const submitLock = useRef(false);
  const { state: ollama } = useOllamaStatus();

  // Restaure le brouillon, puis le sauvegarde à chaque frappe : rien n'est perdu après une erreur ou un rechargement.
  useEffect(() => {
    setDraft(loadDraft());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (loaded.current) persistDraft(draft);
  }, [draft]);

  const set = (key: keyof Draft) => (e: { target: { value: string } }) => {
    const next = { ...draft, [key]: e.target.value };
    setDraft(next);
    if (touched[key]) setErrors(validate(next));
  };
  const blur = (key: keyof Draft) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(validate(draft));
  };
  const visible = (key: keyof Draft) => (touched[key] ? errors[key] : undefined);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitLock.current) return; // empêche la double soumission
    const found = validate(draft);
    setErrors(found);
    setTouched({ name: true, audience: true, problem: true, value_proposition: true, features: true });
    if (Object.keys(found).length) {
      const first = (["problem", "value_proposition", "features"] as const).find((k) => found[k]);
      if (first) document.getElementById(first)?.focus();
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setApiError(null);
    const payload = {
      name: draft.name.trim(),
      audience: draft.audience.trim(),
      problem: draft.problem.trim(),
      value_proposition: draft.value_proposition.trim(),
      features: draft.features.split("\n").map((l) => l.trim()).filter(Boolean),
    };
    try {
      const { id } = await api.startAnalysis(payload);
      rememberPayload(id, payload);
      router.push(`/analysis/${id}`); // le brouillon est conservé jusqu'à la fin réussie de l'analyse
    } catch (err) {
      setApiError(err instanceof ApiClientError ? err.body : { message: "Une erreur inattendue est survenue." });
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  const ollamaProblem =
    ollama.phase === "api_down"
      ? { title: ollama.error.message, text: ollama.error.hint }
      : ollama.phase === "ready" && (!ollama.status.connected || !ollama.status.model_available)
      ? { title: ollama.status.error?.message ?? "Le moteur IA n'est pas prêt.", text: ollama.status.error?.hint }
        : null;

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-medium sm:text-4xl">Analysez votre prochaine idée SaaS</h1>
      <p className="mt-2 text-[15px] text-charcoal/80">Découvrez ce que les modèles IA peuvent déjà accomplir et les besoins qui restent à couvrir.</p>

      <div className="mt-5 space-y-3">
        {ollamaProblem && <Alert tone="error" title={ollamaProblem.title}>{ollamaProblem.text} L&apos;analyse échouera tant que ce point n&apos;est pas réglé.</Alert>}
        {apiError && <Alert tone="error" title={apiError.message}>{apiError.hint} Vos réponses sont conservées.</Alert>}
      </div>

      <Card className="mt-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-medium">Informations sur le produit</h2>
          <Button size="sm" variant="soft" icon={<Sparkles aria-hidden className="h-4 w-4" />} onClick={() => { setDraft(EXAMPLE_PRODUCT); setErrors({}); setTouched({}); }}>
            Remplir avec un exemple
          </Button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id="name" label="Nom du produit" placeholder="Ex. StyliApp" maxLength={LIMITS.name} value={draft.name} onChange={set("name")} autoComplete="off" />
          <TextInput id="audience" label="Public cible" placeholder="Ex. couturiers indépendants et petits ateliers" maxLength={LIMITS.audience} value={draft.audience} onChange={set("audience")} autoComplete="off" />
        </div>

        <TextArea id="problem" label="Problème client" required rows={4} maxLength={LIMITS.problem}
          placeholder="Quel problème concret votre client rencontre-t-il aujourd'hui ? Décrivez la situation, pas la solution."
          hint="Plus la description est concrète, plus les tâches extraites sont pertinentes."
          value={draft.problem} onChange={set("problem")} onBlur={blur("problem")} error={visible("problem")} />

        <TextArea id="value_proposition" label="Proposition de valeur" required rows={5} maxLength={LIMITS.value_proposition}
          placeholder="Que permet de faire votre SaaS ? Ex. : centraliser les commandes, envoyer des rappels, suivre les paiements."
          value={draft.value_proposition} onChange={set("value_proposition")} onBlur={blur("value_proposition")} error={visible("value_proposition")} />

        <TextArea id="features" label="Fonctionnalités principales" rows={4}
          placeholder={"Une fonctionnalité par ligne\nEx. Fiche client avec mesures"}
          hint={`Une par ligne, ${LIMITS.features} au maximum.`}
          value={draft.features} onChange={set("features")} onBlur={blur("features")} error={visible("features")} />
      </Card>

      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">Votre saisie est enregistrée dans ce navigateur pendant que vous écrivez.</p>
        <Button type="submit" disabled={submitting} className="sm:min-w-52" aria-busy={submitting}>
          {submitting ? "Envoi en cours…" : "Lancer l'analyse"}
        </Button>
      </div>
    </form>
  );
}
