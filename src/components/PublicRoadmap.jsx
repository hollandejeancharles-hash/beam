import { Globe, Copy, Lock, ArrowUpRight, ExternalLink } from "lucide-react";
export default function PublicRoadmap({
  product,
  localPreview,
  publicPath,
  api,
  setToast,
}) {
  return (
    <section className="public-roadmap-settings">
      <div className="share-illustration">
        <Globe size={38} />
        <span>Roadmap {product.name}</span>
      </div>
      <p className="modal-copy">
        {localPreview
          ? "Cette prévisualisation s’ouvre uniquement sur ce Mac. Elle ne constitue pas un lien à envoyer à vos utilisateurs."
          : "Vos utilisateurs découvrent les évolutions publiques depuis cette adresse. Les éléments internes restent privés."}
      </p>
      <label>
        {localPreview
          ? "Adresse de prévisualisation locale"
          : "Lien du portail public"}
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
            {localPreview ? "Copier l’adresse locale" : "Copier le lien"}
          </button>
        </div>
      </label>
      {localPreview && (
        <div className="share-publication-help">
          <strong>Pour diffuser votre roadmap</strong>
          <button
            className="button"
            onClick={async () => {
              try {
                const data = await api("admin/public-export");
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "beam-publication.json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setToast("Export public téléchargé");
              } catch (e) {
                setToast(e.message);
              }
            }}
          >
            Exporter pour GitHub Pages <ArrowUpRight size={14} />
          </button>
          <p>
            Exportez puis déposez le fichier beam-publication.json dans le
            dossier public du dépôt Beam. GitHub Pages publiera cette version.
            Seuls les éléments publics du workspace choisi sont exportés. Les
            changements suivants nécessitent une nouvelle publication.
          </p>
          <a
            href="https://github.com/hollandejeancharles-hash/beam/actions"
            target="_blank"
            rel="noreferrer"
            className="button"
          >
            Ouvrir les publications GitHub <ExternalLink size={14} />
          </a>
        </div>
      )}
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
        {localPreview ? "Prévisualiser sur ce Mac" : "Ouvrir le portail"}
        <ExternalLink size={15} />
      </a>
    </section>
  );
}
