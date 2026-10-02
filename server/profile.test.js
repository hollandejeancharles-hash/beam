import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createProfile } from "./profile.js";
import { createCanvas } from "@napi-rs/canvas";
test("profile validates inputs, normalizes private photos and allows removal", async () => {
  const s = createStore(":memory:"),
    p = createProfile(s);
  const img = createCanvas(20, 10).toBuffer("image/png").toString("base64");
  await p.save({
    name: " Marie ",
    role: "PO",
    email: "marie@example.com",
    photo: "data:image/png;base64," + img,
  });
  assert.equal(p.get().name, "Marie");
  assert.match(p.get().photo, /^data:image\/png;base64,/);
  await assert.rejects(p.save({ email: "invalid" }));
  await assert.rejects(p.save({ photo: "https://external.example/image" }));
  assert.equal(p.get().email, "marie@example.com");
  await p.save({ photo: null });
  assert.equal(p.get().photo, null);
  s.db.close();
});
