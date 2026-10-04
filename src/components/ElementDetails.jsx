import { unchangedData } from "../hooks/useVisiblePolling";
import React, { useEffect, useRef, useState } from "react";
import { TYPES, progressValue } from "../../shared/planning";
import { DATE_KINDS } from "../../shared/roadmap-impact";
import {
  Activity,
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Close,
  Globe,
  Link2,
  Lock,
  Map,
  SlidersHorizontal,
} from "../icons";
import AIProgress from "./AIProgress";
import ProductOutcome from "./ProductOutcome";
import DecisionMemory from "./DecisionMemory";
import ItemGovernance from "./ItemGovernance";
import LocalAssistant from "./LocalAssistant";
import TeamActivity from "./Team";
import { SignalLinks } from "./Integrations";
import { initials } from "./Profile";
const states = { planned: "À venir", progress: "En cours", done: "Livré" };
const priorities = { high: "Haute", medium: "Normale", low: "Basse" };
const shortDate = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "À définir";

export default function ElementDetails({
  item,
  items,
  product,
  api,
  signals,
  onSignals,
  sharedConnection,
  publicMode,
  pagesMode,
  readOnly,
  onClose,
  onEdit,
  onManage,
  onOpenItem,
  onOpenNote,
  onRefresh,
  onError,
  onPublish,
  onVote,
}) {
  const [tab, setTab] = useState("overview"),
    [menu, setMenu] = useState(false),
    [fullDescription, setFullDescription] = useState(false),
    [sourceCount, setSourceCount] = useState(null),
    [associationReviews, setAssociationReviews] = useState(0),
    [decisions, setDecisions] = useState({ count: 0, pending: 0 }),
    [issues, setIssues] = useState([]),
    [assistant, setAssistant] = useState(null);
  const body = useRef(null),
    menuRoot = useRef(null),
    tabs = useRef({});
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (!menuRoot.current?.contains(e.target)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const parent = items.find((i) => i.id === item.parent_id),
    dependency = items.find((i) => i.id === item.dependency_id),
    progress = progressValue(item, items);
  const latest = assistant?.reviews.find(
    (r) => r.scope === "feature" && r.entity_id === item.id,
  );
  const proposalCount =
    latest?.state === "done"
      ? (latest.result?.proposals || []).filter(
          (p) => !p.applied && !p.dismissed,
        ).length
      : 0;
  const aiBusy = latest && ["queued", "running"].includes(latest.state);
  const reviewCount =
    issues.length + decisions.pending + proposalCount + associationReviews;
  const linkedCount =
    sourceCount ?? signals.filter((s) => s.links.includes(item.id)).length;
  const status = assistant?.status;
  const assistantLabel = !status
    ? "Vérification du moteur…"
    : !status.available
      ? "Moteur indisponible"
      : !status.installed
        ? "Modèle à installer"
        : !status.enabled
          ? "En pause sur ce Mac"
          : aiBusy
            ? "Analyse en cours sur ce Mac"
            : latest?.state === "error"
              ? "Dernière analyse en échec"
              : reviewCount
                ? `${reviewCount} point${reviewCount > 1 ? "s" : ""} à examiner`
                : "Actif sur ce Mac · Aucun point à examiner";
  const reviewTab =
    issues.length || decisions.pending ? "decisions" : "sources";
  const tabList = publicMode
    ? [["overview", "Vue d’ensemble"]]
    : [
        ["overview", "Vue d’ensemble"],
        ["sources", "Sources", linkedCount],
        ["decisions", "Décisions", decisions.count],
        ["activity", "Activité"],
      ];
  const descriptionCanExpand =
    (item.description?.length || 0) > 100 ||
    (item.description || "").split("\n").length > 3;
  function examine() {
    const name = reviewTab;
    setTab(name);
    requestAnimationFrame(() => {
      const selector = issues.length
        ? ".item-governance"
        : decisions.pending
          ? ".decision-proposed"
          : associationReviews
            ? ".auto-sources"
            : ".assistant-feature-detail";
      body.current?.querySelector(selector)?.scrollIntoView({ block: "start" });
    });
  }
  const pickTab = (name, focus = false) => {
    setTab(name);
    if (focus) tabs.current[name]?.focus();
  };
  const [copying, setCopying] = useState(false);
  async function copyLink() {
    setCopying(true);
    try {
      const url = new URL(location.href);
      url.hash = "element-" + item.id;
      await navigator.clipboard.writeText(url.href);
      setMenu(false);
      onError("Lien de l’élément copié");
    } catch {
      onError("Impossible de copier le lien dans ce navigateur.");
    } finally {
      setCopying(false);
    }
  }
  return (
    <div className="element-details">
      <header className="element-header">
        <div className="element-utility">
          <div className="element-breadcrumb">
            <span>{product.name}</span>
            <ChevronRight size={12} />
            {parent ? (
              <button onClick={() => onOpenItem(parent)} title={parent.title}>
                {parent.title}
              </button>
            ) : (
              <span>Élément indépendant</span>
            )}
            <ChevronRight size={12} />
            <span>{TYPES[item.type || "feature"]}</span>
          </div>
          <div className="element-tools" ref={menuRoot}>
            {!publicMode && (
              <button
                className="icon-button element-more"
                aria-label="Autres actions sur l’élément"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                ⋯
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Fermer le panneau"
              data-modal-autofocus
              onClick={onClose}
            >
              <Close size={17} />
            </button>
            {menu && (
              <div className="element-menu" aria-label="Actions de l’élément">
                <button disabled={copying} onClick={copyLink}>
                  Copier le lien
                </button>
                {!readOnly && (
                  <>
                    <button
                      onClick={() => {
                        setMenu(false);
                        onManage(false);
                      }}
                    >
                      {item.archived ? "Restaurer" : "Archiver l’élément"}
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        setMenu(false);
                        onManage(true);
                      }}
                    >
                      Supprimer…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="element-overline">
          <Map size={13} />
          <span>{TYPES[item.type || "feature"]}</span>
          {item.category && (
            <>
              <i>·</i>
              <span>{item.category}</span>
            </>
          )}
          <i>·</i>
          <span className="element-visibility">
            {item.visibility === "public" ? (
              <Globe size={11} />
            ) : (
              <Lock size={11} />
            )}{" "}
            {item.visibility === "public" ? "Public" : "Interne"}
          </span>
          {Boolean(item.archived) && <span>· Archivé</span>}
        </div>
        <div className="element-title-line">
          <h2>{item.title}</h2>
          {!publicMode && (
            <button
              className="button element-edit"
              disabled={readOnly}
              onClick={onEdit}
            >
              <SlidersHorizontal size={13} />
              Modifier
            </button>
          )}
        </div>
        <div className="element-properties">
          <span className={"element-state state-" + item.status}>
            <i />
            {states[item.status]}
          </span>
          <span className={"element-priority priority-" + item.priority}>
            ↑ Priorité {priorities[item.priority]?.toLowerCase()}
          </span>
          <span className="element-property-separator" />
          <span className="element-owner">
            <span className="element-owner-avatar">
              {initials(item.owner || "?")}
            </span>
            {item.owner || "Non assigné"}
          </span>
        </div>
        <div className="element-planning">
          <div>
            <span className="element-label">
              Calendrier {item.quarter && <small>· {item.quarter}</small>}
            </span>
            <div className="element-dates">
              <span>{shortDate(item.start_date)}</span>
              <ArrowRight size={13} />
              <span>{shortDate(item.end_date)}</span>
            </div>
            <span
              className={
                "element-commitment " +
                (item.date_kind === "committed" ? "committed" : "target")
              }
            >
              {item.date_kind === "committed" ? (
                <CheckCheck size={12} />
              ) : (
                <span className="element-target-dot" />
              )}
              {DATE_KINDS[item.date_kind || "target"]}
            </span>
          </div>
          <div className="element-progress">
            <div>
              <span>Avancement</span>
              <strong>{progress} %</strong>
            </div>
            <div
              className={"element-progress-track state-" + item.status}
              role="progressbar"
              aria-label="Avancement de l’élément"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: progress + "%" }} />
            </div>
          </div>
        </div>
      </header>
      <div
        className="element-tabs"
        role="tablist"
        aria-label="Détails de l’élément"
      >
        {tabList.map(([name, label, count], index) => (
          <button
            key={name}
            ref={(el) => {
              tabs.current[name] = el;
            }}
            id={"element-tab-" + name}
            role="tab"
            aria-controls={"element-view-" + name}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => pickTab(name)}
            onKeyDown={(e) => {
              let next;
              if (e.key === "ArrowRight") next = (index + 1) % tabList.length;
              if (e.key === "ArrowLeft")
                next = (index + tabList.length - 1) % tabList.length;
              if (e.key === "Home") next = 0;
              if (e.key === "End") next = tabList.length - 1;
              if (next !== undefined) {
                e.preventDefault();
                pickTab(tabList[next][0], true);
              }
            }}
          >
            {label}
            {count > 0 && <small>{count}</small>}
          </button>
        ))}
      </div>
      <div className="element-body" ref={body}>
        <section
          id="element-view-overview"
          role="tabpanel"
          aria-labelledby="element-tab-overview"
          hidden={tab !== "overview"}
        >
          <div className="element-section-heading">
            <h3>Pourquoi on le fait</h3>
            {descriptionCanExpand && (
              <button
                className="text-button"
                aria-expanded={fullDescription}
                onClick={() => setFullDescription(!fullDescription)}
              >
                {fullDescription ? "Réduire" : "Lire la suite"}
              </button>
            )}
          </div>
          <p
            className={
              "element-description" +
              (fullDescription || !descriptionCanExpand ? " expanded" : "")
            }
          >
            {item.description || "Aucune description pour le moment."}
          </p>
          <section className="element-roadmap-context">
            <h3>Dans la roadmap</h3>
            <dl>
              <div>
                <dt>Rattaché à</dt>
                <dd>
                  {parent ? (
                    <button onClick={() => onOpenItem(parent)}>
                      <Map size={14} />
                      {parent.title}
                    </button>
                  ) : (
                    <span>Élément indépendant</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Dépend de</dt>
                <dd>
                  {dependency ? (
                    <button onClick={() => onOpenItem(dependency)}>
                      <Link2 size={14} />
                      {dependency.title}
                      <span
                        className={
                          "element-related-state state-" + dependency.status
                        }
                      >
                        {states[dependency.status]}
                      </span>
                    </button>
                  ) : (
                    <span>Aucune dépendance</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
          {!publicMode && (
            <ProductOutcome
              item={item}
              api={api}
              readOnly={readOnly}
              onRefresh={onRefresh}
              onError={onError}
              onOpenNote={onOpenNote}
              heading="Résultat attendu"
            />
          )}
          {!publicMode && (issues.length > 0 || decisions.pending > 0) && (
            <div className="element-alert">
              <span className="element-alert-symbol">△</span>
              <div>
                <strong>
                  {issues.length
                    ? `${issues.length} écart${issues.length > 1 ? "s" : ""} à vérifier`
                    : `${decisions.pending} décision${decisions.pending > 1 ? "s" : ""} à confirmer`}
                </strong>
                <p>
                  {issues[0]?.reason ||
                    "Un arbitrage proposé attend votre validation."}
                </p>
              </div>
              <button onClick={examine}>
                Examiner
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          {!pagesMode && publicMode && (
            <button
              className="button primary element-public-vote"
              onClick={onVote}
            >
              {item.voted ? "Retirer mon vote" : "Cette idée compte pour moi"}
            </button>
          )}
          {!publicMode &&
            item.status === "done" &&
            item.visibility === "public" &&
            !item.archived &&
            !readOnly && (
              <button
                className="button element-publication"
                onClick={onPublish}
              >
                Préparer une publication
                <ArrowRight size={14} />
              </button>
            )}
        </section>
        {!publicMode && (
          <>
            <section
              id="element-view-sources"
              role="tabpanel"
              aria-labelledby="element-tab-sources"
              hidden={tab !== "sources"}
            >
              <p className="element-tab-intro">
                Les informations qui éclairent cet élément, avec leur
                provenance.
              </p>
              <SignalLinks
                signals={signals}
                item={item}
                api={api}
                onSignals={onSignals}
                onCount={setSourceCount}
                onReviewCount={setAssociationReviews}
                readOnly={readOnly}
              />
              <LocalAssistant
                api={api}
                scope="feature"
                entity={item}
                items={items}
                onRefresh={onRefresh}
                onData={(next) =>
                  setAssistant((previous) => unchangedData(previous, next))
                }
                readOnly={readOnly}
                initialExpanded
              />
            </section>
            <section
              id="element-view-decisions"
              role="tabpanel"
              aria-labelledby="element-tab-decisions"
              hidden={tab !== "decisions"}
            >
              <p className="element-tab-intro">
                Les choix confirmés, les propositions et les écarts à vérifier.
              </p>
              <DecisionMemory
                api={api}
                itemId={item.id}
                items={items}
                onError={onError}
                onOpenNote={onOpenNote}
                onSummary={setDecisions}
                readOnly={readOnly}
              />
            </section>
            <section
              id="element-view-activity"
              role="tabpanel"
              aria-labelledby="element-tab-activity"
              hidden={tab !== "activity"}
            >
              {sharedConnection?.workspace ? (
                <TeamActivity
                  api={api}
                  itemId={item.id}
                  state={sharedConnection}
                />
              ) : (
                <p className="element-tab-intro">
                  L’historique ci-dessous conserve les changements observés sur
                  ce Mac. Les commentaires d’équipe sont disponibles dans un
                  workspace partagé.
                </p>
              )}
            </section>
            <div hidden={tab !== "decisions" && tab !== "activity"}>
              <ItemGovernance
                item={item}
                items={items}
                api={api}
                readOnly={readOnly}
                onRefresh={onRefresh}
                onError={onError}
                onOpenNote={onOpenNote}
                mode={tab === "activity" ? "history" : "issues"}
                onIssues={(next) =>
                  setIssues((previous) => unchangedData(previous, next))
                }
                historyCollapsed={Boolean(sharedConnection?.workspace)}
                historyLabel={
                  sharedConnection?.workspace
                    ? "Changements observés sur ce Mac"
                    : "Historique des changements"
                }
              />
            </div>
          </>
        )}
      </div>
      {!publicMode && (
        <footer className="element-assistant-footer">
          <span className="element-assistant-icon">
            <Activity size={18} />
          </span>
          <div>
            <strong>Assistant local</strong>
            <small>{assistantLabel}</small>
          </div>
          <AIProgress itemId={item.id} scope="feature" />
          <button className="button" onClick={examine}>
            {reviewCount ? "Examiner" : "Voir l’analyse"}
            <ChevronRight size={12} />
          </button>
        </footer>
      )}
    </div>
  );
}
