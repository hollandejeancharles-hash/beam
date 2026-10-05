import { createCanvas, loadImage } from "@napi-rs/canvas";
export function createProfile(store) {
  const db = store.db;
  const get = () =>
    JSON.parse(
      db.prepare("SELECT value FROM metadata WHERE key='user_profile'").get()
        ?.value || '{"name":"","role":"","email":"","photo":null}',
    );
  return {
    get,
    async save(input) {
      const old = get(),
        next = { ...old };
      for (const [key, max] of [
        ["name", 80],
        ["role", 100],
        ["email", 180],
      ]) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== "string" || input[key].length > max)
            throw Error("Informations de profil invalides");
          next[key] = input[key].trim();
        }
      }
      if (input.showTrackedItems !== undefined) {
        if (typeof input.showTrackedItems !== "boolean") throw Error("Préférence invalide");
        next.showTrackedItems = input.showTrackedItems;
      }
      if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))
        throw Error("Adresse email invalide");
      if (input.photo !== undefined) {
        if (input.photo === null) next.photo = null;
        else {
          if (
            typeof input.photo !== "string" ||
            input.photo.length > 700000 ||
            !/^data:image\/(png|jpeg|webp);base64,/.test(input.photo)
          )
            throw Error("Photo invalide");
          const image = await loadImage(
            Buffer.from(input.photo.split(",")[1], "base64"),
          );
          if (image.width * image.height > 4000000)
            throw Error("Photo trop grande");
          const canvas = createCanvas(256, 256),
            ctx = canvas.getContext("2d"),
            size = Math.min(image.width, image.height);
          ctx.drawImage(
            image,
            (image.width - size) / 2,
            (image.height - size) / 2,
            size,
            size,
            0,
            0,
            256,
            256,
          );
          next.photo =
            "data:image/png;base64," +
            canvas.toBuffer("image/png").toString("base64");
        }
      }
      db.prepare(
        "INSERT OR REPLACE INTO metadata VALUES('user_profile',?)",
      ).run(JSON.stringify(next));
      return next;
    },
  };
}
