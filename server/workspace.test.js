import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "./store.js";
import { createIntegrations } from "./integrations.js";
import { createCanvas } from "@napi-rs/canvas";
test("workspace persists identity, validates image and preserves details during name-only updates", async () => {
  const store = createStore(":memory:"),
    integration = createIntegrations(store);
  const image =
    "data:image/png;base64," +
    createCanvas(20, 10).toBuffer("image/png").toString("base64");
  await integration.saveProduct({
    name: " PULS ",
    description: " Produit CMS ",
    image,
  });
  assert.equal(integration.product().name, "PULS");
  assert.equal(integration.product().description, "Produit CMS");
  assert.match(integration.product().image, /^data:image\/png;base64,/);
  await integration.saveProduct({ name: "PULS Studio" });
  assert.equal(integration.product().description, "Produit CMS");
  assert.ok(integration.product().image);
  await assert.rejects(integration.saveProduct({ name: " " }));
  await assert.rejects(
    integration.saveProduct({ name: "PULS", description: "x".repeat(161) }),
  );
  await assert.rejects(
    integration.saveProduct({
      name: "PULS",
      image: "https://example.com/image.png",
    }),
  );
  assert.equal(integration.product().name, "PULS Studio");
  await integration.saveProduct({ name: "PULS", image: null });
  assert.equal(integration.product().image, null);
  store.db.close();
});
