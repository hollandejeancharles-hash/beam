import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  Check,
  CheckCheck,
  Clock3,
  Circle,
  LayoutGrid,
  List,
  Map,
  MessageSquare,
  Radio,
  Globe,
  Lock,
  SlidersHorizontal,
  X,
  Copy,
  ExternalLink,
  ArrowUp,
  Trash2,
  LogOut,
} from "lucide-react";
import "./style.css";
const pagesMode = __PAGES__;
const publicPath = pagesMode ? import.meta.env.BASE_URL : "/roadmap";
const ST = {
  planned: { label: "À venir", subtitle: "La suite prend forme", icon: Circle },
  progress: {
    label: "En cours",
    subtitle: "On y travaille, pour vous",
    icon: Clock3,
  },
  done: { label: "Livré", subtitle: "À vous de jouer", icon: CheckCheck },
};
const PR = { high: "Haute", medium: "Normale", low: "Basse" };
const CAT = [
  "Éditeur",
  "Contenu",
  "Performance",
  "Collaboration",
  "Intégrations",
];
const blank = {
  title: "",
  description: "",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "public",
  quarter: "T1 2027",
};
function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 9h10l20 11-20 11H5l20-11z" fill="currentColor" />
    </svg>
  );
}
function App() {
  const publicMode = pagesMode || location.pathname === "/roadmap";
  const [items, setItems] = useState([]),
    [page, setPage] = useState("roadmap"),
    [view, setView] = useState("board"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [priority, setPriority] = useState("all"),
    [filter, setFilter] = useState(false),
    [selected, setSelected] = useState(null),
    [edit, setEdit] = useState(null),
    [share, setShare] = useState(false),
    [suggest, setSuggest] = useState(false),
    [suggestions, setSuggestions] = useState([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [auth, setAuth] = useState(false),
    [key, setKey] = useState(sessionStorage.getItem("beam_key") || ""),
    [sort, setSort] = useState("priority");
  async function api(path, options = {}) {
    const response = await fetch("/api/" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) setAuth(true);
      throw Error(data.error || "Une erreur est survenue");
    }
    return data;
  }
  async function refresh() {
    try {
      setError("");
      if (pagesMode) {
        const response = await fetch(import.meta.env.BASE_URL + "roadmap.json");
        if (!response.ok)
          throw Error("La roadmap est temporairement indisponible.");
        setItems(await response.json());
      } else {
        setItems(await api((publicMode ? "public" : "admin") + "/items"));
      }
      if (!publicMode) setSuggestions(await api("admin/suggestions"));
      setAuth(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const handle = (e) => {
      if (e.key === "Escape") {
        setSelected(null);
        setEdit(null);
        setShare(false);
        setSuggest(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("#search")?.focus();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("admin/items" + (edit.id ? "/" + edit.id : ""), {
        method: edit.id ? "PATCH" : "POST",
        body: JSON.stringify(edit),
      });
      setEdit(null);
      setSelected(null);
      await refresh();
      setToast("Évolution enregistrée");
    } catch (e) {
      setToast(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function vote(item) {
    try {
      await api(`public/items/${item.id}/vote`, { method: "POST" });
      await refresh();
    } catch (e) {
      setToast(e.message);
    }
  }
  async function move(item, status) {
    if (item.status === status) return;
    try {
      await api("admin/items/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refresh();
      setToast("Évolution déplacée dans « " + ST[status].label + " »");
    } catch (e) {
      setToast(e.message);
    }
  }
  const filtered = items
    .filter(
      (i) =>
        (!query ||
          (i.title + " " + i.description)
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (category === "all" || i.category === category) &&
        (priority === "all" || i.priority === priority) &&
        (page !== "changelog" || i.status === "done"),
    )
    .sort((a, b) =>
      sort === "votes"
        ? b.votes - a.votes
        : { high: 0, medium: 1, low: 2 }[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority],
    );
  const counts = {
    planned: items.filter((i) => i.status === "planned").length,
    progress: items.filter((i) => i.status === "progress").length,
    done: items.filter((i) => i.status === "done").length,
  };
  return (
    <div className={"app " + (publicMode ? "public" : "")}>
      {!publicMode && (
        <aside className="sidebar">
          <a className="brand" href="/">
            <span className="brand-mark">
              <Mark />
            </span>
            beam<span className="brand-dot">.</span>
          </a>
          <div className="workspace">
            <span className="puls-logo">P</span>
            <div>
              <strong>PULS</strong>
              <small>Product workspace</small>
            </div>
          </div>
          <div className="nav-caption">ESPACE PRODUIT</div>
          <nav>
            <button
              className={page === "roadmap" ? "active" : ""}
              onClick={() => setPage("roadmap")}
            >
              <Map size={17} />
              Roadmap<span className="nav-count">{items.length}</span>
            </button>
            <button
              className={page === "feedback" ? "active" : ""}
              onClick={() => setPage("feedback")}
            >
              <MessageSquare size={17} />
              Suggestions
              {suggestions.length > 0 && (
                <span className="nav-count">{suggestions.length}</span>
              )}
            </button>
            <button
              className={page === "changelog" ? "active" : ""}
              onClick={() => setPage("changelog")}
            >
              <Radio size={17} />
              Nouveautés
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="portal-card">
              <span className="portal-symbol">
                <Globe size={19} />
                <span />
              </span>
              <strong>La suite s’écrit ensemble.</strong>
              <p>
                Partagez votre vision avec
                <br />
                la communauté PULS.
              </p>
              <a href={publicPath} target="_blank" rel="noreferrer">
                Ouvrir le portail <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="profile">
              <span className="avatar">JC</span>
              <div>
                <strong>Équipe PULS</strong>
                <small>Espace administrateur</small>
              </div>
              {key && (
                <button
                  className="icon-button"
                  aria-label="Déconnexion"
                  onClick={() => {
                    sessionStorage.removeItem("beam_key");
                    setKey("");
                    setAuth(true);
                  }}
                >
                  <LogOut size={15} />
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
      <main>
        <header className="topbar">
          {publicMode ? (
            <a className="public-brand" href={publicPath}>
              <span className="puls-logo">P</span>PULS <span>/</span> Roadmap
            </a>
          ) : (
            <div className="breadcrumbs">
              Espace produit <ChevronRight size={13} />{" "}
              <span>
                {page === "roadmap"
                  ? "Roadmap"
                  : page === "feedback"
                    ? "Suggestions"
                    : "Nouveautés"}
              </span>
            </div>
          )}
          <div className="top-actions">
            <span className="live">
              <i />
              {pagesMode
                ? "Roadmap publique"
                : publicMode
                  ? "En direct de l’équipe"
                  : "Tout est synchronisé"}
            </span>
            {publicMode ? (
              <span className="powered">
                powered by <b>beam.</b>
              </span>
            ) : (
              <button className="button" onClick={() => setShare(true)}>
                <Globe size={15} />
                Partager la roadmap
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                {publicMode
                  ? "CONSTRUISONS LA SUITE, ENSEMBLE"
                  : "LE CAP EST DONNÉ"}
              </div>
              <h1>
                {page === "feedback"
                  ? "Vos idées. Notre prochaine étape."
                  : page === "changelog"
                    ? "Du nouveau dans PULS."
                    : publicMode
                      ? "La suite de PULS."
                      : "Une vision. Du mouvement."}
              </h1>
              <p>
                {page === "feedback"
                  ? "Les retours de votre communauté, réunis au même endroit."
                  : page === "changelog"
                    ? "Chaque amélioration, une nouvelle possibilité."
                    : publicMode
                      ? pagesMode
                        ? "Découvrez les priorités et les prochaines évolutions de PULS."
                        : "Découvrez ce qui arrive. Faites entendre ce qui compte pour vous."
                      : "Les idées deviennent des avancées. Dessinez la suite de PULS."}
              </p>
            </div>
            {!pagesMode && (
              <button
                className="button primary"
                onClick={() =>
                  publicMode ? setSuggest(true) : setEdit({ ...blank })
                }
              >
                <Plus size={17} />
                {publicMode ? "Proposer une idée" : "Nouvelle évolution"}
              </button>
            )}
          </section>
          {page === "roadmap" && (
            <section className="overview">
              <div className="overview-intro">
                <span className="mini-label">NOTRE HORIZON</span>
                <strong>
                  Un CMS qui vous <br />
                  laisse créer<span>.</span>
                </strong>
                <span className="overview-note">
                  Moins de friction. Plus de possibilités.
                </span>
                <div className="beam-art">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="metrics">
                {Object.entries(ST).map(([s, info]) => (
                  <button
                    key={s}
                    className={"metric " + s}
                    onClick={() =>
                      document.getElementById("column-" + s)?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                        inline: "center",
                      })
                    }
                  >
                    <span className="metric-label">
                      <info.icon size={15} />
                      {info.label}
                    </span>
                    <strong>{String(counts[s]).padStart(2, "0")}</strong>
                    <small>
                      {s === "planned"
                        ? "idées à concrétiser"
                        : s === "progress"
                          ? "évolutions en mouvement"
                          : "améliorations disponibles"}
                      <ArrowUpRight size={14} />
                    </small>
                    <div className="metric-line">
                      <i
                        style={{
                          width:
                            Math.max(
                              8,
                              (counts[s] / Math.max(items.length, 1)) * 100,
                            ) + "%",
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {page !== "feedback" && (
            <>
              <div className="section-title">
                <div>
                  <h2>
                    {page === "changelog"
                      ? "Dernières améliorations"
                      : "Roadmap produit"}
                  </h2>
                  <span className="pill">{publicMode ? "Public" : "PULS"}</span>
                </div>
                <span className="subtle">
                  {publicMode
                    ? pagesMode
                      ? "Les priorités de PULS, en toute transparence."
                      : "Votre voix compte. Votez pour vos priorités."
                    : "Une direction claire, à chaque étape."}
                </span>
              </div>
              <div className="toolbar">
                <div className="toolbar-left">
                  <label className="search">
                    <Search size={16} />
                    <input
                      id="search"
                      aria-label="Rechercher une évolution"
                      placeholder="Rechercher une évolution…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                  <button
                    className={
                      "button filter-button " + (filter ? "selected" : "")
                    }
                    onClick={() => setFilter(!filter)}
                  >
                    <SlidersHorizontal size={15} />
                    Filtres
                    {(priority !== "all" || category !== "all") && (
                      <span className="filter-dot" />
                    )}
                  </button>
                </div>
                <div className="toolbar-right">
                  <select
                    aria-label="Trier les évolutions"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="priority">Par priorité</option>
                    {!pagesMode && (
                      <option value="votes">Par popularité</option>
                    )}
                  </select>
                  <div className="view-toggle">
                    <button
                      aria-label="Vue tableau"
                      aria-pressed={view === "board"}
                      className={view === "board" ? "chosen" : ""}
                      onClick={() => setView("board")}
                    >
                      <LayoutGrid size={15} />
                    </button>
                    <button
                      aria-label="Vue liste"
                      aria-pressed={view === "list"}
                      className={view === "list" ? "chosen" : ""}
                      onClick={() => setView("list")}
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
              </div>
              {filter && (
                <div className="filters">
                  <label>
                    Catégorie
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="all">Toutes les catégories</option>
                      {CAT.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priorité
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">Toutes les priorités</option>
                      {Object.entries(PR).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setCategory("all");
                      setPriority("all");
                      setQuery("");
                    }}
                  >
                    Réinitialiser
                  </button>
                </div>
              )}
            </>
          )}
          {loading ? (
            <div className="empty">Chargement de votre roadmap…</div>
          ) : error && !auth ? (
            <div className="empty">
              {error}
              <button className="button" onClick={refresh}>
                Réessayer
              </button>
            </div>
          ) : page === "feedback" ? (
            <div className="suggestion-list">
              {suggestions.length ? (
                suggestions.map((s) => (
                  <article key={s.id}>
                    <span className="suggestion-icon">
                      <MessageSquare size={20} />
                    </span>
                    <div>
                      <small>
                        Idée de la communauté ·{" "}
                        {new Date(s.created).toLocaleDateString("fr-FR")}
                      </small>
                      <h3>{s.title}</h3>
                      <p>{s.description}</p>
                    </div>
                    <button
                      className="button"
                      onClick={() =>
                        setEdit({
                          ...blank,
                          title: s.title,
                          description: s.description,
                        })
                      }
                    >
                      Ajouter à la roadmap
                      <ArrowRight size={15} />
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <MessageSquare size={28} />
                  <h3>La conversation commence ici.</h3>
                  <p>
                    Les idées envoyées depuis le portail public apparaîtront
                    dans cet espace.
                  </p>
                  <button className="button" onClick={() => setShare(true)}>
                    Partager le portail
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={"board " + (view === "list" ? "list-view" : "")}>
              {Object.entries(ST)
                .filter(([s]) => page !== "changelog" || s === "done")
                .map(([status, info]) => (
                  <section
                    id={"column-" + status}
                    key={status}
                    className={"column " + status}
                    onDragOver={(e) => {
                      if (!publicMode) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const item = items.find(
                        (i) => i.id === e.dataTransfer.getData("text/plain"),
                      );
                      if (item && !publicMode) move(item, status);
                    }}
                  >
                    <div className="column-header">
                      <div>
                        <span className="status-icon">
                          <info.icon size={16} />
                        </span>
                        <h3>{info.label}</h3>
                        <span className="count">
                          {filtered.filter((i) => i.status === status).length}
                        </span>
                      </div>
                      {!publicMode && (
                        <button
                          className="icon-button"
                          aria-label={"Ajouter dans " + info.label}
                          onClick={() => setEdit({ ...blank, status })}
                        >
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                    <p className="column-subtitle">{info.subtitle}</p>
                    <div className="cards">
                      {filtered
                        .filter((i) => i.status === status)
                        .map((item) => (
                          <article
                            key={item.id}
                            className="card"
                            draggable={!publicMode}
                            onDragStart={(e) =>
                              e.dataTransfer.setData("text/plain", item.id)
                            }
                          >
                            <button
                              className="card-main"
                              onClick={() => setSelected(item)}
                            >
                              <div className="card-top">
                                <span
                                  className={
                                    "tag cat-" + CAT.indexOf(item.category)
                                  }
                                >
                                  {item.category}
                                </span>
                                <span
                                  className={"priority " + item.priority}
                                  title={"Priorité " + PR[item.priority]}
                                >
                                  <span className="bars">
                                    <i />
                                    <i />
                                    <i />
                                  </span>
                                  {item.priority === "high"
                                    ? "Haute priorité"
                                    : PR[item.priority]}
                                </span>
                              </div>
                              <h3>{item.title}</h3>
                              <p>{item.description}</p>
                            </button>
                            <div className="card-footer">
                              {!pagesMode && (
                                <button
                                  className={
                                    "vote " + (item.voted ? "voted" : "")
                                  }
                                  aria-label={
                                    (item.voted
                                      ? "Retirer mon vote pour "
                                      : "Voter pour ") + item.title
                                  }
                                  onClick={() => vote(item)}
                                  disabled={item.visibility === "private"}
                                >
                                  <ArrowUp size={13} />
                                  {item.votes}
                                </button>
                              )}
                              <span className="quarter">
                                {item.visibility === "private" ? (
                                  <Lock size={12} />
                                ) : status === "done" ? (
                                  <Check size={12} />
                                ) : (
                                  <span className="quarter-dot" />
                                )}
                                {status === "done"
                                  ? "Disponible"
                                  : item.quarter}
                              </span>
                              <span className="card-arrow">
                                <ArrowUpRight size={14} />
                              </span>
                            </div>
                          </article>
                        ))}
                    </div>
                    {!filtered.some((i) => i.status === status) && (
                      <div className="column-empty">
                        Aucune évolution ici pour le moment.
                      </div>
                    )}
                    {!publicMode && (
                      <button
                        className="add-card"
                        onClick={() => setEdit({ ...blank, status })}
                      >
                        <Plus size={15} />
                        Ajouter une évolution
                      </button>
                    )}
                  </section>
                ))}
            </div>
          )}
          <footer>
            <span>
              <span className="footer-mark">
                <Mark />
              </span>
              Les bonnes idées méritent une direction.
            </span>
            <span>
              Fait pour avancer. <b>beam.</b>
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div role="status" className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {selected && (
        <Modal title="L’évolution en détail" close={() => setSelected(null)}>
          <div className="detail-meta">
            <span className="tag">{selected.category}</span>
            <span className="pill">{ST[selected.status].label}</span>
          </div>
          <h2 className="detail-title">{selected.title}</h2>
          <p className="detail-description">
            {selected.description || "Aucune description pour le moment."}
          </p>
          <div className="detail-grid">
            <span>
              Priorité<strong>{PR[selected.priority]}</strong>
            </span>
            <span>
              Horizon<strong>{selected.quarter}</strong>
            </span>
            <span>
              Visibilité
              <strong>
                {selected.visibility === "public" ? "Publique" : "Interne"}
              </strong>
            </span>
          </div>
          {!pagesMode && (
            <div className="modal-actions">
              {!publicMode ? (
                <button
                  className="button primary"
                  onClick={() => {
                    setEdit({ ...selected });
                    setSelected(null);
                  }}
                >
                  Modifier l’évolution
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => {
                    vote(selected);
                    setSelected(null);
                  }}
                >
                  <ArrowUp size={16} />
                  {selected.voted
                    ? "Retirer mon vote"
                    : "Cette idée compte pour moi"}
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Modifier l’évolution" : "Une nouvelle direction"}
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <label>
              Titre
              <input
                autoFocus
                required
                maxLength={140}
                placeholder="Qu’allez-vous améliorer ?"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                rows={4}
                maxLength={5000}
                placeholder="Le problème à résoudre, et ce que cela change pour vos utilisateurs."
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </label>
            <div className="form-grid">
              {[
                [
                  "status",
                  "Statut",
                  Object.entries(ST).map(([k, v]) => [k, v.label]),
                ],
                ["priority", "Priorité", Object.entries(PR)],
                ["category", "Catégorie", CAT.map((c) => [c, c])],
                [
                  "quarter",
                  "Horizon",
                  ["T4 2026", "T1 2027", "T2 2027"].map((c) => [c, c]),
                ],
                [
                  "visibility",
                  "Visibilité",
                  [
                    ["public", "Publique"],
                    ["private", "Interne uniquement"],
                  ],
                ],
              ].map(([field, label, options]) => (
                <label key={field}>
                  {label}
                  <select
                    value={edit[field]}
                    onChange={(e) =>
                      setEdit({ ...edit, [field]: e.target.value })
                    }
                  >
                    {options.map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              {edit.id && (
                <button
                  type="button"
                  className="button danger"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Supprimer définitivement cette évolution et ses votes ?",
                      )
                    )
                      return;
                    try {
                      await api("admin/items/" + edit.id, { method: "DELETE" });
                      setEdit(null);
                      await refresh();
                      setToast("Évolution supprimée");
                    } catch (e) {
                      setToast(e.message);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                type="button"
                className="button"
                onClick={() => setEdit(null)}
              >
                Annuler
              </button>
              <button className="button primary" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
                <Check size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {share && (
        <Modal title="Une vision qui se partage." close={() => setShare(false)}>
          <div className="share-illustration">
            <Globe size={38} />
            <span>La suite de PULS.</span>
          </div>
          <p className="modal-copy">
            Un lien, toute votre roadmap. Vos utilisateurs découvrent les
            évolutions publiques, votent et proposent leurs idées.
          </p>
          <label>
            Lien du portail public
            <div className="copy-field">
              <input readOnly value={location.origin + publicPath} />
              <button
                className="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      location.origin + publicPath,
                    );
                    setToast("Lien copié");
                  } catch {
                    setToast("Sélectionnez le lien pour le copier");
                  }
                }}
              >
                <Copy size={16} />
                Copier
              </button>
            </div>
          </label>
          <p className="fine-print">
            <Lock size={12} />
            Les évolutions internes restent privées.
          </p>
          <a
            className="button primary share-open"
            href={publicPath}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir le portail
            <ExternalLink size={15} />
          </a>
        </Modal>
      )}
      {suggest && (
        <Modal
          title="Et si la prochaine idée venait de vous ?"
          close={() => setSuggest(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setSaving(true);
              try {
                await api("public/suggestions", {
                  method: "POST",
                  body: JSON.stringify(Object.fromEntries(data)),
                });
                setSuggest(false);
                setToast("Merci ! Votre idée a été transmise à l’équipe PULS.");
              } catch (e) {
                setToast(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <p className="modal-copy">
              Dites-nous ce qui rendrait PULS encore plus utile au quotidien.
            </p>
            <label>
              Votre idée
              <input
                name="title"
                required
                maxLength={140}
                placeholder="J’aimerais pouvoir…"
                autoFocus
              />
            </label>
            <label>
              Un peu de contexte
              <textarea
                name="description"
                maxLength={5000}
                rows={4}
                placeholder="Quel problème souhaitez-vous résoudre ?"
              />
            </label>
            <div className="modal-actions">
              <button className="button primary" disabled={saving}>
                {saving ? "Envoi…" : "Envoyer mon idée"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {auth && (
        <Modal title="Bienvenue dans Beam." close={null}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              sessionStorage.setItem("beam_key", key);
              await refresh();
            }}
          >
            <p className="modal-copy">
              Entrez votre clé d’administration pour piloter la roadmap.
            </p>
            <label>
              Clé d’accès
              <input
                type="password"
                required
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <a className="button" href={publicPath}>
                Voir la roadmap publique
              </a>
              <button className="button primary">
                Se connecter
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Modal({ title, close, children }) {
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.querySelector(".modal");
    const focusables = () =>
      [...root.querySelectorAll("button,input,textarea,select,a[href]")].filter(
        (el) => !el.disabled,
      );
    focusables()[0]?.focus();
    const handle = (e) => {
      if (e.key !== "Tab") return;
      const elements = focusables(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close?.();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          {close && (
            <button className="icon-button" aria-label="Fermer" onClick={close}>
              <X size={19} />
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
