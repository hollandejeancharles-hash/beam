import React, { useEffect, useRef, useState } from "react";
import { Radio, Plus, ArrowRight, Globe, Close, FileText } from "../icons";
import AIProgress from "./AIProgress";
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
  function prepare(item) {
    setEdit({
      item_id: item?.id || null,
      title: item?.title || "",
      body: item?.description || "",
      version: "",
    });
    setPreview(false);
    setDirty(false);
    setConfirmClose(false);
    setConfirmDelete(false);
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
      !rows.some((r) => r.item_id === i.id && r.state !== "archived"),
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
          item_id: edit.item_id,
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
            Nouvelle publication
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
                <p>{row.body}</p>
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
                ? "De la livraison à l’annonce"
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
                ? "Préparez une annonce, expliquez ce qui change pour vos utilisateurs, puis relisez-la avant de la publier."
                : tab === "published"
                  ? "Vos annonces validées apparaîtront ici et dans le portail public."
                  : "Les publications retirées restent accessibles ici."}
          </p>
          {!publicMode && tab === "draft" && (
            <button className="button" onClick={() => prepare(null)}>
              <Plus size={16} />
              Créer un brouillon
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
                {edit.published ? date(edit.published) : "Aperçu · non publié"}
                {edit.version && <span className="pill">{edit.version}</span>}
              </div>
              <h2>{edit.title || "Titre de votre annonce"}</h2>
              <p>
                {edit.body ||
                  "Expliquez ici ce qui change pour vos utilisateurs."}
              </p>
            </article>
          ) : (
            <div className="publication-form">
              {(edit.state || "draft") === "draft" && (
                <label>
                  Élément livré <span className="subtle">facultatif</span>
                  <select
                    disabled={busy || generating}
                    value={edit.item_id || ""}
                    onChange={(e) => {
                      setEdit({ ...edit, item_id: e.target.value || null });
                      setDirty(true);
                    }}
                  >
                    <option value="">Annonce indépendante</option>
                    {items
                      .filter(
                        (i) =>
                          !i.archived &&
                          (i.status === "done" || i.id === edit.item_id),
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
              {linked && (edit.state || "draft") === "draft" && (
                <div className="publication-ai">
                  {generating ? (
                    <AIProgress
                      scope="publication"
                      showLabel
                      fallback={{ state: "running", phase: "Rédaction locale" }}
                    />
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={async () => {
                        setGenerating(true);
                        try {
                          const proposal = await apiRef.current(
                            "admin/publications/generate",
                            {
                              method: "POST",
                              body: JSON.stringify({ item_id: edit.item_id }),
                            },
                          );
                          setEdit((current) => ({ ...current, ...proposal }));
                          setDirty(true);
                        } catch (e) {
                          onError(e.message);
                        } finally {
                          setGenerating(false);
                        }
                      }}
                    >
                      Proposer un texte avec l’IA
                    </button>
                  )}
                  <small>Le texte reste un brouillon à relire.</small>
                </div>
              )}
            </div>
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
