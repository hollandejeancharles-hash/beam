import React, { useEffect, useState } from "react";
export default function NoteImage({ attachment, workspace, onError, onOpen }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const abort = new AbortController();
    let url;
    setSrc(null);
    fetch(`/api/admin/attachments/${attachment.id}`, {
      signal: abort.signal,
      headers: {
        Authorization: "Bearer " + (sessionStorage.getItem("beam_key") || ""),
        "X-Beam-Workspace": workspace || "default",
      },
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Impossible de charger cette image");
        const blob = await r.blob();
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch((e) => {
        if (e.name !== "AbortError") onError?.(e.message);
      });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, workspace]);
  return (
    <figure className="note-inline-image">
      {src ? (
        <button type="button" onClick={onOpen} title="Télécharger l’image">
          <img src={src} alt={attachment.name} loading="lazy" />
        </button>
      ) : (
        <span>Chargement de l’image…</span>
      )}
      <figcaption>{attachment.name}</figcaption>
    </figure>
  );
}
export function DraftImages({ files }) {
  const [images, setImages] = useState([]);
  useEffect(() => {
    const next = files
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    setImages(next);
    return () => next.forEach((i) => URL.revokeObjectURL(i.url));
  }, [files]);
  return (
    <div className="note-draft-images">
      {images.map((i) => (
        <figure className="note-inline-image" key={i.url}>
          <img src={i.url} alt={i.name} />
          <figcaption>{i.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}
