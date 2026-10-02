import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Clock3, Circle, List, Trash2, LogOut } from "lucide-react";
import {
  Search,
  LayoutGrid,
  MessageSquare,
  Plus,
  Copy,
  SlidersHorizontal,
  Radio,
  Globe,
  Map,
  CheckCheck,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Planning,
  Close as X,
  ChevronRight,
  ArrowRight,
  Lock,
  ArrowUp,
  Integration,
  PanelClose,
  PanelOpen,
} from "./icons";
import { TreeNav } from "./components/ui/tree-nav";
import { BeamsBackground } from "./components/ui/beams-background";
import RoadmapSearch from "./components/RoadmapSearch";
import "./ui.css";
import Integrations, { SignalLinks } from "./components/Integrations";
import Notes, { QuickNote } from "./components/Notes";
import Gantt from "./components/Gantt";
import { TYPES, progressValue, hierarchyRows } from "../shared/planning";
import "./style.css";
const pagesMode = __PAGES__;
const publicPath = pagesMode ? import.meta.env.BASE_URL : "/roadmap";
const ST = {
  planned: {
    label: "À venir",
    subtitle: "Évolutions planifiées",
    icon: Circle,
  },
  progress: {
    label: "En cours",
    subtitle: "En développement",
    icon: Clock3,
  },
  done: { label: "Livré", subtitle: "Disponible dans PULS", icon: CheckCheck },
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
  type: "feature",
  parent_id: null,
  start_date: null,
  end_date: null,
  progress: 0,
  owner: "",
  dependency_id: null,
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
      <path d="M5 28 17 8h6L11 28zm10 4L29 8h6L21 32z" fill="currentColor" />
    </svg>
  );
}
function App() {
  const publicMode = pagesMode || location.pathname === "/roadmap";
  const [items, setItems] = useState([]),
    [page, setPage] = useState(
      (publicMode
        ? ["gantt", "kanban"]
        : ["gantt", "kanban", "feedback", "changelog", "integrations", "notes"]
      ).includes(location.hash.slice(1))
        ? location.hash.slice(1)
        : "gantt",
    ),
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
    [sort, setSort] = useState("priority"),
    [typeFilter, setTypeFilter] = useState("all"),
    [product, setProduct] = useState({ name: "PULS" }),
    [signals, setSignals] = useState([]),
    [commandOpen, setCommandOpen] = useState(false),
    [statusFilter, setStatusFilter] = useState("all"),
    [sidebarCollapsed, setSidebarCollapsed] = useState(
      localStorage.getItem("beam_sidebar_collapsed") === "true",
    );
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
        const p = await fetch(import.meta.env.BASE_URL + "product.json");
        if (p.ok) setProduct(await p.json());
      } else {
        setItems(await api((publicMode ? "public" : "admin") + "/items"));
      }
      if (!pagesMode)
        setProduct(await api((publicMode ? "public" : "admin") + "/product"));
      if (!publicMode) {
        setSuggestions(await api("admin/suggestions"));
        setSignals(await api("admin/signals"));
      }
      setAuth(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    localStorage.setItem("beam_sidebar_collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  useEffect(() => {
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#" + page,
    );
  }, [page]);
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
        setCommandOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (document.querySelector("[role=dialog]:not(.command-dialog)"))
          return;
        setCommandOpen((open) => !open);
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
        (typeFilter === "all" || (i.type || "feature") === typeFilter) &&
        (statusFilter === "all" || i.status === statusFilter) &&
        (priority === "all" || i.priority === priority) &&
        (page !== "changelog" || i.status === "done"),
    )
    .sort((a, b) =>
      sort === "votes"
        ? b.votes - a.votes
        : { high: 0, medium: 1, low: 2 }[a.priority] -
          { high: 0, medium: 1, low: 2 }[b.priority],
    );
  async function schedule(item, dates) {
    try {
      await api("admin/items/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({
          ...dates,
          quarter:
            "T" +
            (Math.floor((Number(dates.start_date.slice(5, 7)) - 1) / 3) + 1) +
            " " +
            dates.start_date.slice(0, 4),
        }),
      });
      await refresh();
      setToast("Planification enregistrée");
    } catch (error) {
      setToast(error.message);
    }
  }
  return (
    <div
      className={
        "app " +
        (publicMode ? "public " : "") +
        (!publicMode && sidebarCollapsed ? "sidebar-collapsed" : "")
      }
    >
      <BeamsBackground intensity="subtle" />
      {!publicMode && (
        <aside className="sidebar" aria-label="Menu latéral">
          <a className="brand" href="/" aria-label="Beam — accueil">
            <span className="brand-mark">
              <Mark />
            </span>
            <span className="brand-word">
              beam<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="workspace">
            <span className="puls-logo">P</span>
            <div>
              <strong>{product.name}</strong>
              <small>Product workspace</small>
            </div>
          </div>
          <div className="nav-caption">ESPACE PRODUIT</div>
          <nav aria-label="Navigation de Beam">
            <TreeNav
              activeHref={"#" + page}
              items={[
                {
                  label: "Planification",
                  href: "#gantt",
                  badge: String(items.length),
                  icon: <Planning size={17} />,
                },
                {
                  label: "Kanban",
                  href: "#kanban",
                  icon: <LayoutGrid size={17} />,
                },
                {
                  label: "Suggestions",
                  href: "#feedback",
                  badge: suggestions.length
                    ? String(suggestions.length)
                    : undefined,
                  icon: <MessageSquare size={17} />,
                },
                {
                  label: "Nouveautés",
                  href: "#changelog",
                  icon: <Radio size={17} />,
                },
                {
                  label: "Notes",
                  href: "#notes",
                  icon: <FileText size={17} />,
                },
                {
                  label: "Intégrations",
                  href: "#integrations",
                  icon: <Integration size={17} />,
                },
              ]}
              onSelect={(item, event) => {
                event.preventDefault();
                setPage(item.href.slice(1));
              }}
            />
          </nav>
          {items.some(
            (i) => i.type === "initiative" || i.type === "project",
          ) && (
            <div className="sidebar-projects">
              <div className="nav-caption">STRUCTURE PRODUIT</div>
              <TreeNav
                items={hierarchyRows(items)
                  .filter(({ item }) => item.type !== "feature")
                  .map(({ item, depth }) => ({
                    label: item.title,
                    href: "#element-" + item.id,
                    depth,
                    icon:
                      item.type === "initiative" ? (
                        <Planning size={14} />
                      ) : (
                        <Map size={14} />
                      ),
                  }))}
                onSelect={(item, event) => {
                  event.preventDefault();
                  setSelected(
                    items.find((i) => "#element-" + i.id === item.href),
                  );
                }}
              />
            </div>
          )}
          <div className="sidebar-bottom">
            <div className="portal-card">
              <span className="portal-symbol">
                <Globe size={19} />
                <span />
              </span>
              <strong>Portail public</strong>
              <p>
                Votre roadmap, accessible à
                <br />
                la communauté {product.name}.
              </p>
              <a href={publicPath} target="_blank" rel="noreferrer">
                Ouvrir le portail <ArrowUpRight size={15} />
              </a>
            </div>
            <div className="profile">
              <span className="avatar">JC</span>
              <div>
                <strong>Équipe {product.name}</strong>
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
          {!publicMode && !auth && (
            <QuickNote api={api} items={items} onError={setToast} />
          )}
          {!publicMode && (
            <button
              className="icon-button sidebar-toggle"
              aria-label={
                sidebarCollapsed
                  ? "Déplier le menu latéral"
                  : "Replier le menu latéral"
              }
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <PanelOpen size={19} />
              ) : (
                <PanelClose size={19} />
              )}
            </button>
          )}
          {publicMode ? (
            <a className="public-brand" href={publicPath}>
              <span className="puls-logo">{product.name[0]}</span>
              {product.name} <span>/</span> Roadmap
            </a>
          ) : (
            <div className="breadcrumbs">
              Espace produit <ChevronRight size={13} />{" "}
              <span>
                {page === "notes"
                  ? "Notes"
                  : page === "gantt"
                    ? "Planification"
                    : page === "kanban"
                      ? "Kanban"
                      : page === "integrations"
                        ? "Intégrations"
                        : page === "feedback"
                          ? "Suggestions"
                          : "Nouveautés"}
              </span>
            </div>
          )}
          <div className="top-actions">
            <button
              className="icon-button global-search"
              aria-label="Recherche et commandes"
              aria-keyshortcuts="Meta+K Control+K"
              onClick={() => setCommandOpen(true)}
            >
              <Search size={16} />
            </button>
            <span className="live">
              <i />
              {pagesMode
                ? "Roadmap publique"
                : publicMode
                  ? "En direct de l’équipe"
                  : "Espace produit"}
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
              <h1>
                {page === "notes"
                  ? "Notes"
                  : page === "integrations"
                    ? "Intégrations"
                    : page === "feedback"
                      ? "Suggestions"
                      : page === "changelog"
                        ? "Nouveautés"
                        : page === "kanban"
                          ? "Kanban"
                          : publicMode
                            ? "Planification " + product.name
                            : "Planification"}
              </h1>
              <p>
                {page === "notes"
                  ? "Capturez vos échanges. Retrouvez ce qui mérite votre attention."
                  : page === "integrations"
                    ? "Reliez les outils de votre produit et transformez leurs informations en décisions de roadmap."
                    : page === "feedback"
                      ? "Les retours de votre communauté, réunis au même endroit."
                      : page === "changelog"
                        ? "Les dernières évolutions disponibles dans " +
                          product.name +
                          "."
                        : publicMode
                          ? pagesMode
                            ? "Les initiatives, projets et features de " +
                              product.name +
                              " dans le temps."
                            : "Suivez les évolutions de " +
                              product.name +
                              " et votez pour vos priorités."
                          : page === "kanban"
                            ? "Suivez l’exécution de vos initiatives, projets et features par statut."
                            : "Suivez vos initiatives, projets et features sur une même chronologie."}
              </p>
            </div>
            {!pagesMode && page !== "integrations" && page !== "notes" && (
              <button
                className="button primary"
                onClick={() =>
                  publicMode ? setSuggest(true) : setEdit({ ...blank })
                }
              >
                <Plus size={17} />
                {publicMode ? "Proposer une idée" : "Nouvel élément"}
              </button>
            )}
          </section>
          {publicMode && (
            <nav className="screen-tabs" aria-label="Vues de la roadmap">
              <button
                className={page === "gantt" ? "active" : ""}
                onClick={() => setPage("gantt")}
                aria-current={page === "gantt" ? "page" : undefined}
              >
                <Planning size={16} />
                Planification
              </button>
              <button
                className={page === "kanban" ? "active" : ""}
                onClick={() => setPage("kanban")}
                aria-current={page === "kanban" ? "page" : undefined}
              >
                <LayoutGrid size={16} />
                Kanban
              </button>
            </nav>
          )}
          {page !== "feedback" &&
            page !== "integrations" &&
            page !== "notes" && (
              <>
                <div className="section-title">
                  <div>
                    <h2>
                      {page === "changelog"
                        ? "Dernières améliorations"
                        : page === "gantt"
                          ? "Vue Gantt"
                          : "Tableau de suivi"}
                    </h2>
                    <span className="pill">
                      {publicMode ? "Public" : product.name}
                    </span>
                  </div>
                  <span className="subtle">
                    {publicMode
                      ? pagesMode
                        ? ""
                        : "Votre voix compte. Votez pour vos priorités."
                      : ""}
                  </span>
                </div>
                <div className="toolbar">
                  <div className="toolbar-left">
                    <button
                      className="search search-trigger"
                      id="search"
                      onClick={() => setCommandOpen(true)}
                      aria-label="Rechercher un élément ou une commande"
                    >
                      <Search size={16} />
                      <span>Rechercher un élément…</span>
                      <kbd>⌘ K</kbd>
                    </button>
                    <button
                      className={
                        "button filter-button " + (filter ? "selected" : "")
                      }
                      onClick={() => setFilter(!filter)}
                    >
                      <SlidersHorizontal size={15} />
                      Filtres
                      {(statusFilter !== "all" ||
                        priority !== "all" ||
                        category !== "all" ||
                        typeFilter !== "all") && (
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
                    {page !== "gantt" && (
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
                    )}
                  </div>
                </div>
                {filter && (
                  <div className="filters">
                    <label>
                      Type
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                      >
                        <option value="all">Tous les types</option>
                        {Object.entries(TYPES).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      État
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="all">Tous les états</option>
                        {Object.entries(ST).map(([id, value]) => (
                          <option key={id} value={id}>
                            {value.label}
                          </option>
                        ))}
                      </select>
                    </label>
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
                        setTypeFilter("all");
                        setStatusFilter("all");
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
          ) : page === "notes" && !publicMode ? (
            <Notes
              api={api}
              items={items}
              onError={setToast}
              onOpen={setSelected}
            />
          ) : page === "integrations" && !publicMode ? (
            <Integrations
              api={api}
              items={items}
              product={product}
              onProduct={setProduct}
              onRefresh={refresh}
              onError={setToast}
              onSignals={setSignals}
            />
          ) : page === "gantt" ? (
            <Gantt
              items={filtered}
              allItems={items}
              readOnly={publicMode}
              onOpen={setSelected}
              onCreate={() => setEdit({ ...blank })}
              onSchedule={schedule}
            />
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
              {product.name} · Product roadmap
            </span>
            <span>
              <b>beam.</b>
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
      {commandOpen && (
        <Modal
          title="Recherche et commandes"
          close={() => setCommandOpen(false)}
          className="command-dialog"
        >
          <RoadmapSearch
            onClose={() => setCommandOpen(false)}
            items={items}
            publicMode={publicMode}
            onApply={(clauses) => {
              for (const { command, values } of clauses) {
                if (command.id.startsWith("open:"))
                  setSelected(items.find((i) => i.id === command.id.slice(5)));
                else if (command.id.startsWith("nav:"))
                  setPage(command.id.slice(4));
                else if (command.id === "reset") {
                  setCategory("all");
                  setPriority("all");
                  setTypeFilter("all");
                  setStatusFilter("all");
                  setQuery("");
                } else if (command.id.startsWith("filter:")) {
                  if (command.id === "filter:type") setTypeFilter(values[0].id);
                  if (command.id === "filter:status")
                    setStatusFilter(values[0].id);
                  if (command.id === "filter:priority")
                    setPriority(values[0].id);
                  setFilter(true);
                  if (!["gantt", "kanban"].includes(page)) setPage("gantt");
                }
              }
              setCommandOpen(false);
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title="Détails de l’élément"
          side
          close={() => setSelected(null)}
        >
          <div className="detail-meta">
            <span className="tag">{TYPES[selected.type || "feature"]}</span>
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
          <div className="planning-details">
            <div>
              <span>Responsable</span>
              <strong>{selected.owner || "Non assigné"}</strong>
            </div>
            <div>
              <span>Avancement</span>
              <strong>{progressValue(selected, items)} %</strong>
            </div>
            <div>
              <span>Début</span>
              <strong>{selected.start_date || "À définir"}</strong>
            </div>
            <div>
              <span>Fin</span>
              <strong>{selected.end_date || "À définir"}</strong>
            </div>
            <div>
              <span>Rattaché à</span>
              <strong>
                {items.find((i) => i.id === selected.parent_id)?.title ||
                  "Élément indépendant"}
              </strong>
            </div>
            <div>
              <span>Dépend de</span>
              <strong>
                {items.find((i) => i.id === selected.dependency_id)?.title ||
                  "Aucune dépendance"}
              </strong>
            </div>
          </div>
          {!publicMode && (
            <SignalLinks
              signals={signals}
              item={selected}
              api={api}
              onSignals={setSignals}
            />
          )}
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
          title={edit.id ? "Modifier l’élément" : "Nouvel élément"}
          side
          close={() => setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <label>
                Type d’élément
                <select
                  value={edit.type || "feature"}
                  onChange={(e) =>
                    setEdit({ ...edit, type: e.target.value, parent_id: null })
                  }
                >
                  {Object.entries(TYPES).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsable
                <input
                  maxLength={80}
                  value={edit.owner || ""}
                  placeholder="Nom ou équipe"
                  onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
                />
              </label>
            </div>
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
              <label>
                Date de début
                <input
                  type="date"
                  value={edit.start_date || ""}
                  min="2000-01-01"
                  max="2099-12-31"
                  onInput={(e) => {
                    const date = e.target.value;
                    setEdit({
                      ...edit,
                      start_date: date || null,
                      quarter: date
                        ? "T" +
                          (Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1) +
                          " " +
                          date.slice(0, 4)
                        : edit.quarter,
                    });
                  }}
                />
              </label>
              <label>
                Date de fin
                <input
                  type="date"
                  min={edit.start_date || "2000-01-01"}
                  max="2099-12-31"
                  value={edit.end_date || ""}
                  onInput={(e) =>
                    setEdit({ ...edit, end_date: e.target.value || null })
                  }
                />
              </label>
              <label>
                Avancement (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={edit.status === "done" ? 100 : edit.progress || 0}
                  disabled={
                    edit.status === "done" ||
                    items.some((i) => i.parent_id === edit.id)
                  }
                  onChange={(e) =>
                    setEdit({ ...edit, progress: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Horizon estimé
                <input
                  placeholder="T1 2027"
                  required
                  pattern="T[1-4] 20[0-9]{2}"
                  value={edit.quarter}
                  onChange={(e) =>
                    setEdit({ ...edit, quarter: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="fine-print">
              Sans dates précises, le Gantt affiche votre trimestre comme
              horizon estimé. L’avancement d’un parent est calculé depuis ses
              enfants.
            </p>
            {(edit.type || "feature") !== "initiative" && (
              <label>
                {edit.type === "project"
                  ? "Initiative parente"
                  : "Projet parent"}
                <select
                  value={edit.parent_id || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, parent_id: e.target.value || null })
                  }
                >
                  <option value="">Élément indépendant</option>
                  {items
                    .filter(
                      (i) =>
                        i.id !== edit.id &&
                        i.type ===
                          (edit.type === "project" ? "initiative" : "project"),
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Dépend de
              <select
                value={edit.dependency_id || ""}
                onChange={(e) =>
                  setEdit({ ...edit, dependency_id: e.target.value || null })
                }
              >
                <option value="">Aucune dépendance</option>
                {items
                  .filter((i) => i.id !== edit.id)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
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
            {edit.id ? (
              <SignalLinks
                signals={signals}
                item={edit}
                api={api}
                onSignals={setSignals}
              />
            ) : (
              <p className="feature-source-help">
                Enregistrez cet élément pour lui associer des tickets ou
                documents.
              </p>
            )}
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
        <Modal title="Partager la roadmap" close={() => setShare(false)}>
          <div className="share-illustration">
            <Globe size={38} />
            <span>Roadmap {product.name}</span>
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
        <Modal title="Proposer une idée" close={() => setSuggest(false)}>
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
                setToast("Merci ! Votre idée a été transmise à l’équipe.");
              } catch (e) {
                setToast(e.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <p className="modal-copy">
              Dites-nous ce qui rendrait {product.name} encore plus utile au
              quotidien.
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
function Modal({ title, close, children, side = false, className = "" }) {
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.querySelector(".modal");
    const focusables = () =>
      [...root.querySelectorAll("button,input,textarea,select,a[href]")].filter(
        (el) => !el.disabled,
      );
    (root.querySelector("[role=combobox]") || focusables()[0])?.focus();
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
      className={"modal-backdrop" + (side ? " panel-backdrop" : "")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close?.();
      }}
    >
      <section
        className={"modal " + className + (side ? " side-panel" : "")}
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
