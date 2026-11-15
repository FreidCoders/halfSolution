"use client";

import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { describeStatus } from "@/components/layout/OllamaStatusBadge";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/Field";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { clearHistory, savePrefs, useHistory, usePrefs } from "@/lib/store";
import { cn, exportHistoryPdf } from "@/lib/utils";
import type { AppConfig } from "@/types";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[14rem_1fr] lg:gap-8">
      <div>
        <h2 className="text-xl font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <Card className="space-y-5">{children}</Card>
    </section>
  );
}

export function SettingsView() {
  const { prefs, ready } = usePrefs();
  const { records } = useHistory();
  const { state, refresh } = useOllamaStatus();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (ready) setName(prefs.profileName);
  }, [ready, prefs.profileName]);
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfigError(true));
  }, []);

  const status = describeStatus(state);

  function saveName(e: FormEvent) {
    e.preventDefault();
    if (savePrefs({ ...prefs, profileName: name.trim().slice(0, 60) })) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-medium sm:text-4xl">Paramètres</h1>
        <p className="mt-1 text-sm text-muted">Les réglages de l&apos;interface sont enregistrés dans ce navigateur.</p>
      </div>

      <Section title="Préférences générales" description="Ce que HalfSolution affiche dans l'interface.">
        <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><TextInput id="profile" label="Nom du profil" placeholder="Ex. Awa" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} hint="Affiché dans la barre latérale. Il n'est envoyé à aucun serveur." autoComplete="off" /></div>
          <Button type="submit" variant="secondary" className="sm:mb-6">{saved ? "Enregistré" : "Enregistrer"}</Button>
        </form>
        <div className="flex items-start justify-between gap-4 border-t border-line pt-5">
          <div>
            <p id="motion-label" className="text-sm font-medium">Réduire les animations</p>
            <p className="mt-0.5 text-sm text-muted">Désactive les transitions, y compris celle de la barre de couverture.</p>
          </div>
          <button type="button" role="switch" aria-checked={prefs.reduceMotion} aria-labelledby="motion-label" onClick={() => savePrefs({ ...prefs, reduceMotion: !prefs.reduceMotion })}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", prefs.reduceMotion ? "bg-olive" : "bg-[#CFCCC0]")}>
            <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-paper shadow-soft transition-all", prefs.reduceMotion ? "left-[1.375rem]" : "left-0.5")} />
          </button>
        </div>
      </Section>

      <Section title="Configuration IA" description="Le moteur d'analyse configuré sur le serveur.">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div><dt className="text-sm text-muted">Modèle utilisé</dt><dd className="mt-1 font-medium">{config?.model ?? (configError ? "Indisponible" : "…")}</dd></div>
          <div>
            <dt className="text-sm text-muted">Connexion au moteur IA</dt>
            <dd className="mt-1 flex items-center gap-2 font-medium">
              <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", state.phase === "loading" ? "bg-muted" : status.ok ? "bg-olive" : "bg-danger")} />
              {status.ok ? "Connecté" : status.label}
            </dd>
          </div>
          {config?.ollama_url && <div><dt className="text-sm text-muted">Adresse du moteur</dt><dd className="mt-1 break-all font-mono text-sm">{config.ollama_url}</dd></div>}
          <div><dt className="text-sm text-muted">API HalfSolution</dt><dd className="mt-1 break-all font-mono text-sm">{API_URL}</dd></div>
        </dl>
        {!status.ok && state.phase !== "loading" && <Alert tone="error" title={status.label}>{status.detail}</Alert>}
        {state.phase === "ready" && state.status.connected && (
          <p className="text-sm text-muted">Modèles disponibles : {state.status.installed_models.length ? state.status.installed_models.join(", ") : "aucun"}.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={refresh} icon={<RefreshCw aria-hidden className={cn("h-4 w-4", state.phase === "loading" && "hs-spin")} />}>Vérifier la connexion</Button>
        </div>
        <p className="border-t border-line pt-4 text-sm text-muted">Le moteur IA se configure côté serveur. Les paramètres ne peuvent pas être modifiés depuis cette interface.</p>
      </Section>

      <Section title="Données locales" description="Historique des analyses sur cet appareil.">
        <p className="text-sm">{records.length} analyse{records.length > 1 ? "s" : ""} enregistrée{records.length > 1 ? "s" : ""} dans ce navigateur. Elles ne sont ni synchronisées ni sauvegardées ailleurs.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={!records.length} icon={<Download aria-hidden className="h-4 w-4" />} onClick={() => exportHistoryPdf(records)}>Exporter tout l&apos;historique (PDF)</Button>
          <Button variant="danger" disabled={!records.length} icon={<Trash2 aria-hidden className="h-4 w-4" />} onClick={() => { if (window.confirm("Supprimer toutes les analyses enregistrées dans ce navigateur ? Cette action est définitive.")) clearHistory(); }}>Effacer l&apos;historique</Button>
        </div>
      </Section>
    </div>
  );
}
