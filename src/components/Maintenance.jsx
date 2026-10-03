import React, { useEffect, useState } from "react";
import { ArrowUpRight, FileText, RefreshCw } from "../icons";
export default function Maintenance({ api, onRestore, onWelcome }) {
  const [update, setUpdate] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [message, setMessage] = useState("");
  async function run(task) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api("admin/updates")
      .then(setUpdate)
      .catch(() => {});
  }, []);
  async function download() {
    const snapshot = await api("admin/backup");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `Beam-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      "Sauvegarde téléchargée. Conservez-la dans un endroit privé : elle contient vos notes et documents.",
    );
  }
  return (
    <section className="collaboration-settings maintenance-settings">
      <h3>Votre installation</h3>
      <button className="button" onClick={onWelcome}>
        Revoir le guide de démarrage
      </button>
      <div className="settings-row">
        <div>
          <strong>Mises à jour</strong>
          <p className="modal-copy">
            {update
              ? `Version ${update.current} · ${update.available ? "Nouvelle version disponible" : "À jour"}`
              : "Vérifiez si une nouvelle version est disponible."}
          </p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            run(async () => setUpdate(await api("admin/updates?force=true")))
          }
        >
          <RefreshCw size={14} />
          Vérifier
        </button>
      </div>
      {update?.available && (
        <a
          className="button primary"
          href={update.url}
          target="_blank"
          rel="noreferrer"
        >
          Télécharger {update.latest}
          <ArrowUpRight size={14} />
        </a>
      )}
      <h3>Vos sauvegardes</h3>
      <p className="modal-copy">
        Roadmap, notes, pièces jointes et contexte produit. Les mots de passe,
        sessions et clés de connexion sont exclus. La sauvegarde contient des
        informations privées.
      </p>
      <div className="modal-actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => run(download)}
        >
          <FileText size={14} />
          Exporter une sauvegarde
        </button>
        <label className="button attachment-picker">
          Importer une sauvegarde
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files[0];
              e.target.value = "";
              setPreview(null);
              setFile(null);
              if (f)
                void run(async () => {
                  if (f.size > 150000000)
                    throw Error("Fichier trop volumineux (150 Mo maximum).");
                  const value = JSON.parse(await f.text());
                  const summary = await api("admin/backup/preview", {
                    method: "POST",
                    body: JSON.stringify(value),
                  });
                  setFile(value);
                  setPreview(summary);
                });
            }}
          />
        </label>
      </div>
      {preview && (
        <div className="restore-preview">
          <strong>Vérifier avant de restaurer</strong>
          <p>
            {preview.counts.items || 0} éléments · {preview.counts.notes || 0}{" "}
            notes · {preview.counts.note_attachments || 0} pièces jointes
          </p>
          <p className="modal-copy">
            Cette opération remplace les données locales. Une copie des données
            actuelles sera conservée automatiquement sur ce Mac. Quittez votre
            espace partagé avant de restaurer.
          </p>
          {preview.sharedRoadmap && (
            <p className="modal-copy">
              Cette sauvegarde contient une copie de la roadmap d’équipe. Elle
              sera restaurée comme roadmap locale.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setPreview(null);
              }}
            >
              Annuler
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await api("admin/backup/restore", {
                    method: "POST",
                    body: JSON.stringify(file),
                  });
                  setMessage(r.message + " Copie précédente : " + r.recovery);
                  setPreview(null);
                  setFile(null);
                  await onRestore();
                })
              }
            >
              Restaurer les données locales
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="modal-copy">
          {message}
        </p>
      )}
    </section>
  );
}
