import React, { useEffect, useRef, useState } from "react";
import { Radio, Plus, ArrowRight, Globe, FileText } from "../icons";
import AIProgress from "./AIProgress";
const sourceLabels = {
  gantt: "Livraisons",
  note: "Notes",
  document: "Documents",
  pr: "Pull requests",
  commit: "Commits",
  ticket: "Tickets",
  release: "Versions GitHub",
};
function ReleaseBody({ text }) {
  return (
    <div className="release-body">
      {text.split(/\n\n+/).map((block, index) => {
        const lines = block.split("\n");
        return ["Nouveautés", "Améliorations", "Corrections"].includes(
          lines[0],
        ) && lines.slice(1).every((l) => l.startsWith("• ")) ? (
          <section key={index}>
            <h3>{lines[0]}</h3>
            <ul>
              {lines.slice(1).map((line, i) => (
                <li key={i}>{line.slice(2)}</li>
              ))}
            </ul>
          </section>
        ) : (
          <p key={index}>{block}</p>
        );
      })}
    </div>
  );
}
const labels = {
  draft: "Brouillons",
  published: "Publiées",
  archived: "Archives",
};
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
export default function Publications({
  api,
  items,
  product,
  publicMode,
  pagesMode,
  Modal,
  onError,
  onOpen,
  initialItem,
  onConsumed,
}) {
  const [rows, setRows] = useState([]),
    [options, setOptions] = useState({ releases: [], github: [] }),
    [sourceDirty, setSourceDirty] = useState(false),
    [replaceText, setReplaceText] = useState(false),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("draft"),
    [edit, setEdit] = useState(null),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false),
    [dirty, setDirty] = useState(false),
    [confirmClose, setConfirmClose] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  async function refresh() {
    const data = pagesMode
      ? await fetch(import.meta.env.BASE_URL + "publications.json").then(
          (r) => {
            if (!r.ok) throw Error("Publications indisponibles");
            return r.json();
          },
        )
      : await apiRef.current(
          (publicMode ? "public" : "admin") + "/publications",
        );
    setRows(data);
    if (!publicMode)
      setOptions(await apiRef.current("admin/publications/options"));
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (live) onError(e.message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [publicMode, pagesMode]);
  async function generateDraft(draft) {
    setGenerating(true);
    setReplaceText(false);
    try {
      const proposal = await apiRef.current("admin/publications/generate", {
        method: "POST",
        body: JSON.stringify({
          item_ids: draft.item_ids,
          release_id: draft.release_id || null,
        }),
      });
      setEdit((current) => ({
        ...current,
        ...proposal,
        item_id: proposal.item_ids[0] || null,
        version: proposal.version || current.version,
      }));
      setDirty(true);
      setSourceDirty(false);
    } catch (e) {
      onError(e.message);
    } finally {
      setGenerating(false);
    }
  }
  function prepare(item, manual = false) {
    const ids = manual
      ? []
      : item
        ? [item.id]
        : items
            .filter(
              (i) =>
                !i.archived &&
                i.status === "done" &&
                i.visibility === "public" &&
                !rows.some(
                  (r) =>
                    r.state !== "archived" &&
                    (r.item_ids || [r.item_id]).includes(i.id),
                ),
            )
            .slice(0, 20)
            .map((i) => i.id);
    const draft = {
      item_id: ids[0] || null,
      item_ids: ids,
      release_id: null,
      sources: [],
      title: item?.title || "",
      body: manual ? "" : item?.description || "",
      version: "",
    };
    setEdit(draft);
    setPreview(false);
    setDirty(false);
    setSourceDirty(false);
    setReplaceText(false);
    setConfirmClose(false);
    setConfirmDelete(false);
    if (ids.length) void generateDraft(draft);
  }
  useEffect(() => {
    if (initialItem) {
      prepare(initialItem);
      onConsumed();
    }
  }, [initialItem]);
  const eligible = items.filter(
    (i) =>
      !i.archived &&
      i.status === "done" &&
      i.visibility === "public" &&
      !rows.some(
        (r) =>
          (r.item_ids || [r.item_id]).includes(i.id) && r.state !== "archived",
      ),
  );
  const visible = publicMode ? rows : rows.filter((r) => r.state === tab);
  const linked = items.find((i) => i.id === edit?.item_id);
  async function persist() {
    const row = await apiRef.current(
      "admin/publications" + (edit.id ? "/" + edit.id : ""),
      {
        method: edit.id ? "PATCH" : "POST",
        body: JSON.stringify({
          title: edit.title,
          body: edit.body,
          version: edit.version,
          item_id: edit.item_ids?.[0] || null,
          item_ids: edit.item_ids || [],
          release_id: edit.release_id || null,
          sources: edit.sources || [],
        }),
      },
    );
    setEdit(row);
    setDirty(false);
    await refresh();
    return row;
  }
  async function run(action) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function changeState(state) {
    await run(async () => {
      const row = dirty || !edit.id ? await persist() : edit;
      await apiRef.current("admin/publications/" + row.id + "/state", {
        method: "PATCH",
        body: JSON.stringify({ state }),
      });
      setEdit(null);
      setTab(state);
      await refresh();
    });
  }
  function close() {
    if (busy || generating) return;
    if (dirty) setConfirmClose(true);
    else setEdit(null);
  }
  useEffect(() => {
    if (!edit) return;
    function handle(e) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [edit, dirty, busy, generating]);
  return (
    <div className="publications">
      {!publicMode && (
        <div className="publication-toolbar">
          <div className="screen-tabs" aria-label="État des publications">
            {Object.entries(labels).map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
                <span className="count">
                  {rows.filter((r) => r.state === key).length}
                </span>
              </button>
            ))}
          </div>
          <button className="button primary" onClick={() => prepare(null)}>
            <Plus size={16} />
            Préparer une release note
          </button>
          <button className="button" onClick={() => prepare(null, true)}>
            Écrire manuellement
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty">Chargement des publications…</div>
      ) : visible.length ? (
        <div className="publication-list">
          {visible.map((row) =>
            publicMode ? (
              <article className="publication-public" key={row.id}>
                <div className="publication-meta">
                  {date(row.published)}
                  {row.version && <span className="pill">{row.version}</span>}
                </div>
                <h2>{row.title}</h2>
                <ReleaseBody text={row.body} />
              </article>
            ) : (
              <button
                className="publication-row"
                key={row.id}
                onClick={() => {
                  setEdit(row);
                  setPreview(row.state === "published");
                  setDirty(false);
                  setConfirmClose(false);
                  setConfirmDelete(false);
                  setSourceDirty(false);
                  setReplaceText(false);
                }}
              >
                <span className="publication-row-icon">
                  <FileText size={19} />
                </span>
                <span className="publication-row-text">
                  <strong>{row.title || "Publication sans titre"}</strong>
                  <small>
                    {row.version ? row.version + " · " : ""}
                    {row.state === "published"
                      ? "Publiée le " + date(row.published)
                      : "Modifiée le " + date(row.updated)}
                    {row.item_id &&
                      " · " +
                        (items.find((i) => i.id === row.item_id)?.title ||
                          "Élément supprimé")}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ),
          )}
        </div>
      ) : (
        <div className="publication-empty">
          <Radio size={28} />
          <h2>
            {publicMode
              ? "Les nouveautés arrivent bientôt"
              : tab === "draft"
                ? "Votre prochaine release note"
                : tab === "published"
                  ? "Aucune annonce publiée"
                  : "Aucune publication archivée"}
          </h2>
          <p>
            {publicMode
              ? "Retrouvez ici les prochaines évolutions disponibles dans " +
                product.name +
                "."
              : tab === "draft"
                ? "L’IA croise GitHub, les notes et les éléments livrés pour expliquer simplement les nouveautés, améliorations et corrections."
                : tab === "published"
                  ? "Vos annonces validées apparaîtront ici et dans le portail public."
                  : "Les publications retirées restent accessibles ici."}
          </p>
          {!publicMode && tab === "draft" && (
            <button className="button" onClick={() => prepare(null)}>
              <Plus size={16} />
              Préparer une release note
            </button>
          )}
        </div>
      )}
      {!publicMode && tab === "draft" && eligible.length > 0 && (
        <section className="publication-ready">
          <div className="section-title">
            <h2>Livré, prêt à annoncer</h2>
            <span className="subtle">
              {eligible.length} élément{eligible.length > 1 ? "s" : ""}
            </span>
          </div>
          {eligible.map((item) => (
            <div className="publication-ready-row" key={item.id}>
              <button
                className="publication-item-link"
                onClick={() => onOpen(item)}
              >
                <span className="publication-done-dot" />
                {item.title}
              </button>
              <button className="button" onClick={() => prepare(item)}>
                Préparer une annonce
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </section>
      )}
      {!publicMode && (
        <p className="publication-footnote">
          <Globe size={14} />
          Seules les annonces publiées sont visibles sur le portail. GitHub
          Pages se met à jour après l’export et le déploiement.
        </p>
      )}
      {edit && (
        <Modal
          title={edit.id ? "Publication" : "Nouvelle publication"}
          side
          className="publication-panel"
          close={close}
        >
          <div className="publication-editor-meta">
            <span className="pill">
              {labels[edit.state || "draft"]
                .replace("Brouillons", "Brouillon")
                .replace("Publiées", "Publiée")
                .replace("Archives", "Archivée")}
            </span>
            {linked && (
              <span className="subtle">À partir de {linked.title}</span>
            )}
          </div>
          {edit.state !== "archived" && (
            <div className="screen-tabs publication-editor-tabs">
              <button
                className={!preview ? "active" : ""}
                onClick={() => setPreview(false)}
              >
                Rédaction
              </button>
              <button
                className={preview ? "active" : ""}
                onClick={() => setPreview(true)}
              >
                Aperçu utilisateur
              </button>
            </div>
          )}
          {preview || edit.state === "archived" ? (
            <article className="publication-public publication-preview">
              <div className="publication-meta">
                {edit.state === "published" && edit.published
                  ? date(edit.published)
                  : "Aperçu · non publié"}
                {edit.version && <span className="pill">{edit.version}</span>}
              </div>
              <h2>{edit.title || "Titre de votre annonce"}</h2>
              <ReleaseBody
                text={
                  edit.body ||
                  "Expliquez ici ce qui change pour vos utilisateurs."
                }
              />
            </article>
          ) : (
            <div className="publication-form">
              {(edit.state || "draft") === "draft" && (
                <div className="release-scope">
                  <label>
                    Version GitHub
                    <select
                      disabled={busy || generating}
                      value={edit.release_id || ""}
                      onChange={(e) => {
                        const release = options.releases.find(
                          (r) => r.id === e.target.value,
                        );
                        setEdit({
                          ...edit,
                          release_id: e.target.value || null,
                          version: release?.version || edit.version,
                          sources: [],
                        });
                        setSourceDirty(true);
                        setDirty(true);
                      }}
                    >
                      <option value="">À partir des éléments livrés</option>
                      {options.releases.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.version || r.title} · {r.source}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details>
                    <summary>
                      Éléments livrés inclus{" "}
                      <span className="count">
                        {edit.item_ids?.length || 0}
                      </span>
                    </summary>
                    <div className="release-item-picker">
                      {items
                        .filter(
                          (i) =>
                            !i.archived &&
                            i.status === "done" &&
                            i.visibility === "public",
                        )
                        .map((i) => (
                          <label key={i.id}>
                            <input
                              type="checkbox"
                              checked={edit.item_ids?.includes(i.id) || false}
                              disabled={
                                busy ||
                                generating ||
                                (!edit.item_ids?.includes(i.id) &&
                                  edit.item_ids?.length >= 20)
                              }
                              onChange={(e) => {
                                const ids = e.target.checked
                                  ? [...(edit.item_ids || []), i.id]
                                  : (edit.item_ids || []).filter(
                                      (id) => id !== i.id,
                                    );
                                setEdit({
                                  ...edit,
                                  item_ids: ids,
                                  item_id: ids[0] || null,
                                  sources: [],
                                });
                                setSourceDirty(true);
                                setDirty(true);
                              }}
                            />
                            {i.title}
                          </label>
                        ))}
                      {!items.some(
                        (i) =>
                          !i.archived &&
                          i.status === "done" &&
                          i.visibility === "public",
                      ) && (
                        <small>
                          Aucun élément livré et public pour le moment. Vous
                          pouvez sélectionner une version GitHub publiée.
                        </small>
                      )}
                    </div>
                  </details>
                  <p className="release-sync-hint">
                    {options.github.length
                      ? options.github
                          .map(
                            (s) =>
                              s.label +
                              " · " +
                              (s.last_error
                                ? "Synchronisation en erreur"
                                : s.last_sync
                                  ? "synchronisé le " + date(s.last_sync)
                                  : "à synchroniser dans Intégrations"),
                          )
                          .join(" / ")
                      : "Connectez GitHub dans Intégrations pour ajouter les releases, PR et commits à la rédaction."}
                  </p>
                </div>
              )}
              <label>
                Titre
                <input
                  autoFocus
                  value={edit.title}
                  maxLength={180}
                  disabled={edit.state === "published" || busy || generating}
                  placeholder="Ce qui change pour vos utilisateurs"
                  onChange={(e) => {
                    setEdit({ ...edit, title: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                Version <span className="subtle">facultatif</span>
                <input
                  value={edit.version}
                  maxLength={60}
                  disabled={edit.state === "published" || busy || generating}
                  placeholder="Ex. v2.4"
                  onChange={(e) => {
                    setEdit({ ...edit, version: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                Annonce
                <textarea
                  rows={11}
                  maxLength={8000}
                  value={edit.body}
                  disabled={edit.state === "published" || busy || generating}
                  placeholder="Quoi de neuf ? Quel bénéfice pour vos utilisateurs ?"
                  onChange={(e) => {
                    setEdit({ ...edit, body: e.target.value });
                    setDirty(true);
                  }}
                />
              </label>
              {(edit.state || "draft") === "draft" && (
                <div className="publication-ai">
                  {generating ? (
                    <AIProgress
                      scope="publication"
                      showLabel
                      fallback={{
                        state: "running",
                        phase: "Préparation de la release note",
                      }}
                    />
                  ) : replaceText ? (
                    <>
                      <span>
                        Remplacer le texte actuel par une nouvelle proposition ?
                      </span>
                      <button
                        className="button"
                        onClick={() => generateDraft(edit)}
                      >
                        Remplacer le texte
                      </button>
                      <button
                        className="button"
                        onClick={() => setReplaceText(false)}
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button
                      className="button"
                      disabled={
                        busy || (!edit.item_ids?.length && !edit.release_id)
                      }
                      onClick={() =>
                        edit.body.trim()
                          ? setReplaceText(true)
                          : generateDraft(edit)
                      }
                    >
                      {edit.sources?.length
                        ? "Régénérer la release note"
                        : "Générer depuis mes sources"}
                    </button>
                  )}
                  <small>
                    {sourceDirty
                      ? "Le périmètre a changé. Régénérez le texte ou adaptez-le avant publication."
                      : "GitHub + notes associées + livraisons · brouillon à relire"}
                  </small>
                </div>
              )}
            </div>
          )}
          {edit.sources?.length > 0 && (
            <details className="release-sources">
              <summary>
                Sources utilisées{" "}
                <span className="count">{edit.sources.length}</span>
              </summary>
              <p>
                Ces informations restent internes et ne figurent pas dans
                l’annonce publique.
              </p>
              {Object.entries(sourceLabels)
                .filter(([key]) => edit.sources.some((s) => s.kind === key))
                .map(([key, label]) => (
                  <div key={key}>
                    <strong>{label}</strong>
                    <ul>
                      {edit.sources
                        .filter((s) => s.kind === key)
                        .map((s) => (
                          <li key={s.id}>{s.title}</li>
                        ))}
                    </ul>
                  </div>
                ))}
            </details>
          )}
          {confirmClose ? (
            <div className="publication-confirm">
              <p>Conserver vos modifications avant de fermer ?</p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await persist();
                    setEdit(null);
                  })
                }
              >
                Enregistrer et fermer
              </button>
              <button
                className="button"
                onClick={() => {
                  setConfirmClose(false);
                  setEdit(null);
                }}
              >
                Abandonner les modifications
              </button>
              <button className="button" onClick={() => setConfirmClose(false)}>
                Continuer la rédaction
              </button>
            </div>
          ) : confirmDelete ? (
            <div className="publication-confirm">
              <p>Supprimer définitivement cette publication ?</p>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await apiRef.current("admin/publications/" + edit.id, {
                      method: "DELETE",
                    });
                    setEdit(null);
                    await refresh();
                  })
                }
              >
                Supprimer définitivement
              </button>
              <button
                className="button"
                onClick={() => setConfirmDelete(false)}
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="publication-actions">
              {(edit.state || "draft") === "draft" ? (
                <>
                  <button
                    className="button"
                    disabled={busy || generating}
                    onClick={() =>
                      run(async () => {
                        await persist();
                      })
                    }
                  >
                    {busy
                      ? "Enregistrement…"
                      : dirty || !edit.id
                        ? "Enregistrer le brouillon"
                        : "Brouillon enregistré"}
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      generating ||
                      !edit.title.trim() ||
                      !edit.body.trim()
                    }
                    onClick={() =>
                      preview ? changeState("published") : setPreview(true)
                    }
                  >
                    {preview
                      ? "Publier cette annonce"
                      : "Relire avant publication"}
                    <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => changeState("draft")}
                >
                  {edit.state === "published"
                    ? "Retirer et modifier"
                    : "Restaurer en brouillon"}
                </button>
              )}
              {edit.id && edit.state !== "archived" && (
                <button
                  className="button"
                  disabled={busy || generating}
                  onClick={() => changeState("archived")}
                >
                  Archiver
                </button>
              )}
              {edit.id && (
                <button
                  className="button"
                  disabled={busy || generating}
                  onClick={() => setConfirmDelete(true)}
                >
                  Supprimer
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
