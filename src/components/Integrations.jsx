import AIProgress from "./AIProgress";
import AutoSources from "./AutoSources";
import React, { useEffect, useState } from "react";

import {
  Integration as Plug,
  Map as Package,
  Commit as GitCommitHorizontal,
  Github,
  RefreshCw,
  GitPullRequest,
  FileText,
  Ticket,
  Activity,
  Close as X,
  ArrowUpRight,
  Link2,
  CheckCheck as Check,
} from "../icons";
import { Plus, Search } from "../icons";
const providers = {
  github: {
    name: "GitHub",
    mark: "GH",
    summary: "Tickets, pull requests, releases, commits et exécutions CI.",
    placeholder: "https://github.com/organisation/depot",
    docs: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
    access:
      "Les dépôts publics peuvent être lus sans connexion. Pour un dépôt privé, configurez BEAM_GITHUB_TOKEN sur le serveur avec les accès de lecture Issues, Pull requests, Contents et Actions.",
  },
  ado: {
    name: "Azure DevOps",
    mark: "AD",
    summary:
      "Work items, pull requests, builds et accès aux logs des pipelines.",
    placeholder: "https://dev.azure.com/organisation/projet",
    docs: "https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate",
    access:
      "Configurez BEAM_ADO_TOKEN sur le serveur avec Work Items, Code et Build en lecture.",
  },
  notion: {
    name: "Notion",
    mark: "N",
    summary:
      "Page de référence, sous-pages directes et extraits de documentation.",
    placeholder: "https://www.notion.so/votre-page-identifiant",
    docs: "https://developers.notion.com/docs/create-a-notion-integration",
    access:
      "Configurez BEAM_NOTION_TOKEN sur le serveur et partagez la page avec cette intégration. Seule cette page et ses sous-pages sont consultées.",
  },
  confluence: {
    name: "Confluence",
    mark: "C",
    summary: "Pages, versions et extraits de votre espace Confluence Cloud.",
    placeholder: "https://votre-equipe.atlassian.net/wiki",
    docs: "https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/",
    access:
      "Configurez BEAM_CONFLUENCE_EMAIL et BEAM_CONFLUENCE_TOKEN sur le serveur. Utilisez un compte ayant accès à l’espace en lecture.",
  },
};
const kinds = {
  ticket: { label: "Ticket", icon: Ticket },
  pr: { label: "Pull request", icon: GitPullRequest },
  release: { label: "Version", icon: Package },
  commit: { label: "Commit", icon: GitCommitHorizontal },
  build: { label: "Pipeline", icon: Activity },
  document: { label: "Document", icon: FileText },
};
export function SignalLinks({ signals, item, api, onSignals }) {
  const [automaticNoteCount, setAutomaticNoteCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [sources, setSources] = useState([]);
  const [source, setSource] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    api("admin/sources")
      .then((rows) => {
        if (active) setSources(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [expanded]);
  const linked = signals.filter((s) => s.links.includes(item.id));
  const available = signals.filter(
    (s) =>
      !s.links.includes(item.id) &&
      (kind === "all" || s.kind === kind) &&
      (source === "all" || s.source_id === source) &&
      `${s.title} ${s.external_id} ${s.source_label} ${s.state} ${s.extra?.version || ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase().trim()),
  );
  async function change(signal, remove = false) {
    setBusy(true);
    setError("");
    try {
      await api("admin/signals/" + signal.id + "/link", {
        method: "POST",
        body: JSON.stringify({ item_id: item.id, remove }),
      });
      onSignals(await api("admin/signals"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError("");
    try {
      const targets = sources.filter(
        (s) =>
          s.enabled && s.configured && (source === "all" || source === s.id),
      );
      const failures = [];
      for (const s of targets) {
        try {
          await api("admin/sources/" + s.id + "/sync", {
            method: "POST",
            body: "{}",
          });
        } catch (e) {
          failures.push(s.label + " : " + e.message);
        }
      }
      onSignals(await api("admin/signals"));
      setSources(await api("admin/sources"));
      if (failures.length) setError(failures.join(" · "));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="linked-signals feature-sources"
      aria-label="Sources associées"
    >
      <div className="feature-source-head">
        <h3>
          Sources <span>{linked.length + automaticNoteCount}</span>
        </h3>
        <button
          type="button"
          className="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Plus size={14} />
          {expanded ? "Fermer" : "Ajouter un lien"}
        </button>
      </div>
      {expanded && (
        <p className="feature-source-help">
          Tickets, PR et documents · Liens internes à votre espace.
        </p>
      )}
      {error && (
        <p role="alert" className="source-error">
          {error}
        </p>
      )}
      <AutoSources
        item={item}
        api={api}
        onSignals={onSignals}
        onNoteCount={setAutomaticNoteCount}
      />
      {linked.map((s) => (
        <div className="feature-source-linked" key={s.id}>
          <a href={s.url} target="_blank" rel="noreferrer">
            <span>
              {kinds[s.kind]?.label} · {s.source_label} · {s.state}
              {s.automatic_links?.some(
                (m) =>
                  m.item_id === item.id &&
                  !m.locked &&
                  m.confidence === "clear",
              )
                ? " · Lié par l’IA"
                : ""}
            </span>
            <strong>{s.title}</strong>
            <ArrowUpRight size={13} />
          </a>
          {s.automatic_links?.find((m) => m.item_id === item.id && !m.locked)
            ?.reason && (
            <p className="automatic-link-reason">
              {
                s.automatic_links.find(
                  (m) => m.item_id === item.id && !m.locked,
                ).reason
              }
            </p>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label={"Dissocier " + s.title}
            disabled={busy}
            onClick={() => change(s, true)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {!linked.length && !automaticNoteCount && !expanded && (
        <p className="feature-source-help">
          Les nouvelles sources seront rapprochées automatiquement.
        </p>
      )}
      {expanded && (
        <div className="feature-source-picker">
          <label className="feature-source-search">
            <Search size={15} />
            <input
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-label="Rechercher une information à associer"
              placeholder="Titre, numéro de ticket, version…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="feature-source-filters">
            <select
              aria-label="Source à associer"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">Toutes les sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Type à associer"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">Tous les types</option>
              {Object.entries(kinds).map(([id, k]) => (
                <option key={id} value={id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              disabled={
                busy ||
                !sources.some(
                  (s) =>
                    s.enabled &&
                    s.configured &&
                    (source === "all" || source === s.id),
                )
              }
              onClick={sync}
            >
              <RefreshCw size={14} className={busy ? "spinning" : ""} />
              {busy ? "Lecture…" : "Synchroniser"}
            </button>
          </div>
          <div className="feature-source-results" aria-busy={busy}>
            {available.map((s) => {
              const Icon = kinds[s.kind]?.icon || FileText;
              return (
                <button
                  type="button"
                  className="feature-source-result"
                  key={s.id}
                  disabled={busy}
                  onClick={() => change(s)}
                >
                  <Icon size={17} />
                  <span>
                    <small>
                      {s.source_label} · {kinds[s.kind]?.label}
                      {["ticket", "pr"].includes(s.kind)
                        ? " #" + s.external_id
                        : ""}{" "}
                      · {s.state}
                    </small>
                    <strong>{s.title}</strong>
                  </span>
                  <Link2 size={15} />
                </button>
              );
            })}
            {!available.length && (
              <p className="feature-source-help">
                {signals.length
                  ? "Aucune information à associer avec ces filtres."
                  : "Synchronisez une source pour retrouver ses informations ici."}
              </p>
            )}
          </div>
          {!sources.length && (
            <a href="#integrations">
              Configurer une source dans les intégrations
            </a>
          )}
          <p className="feature-source-help">
            Les associations sont enregistrées immédiatement, indépendamment des
            modifications de la feature.
          </p>
        </div>
      )}
    </section>
  );
}
export default function Integrations({
  api,
  items,
  product,
  onProduct,
  onRefresh,
  onError,
  onSignals,
}) {
  const [sources, setSources] = useState([]),
    [signals, setSignals] = useState([]),
    [runs, setRuns] = useState([]),
    [tab, setTab] = useState("sources"),
    [config, setConfig] = useState(null),
    [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [linkItem, setLinkItem] = useState(""),
    [name, setName] = useState(product.name),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      const [ss, sg, rs] = await Promise.all([
        api("admin/sources"),
        api("admin/signals"),
        api("admin/sync-runs"),
      ]);
      setSources(ss);
      setSignals(sg);
      setRuns(rs);
      onSignals(sg);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (tab !== "inbox") return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const next = await api("admin/signals");
        if (!alive) return;
        setSignals(next);
        onSignals(next);
        setSelected((current) =>
          current ? next.find((s) => s.id === current.id) || current : null,
        );
      } catch {}
    }, 8000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tab]);
  useEffect(() => {
    if (!config && !selected) return;
    const previous = document.activeElement,
      root = document.querySelector(".integration-panel"),
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const els = () =>
      [...root.querySelectorAll("button,input,select,a[href]")].filter(
        (e) => !e.disabled,
      );
    els()[0]?.focus();
    const handle = (e) => {
      if (e.key === "Escape") {
        setConfig(null);
        setSelected(null);
      }
      if (e.key === "Tab") {
        const all = els(),
          first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, [Boolean(config), Boolean(selected)]);
  async function action(key, fn) {
    setBusy(key);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
      onError(e.message);
    } finally {
      setBusy("");
    }
  }
  const filtered = signals.filter(
    (s) =>
      (kind === "all" || s.kind === kind) &&
      (!query ||
        (s.title + " " + s.body + " " + s.source_label)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  return (
    <section className="integrations">
      <div className="integration-product">
        <span className="product-symbol">{product.name[0]}</span>
        <div>
          <strong>Produit suivi</strong>
          <p>Les sources de ce produit alimentent votre espace de pilotage.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            action("product", async () =>
              onProduct(
                await api("admin/product", {
                  method: "PATCH",
                  body: JSON.stringify({ name }),
                }),
              ),
            );
          }}
        >
          <input
            aria-label="Nom du produit"
            value={name}
            maxLength={80}
            required
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button" disabled={!!busy}>
            Enregistrer
          </button>
        </form>
      </div>
      <div className="integration-tabs">
        {[
          ["sources", "Connexions"],
          ["inbox", "Informations reçues"],
          ["history", "Historique"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "inbox" && <span>{signals.length}</span>}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="integration-error">
          {error}
        </div>
      )}
      {loading ? (
        <p>Chargement des connexions…</p>
      ) : tab === "sources" ? (
        <>
          <div className="integration-grid">
            {Object.entries(providers).map(([id, p]) => (
              <article className="integration-card" key={id}>
                <div className="integration-card-head">
                  <span className={"provider-mark " + id}>
                    {id === "github" ? <Github size={23} /> : p.mark}
                  </span>
                  <span className="integration-state">
                    {sources.some((s) => s.provider === id)
                      ? "Configuré"
                      : "À connecter"}
                  </span>
                </div>
                <h3>{p.name}</h3>
                <p>{p.summary}</p>
                <button
                  className="button"
                  onClick={() =>
                    setConfig({
                      provider: id,
                      url: "",
                      label: p.name,
                      scope: "",
                    })
                  }
                >
                  <Plus size={14} />
                  Ajouter une source
                </button>
              </article>
            ))}
          </div>
          <div className="source-list">
            <h2>
              Sources du produit <span>{sources.length}</span>
            </h2>
            {sources.length ? (
              sources.map((s) => (
                <article key={s.id}>
                  <span className={"provider-mark " + s.provider}>
                    {providers[s.provider].mark}
                  </span>
                  <div>
                    <strong>{s.label}</strong>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.url}
                      <ArrowUpRight size={12} />
                    </a>
                    <small>
                      {s.last_sync
                        ? `${s.count} informations · Dernière lecture ${new Date(s.last_sync).toLocaleString("fr-FR")}`
                        : s.configured
                          ? "Prêt pour la première lecture"
                          : "Accès serveur à configurer"}
                      {!s.enabled ? " · En pause" : ""}
                      {s.truncated ? " · Import partiel" : ""}
                    </small>
                    {s.last_error && (
                      <small className="source-error">{s.last_error}</small>
                    )}
                  </div>
                  <button
                    className="button"
                    disabled={!!busy || !s.configured || !s.enabled}
                    onClick={() =>
                      action(s.id, () =>
                        api("admin/sources/" + s.id + "/sync", {
                          method: "POST",
                          body: "{}",
                        }),
                      )
                    }
                  >
                    <RefreshCw
                      size={14}
                      className={busy === s.id ? "spinning" : ""}
                    />
                    {busy === s.id ? "Lecture…" : "Synchroniser"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      action("enable", () =>
                        api("admin/sources/" + s.id, {
                          method: "PATCH",
                          body: JSON.stringify({ enabled: !s.enabled }),
                        }),
                      )
                    }
                  >
                    {s.enabled ? "Mettre en pause" : "Réactiver"}
                  </button>
                </article>
              ))
            ) : (
              <div className="integration-empty">
                <Plug size={22} />
                <strong>Connectez les outils de votre produit</strong>
                <p>
                  Ajoutez les liens maintenant ou plus tard. Les informations
                  importées restent internes jusqu’à votre décision de
                  publication.
                </p>
              </div>
            )}
          </div>
          <p className="integration-note">
            Lecture à la demande. Aucun changement de statut ou de date n’est
            appliqué automatiquement au Gantt. Les logs complets restent
            consultables dans l’outil source.
          </p>
        </>
      ) : tab === "inbox" ? (
        <>
          <AIProgress scope="associations" showLabel />
          <div className="signal-filters">
            <label>
              <Search size={15} />
              <input
                aria-label="Rechercher dans les sources"
                placeholder="Rechercher un ticket, une version, un document…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Type d’information"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">Tous les types</option>
              {Object.entries(kinds).map(([id, k]) => (
                <option key={id} value={id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="signals-list">
            {filtered.length ? (
              filtered.map((s) => {
                const Icon = kinds[s.kind]?.icon || FileText;
                return (
                  <button
                    className="signal-row"
                    key={s.id}
                    onClick={() => {
                      setSelected(s);
                      setLinkItem("");
                    }}
                  >
                    <Icon size={18} />
                    <div>
                      <small>
                        {s.source_label} · {kinds[s.kind]?.label}
                        {["ticket", "pr"].includes(s.kind)
                          ? " #" + s.external_id
                          : ""}
                        {s.extra.workflow ? " · " + s.extra.workflow : ""}
                        {s.extra.work_type ? " · " + s.extra.work_type : ""}
                      </small>
                      <strong>{s.title}</strong>
                    </div>
                    <span className="signal-state">{s.state}</span>
                    {s.links.length > 0 && (
                      <span className="signal-linked">
                        <Link2 size={12} />
                        {s.links.length}
                      </span>
                    )}
                    <AIProgress sourceId={"signal:" + s.id} size={18} />
                    <ArrowUpRight size={14} />
                  </button>
                );
              })
            ) : (
              <div className="integration-empty">
                <Activity size={22} />
                <strong>
                  {signals.length
                    ? "Aucun résultat"
                    : "Aucune information reçue"}
                </strong>
                <p>
                  Synchronisez une source pour retrouver ses tickets, versions
                  et documents ici.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="sync-history">
          {runs.length ? (
            runs.map((r) => (
              <article key={r.id}>
                <span
                  className={
                    r.status === "success" ? "sync-ok" : "source-error"
                  }
                >
                  {r.status === "success" ? (
                    <Check size={17} />
                  ) : (
                    <Activity size={17} />
                  )}
                </span>
                <div>
                  <strong>{r.label}</strong>
                  <small>
                    {new Date(r.started).toLocaleString("fr-FR")} ·{" "}
                    {r.status === "success"
                      ? `${r.count} informations lues`
                      : r.status === "running"
                        ? "Lecture en cours"
                        : "Échec"}
                  </small>
                  {r.message && <p>{r.message}</p>}
                </div>
              </article>
            ))
          ) : (
            <div className="integration-empty">
              <RefreshCw size={22} />
              <strong>Aucune synchronisation effectuée</strong>
              <p>Chaque lecture sera enregistrée ici avec son résultat.</p>
            </div>
          )}
        </div>
      )}
      {config && (
        <div
          className="modal-backdrop panel-backdrop"
          onClick={() => setConfig(null)}
        >
          <div
            className="modal side-panel integration-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="connection-title">
                Connecter {providers[config.provider].name}
              </h2>
              <button
                className="icon-button"
                aria-label="Fermer la connexion"
                onClick={() => setConfig(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action("config", async () => {
                  await api("admin/sources", {
                    method: "POST",
                    body: JSON.stringify(config),
                  });
                  setConfig(null);
                });
              }}
            >
              <label>
                Nom de la source
                <input
                  required
                  value={config.label}
                  maxLength={80}
                  onChange={(e) =>
                    setConfig({ ...config, label: e.target.value })
                  }
                />
              </label>
              <label>
                Adresse de la source
                <input
                  required
                  type="url"
                  placeholder={providers[config.provider].placeholder}
                  value={config.url}
                  onChange={(e) =>
                    setConfig({ ...config, url: e.target.value })
                  }
                />
              </label>
              {config.provider === "confluence" && (
                <label>
                  Identifiant de l’espace
                  <input
                    required
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={config.scope}
                    onChange={(e) =>
                      setConfig({ ...config, scope: e.target.value })
                    }
                  />
                </label>
              )}
              <div className="connection-help">
                <LockNote />
                <p>{providers[config.provider].access}</p>
                <a
                  href={providers[config.provider].docs}
                  target="_blank"
                  rel="noreferrer"
                >
                  Guide de connexion
                  <ArrowUpRight size={13} />
                </a>
              </div>
              {error && (
                <p role="alert" className="source-error">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => setConfig(null)}
                >
                  Annuler
                </button>
                <button className="button primary" disabled={!!busy}>
                  Enregistrer la source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {selected && (
        <div
          className="modal-backdrop panel-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            className="modal side-panel integration-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="signal-title">Information source</h2>
              <button
                className="icon-button"
                aria-label="Fermer l’information"
                onClick={() => setSelected(null)}
              >
                <X size={18} />
              </button>
            </div>
            <small>
              {selected.source_label} · {kinds[selected.kind]?.label} ·{" "}
              {selected.state}
            </small>
            <h2>{selected.title}</h2>
            <a
              className="button"
              href={selected.url}
              target="_blank"
              rel="noreferrer"
            >
              Ouvrir dans {providers[selected.provider].name}
              <ArrowUpRight size={14} />
            </a>
            {selected.extra.logs_url && (
              <a
                className="text-button"
                href={selected.extra.logs_url}
                target="_blank"
                rel="noreferrer"
              >
                Voir l’exécution et ses logs
                <ArrowUpRight size={14} />
              </a>
            )}
            <p className="signal-body">
              {selected.body || "Aucun extrait disponible."}
            </p>
            <h3>Liens vers la roadmap</h3>
            <p className="feature-source-help">
              L’IA repère les éléments concernés. Les liens incertains attendent
              votre confirmation.
            </p>
            {(selected.automatic_links || [])
              .filter((m) => m.confidence === "review")
              .map((m) => (
                <div className="auto-source-candidate" key={m.item_id}>
                  <strong>
                    {items.find((i) => i.id === m.item_id)?.title} · À vérifier
                  </strong>
                  <p className="feature-source-help">{m.reason}</p>
                  <div>
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={() =>
                        action("confirm-match", async () => {
                          await api("admin/associations/decide", {
                            method: "POST",
                            body: JSON.stringify({
                              source: "signal:" + selected.id,
                              item_id: m.item_id,
                              accept: true,
                            }),
                          });
                          setSelected(
                            (await api("admin/signals")).find(
                              (s) => s.id === selected.id,
                            ),
                          );
                        })
                      }
                    >
                      Confirmer
                    </button>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        action("reject-match", async () => {
                          await api("admin/associations/decide", {
                            method: "POST",
                            body: JSON.stringify({
                              source: "signal:" + selected.id,
                              item_id: m.item_id,
                              accept: false,
                            }),
                          });
                          setSelected(
                            (await api("admin/signals")).find(
                              (s) => s.id === selected.id,
                            ),
                          );
                        })
                      }
                    >
                      Écarter
                    </button>
                  </div>
                </div>
              ))}
            <div className="signal-existing">
              {selected.links.map((id) => (
                <span key={id}>
                  <span
                    title={
                      selected.automatic_links?.find((m) => m.item_id === id)
                        ?.reason
                    }
                  >
                    {items.find((i) => i.id === id)?.title}
                    {selected.automatic_links?.some(
                      (m) =>
                        m.item_id === id &&
                        !m.locked &&
                        m.confidence === "clear",
                    )
                      ? " · IA"
                      : ""}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Détacher la source"
                    disabled={!!busy}
                    onClick={() =>
                      action("unlink", async () => {
                        await api("admin/signals/" + selected.id + "/link", {
                          method: "POST",
                          body: JSON.stringify({ item_id: id, remove: true }),
                        });
                        setSelected({
                          ...selected,
                          links: selected.links.filter((x) => x !== id),
                        });
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <label>
              Élément existant
              <select
                value={linkItem}
                onChange={(e) => setLinkItem(e.target.value)}
              >
                <option value="">Choisir un élément</option>
                {items
                  .filter((i) => !selected.links.includes(i.id))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button"
              disabled={!linkItem || !!busy}
              onClick={() =>
                action("link", async () => {
                  await api("admin/signals/" + selected.id + "/link", {
                    method: "POST",
                    body: JSON.stringify({ item_id: linkItem }),
                  });
                  setSelected({
                    ...selected,
                    links: [...selected.links, linkItem],
                  });
                  setLinkItem("");
                })
              }
            >
              <Link2 size={14} />
              Associer à l’élément
            </button>
            <div className="connection-help">
              <p>
                Créer une feature à partir de cette information l’ajoute en
                interne. Vous gardez la main sur son statut, ses dates et sa
                publication.
              </p>
              <button
                className="button primary"
                disabled={!!busy || selected.links.length > 0}
                onClick={() =>
                  action("promote", async () => {
                    await api("admin/signals/" + selected.id + "/promote", {
                      method: "POST",
                      body: "{}",
                    });
                    await onRefresh();
                    setSelected(null);
                  })
                }
              >
                <Plus size={14} />
                Créer une feature interne
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
function LockNote() {
  return <strong>Accès conservé sur le serveur</strong>;
}
