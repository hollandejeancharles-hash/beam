import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "./store.js";
import { createNotes } from "./notes.js";
import { createAttachments } from "./attachments.js";
import { createBackups } from "./backups.js";
const item = {
  title: "Feature",
  description: "Context",
  category: "Éditeur",
  priority: "medium",
  status: "planned",
  visibility: "private",
  quarter: "T4 2026",
};
function fixture(options = {}) {
  const store = createStore(":memory:");
  const notes = createNotes(store);
  createAttachments(store);
  const backup = createBackups(store, {
    directory: mkdtempSync(join(tmpdir(), "beam-backup-")),
    ...options,
  });
  return { store, notes, backup };
}
test("Backup round trip preserves note attachments and excludes sessions and secrets", () => {
  const f = fixture();
  try {
    f.store.save(item);
    const n = f.notes.save({ text: "Une note privée" });
    f.store.db
      .prepare("INSERT INTO note_attachments VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "a",
        n.id,
        "business.pdf",
        "application/pdf",
        Buffer.from("PDFbytes"),
        "Business context",
        "[]",
        1,
      );
    f.store.db
      .prepare("INSERT INTO metadata VALUES(?,?)")
      .run("beam_shared_session", "secret");
    const file = f.backup.snapshot();
    assert.ok(!JSON.stringify(file).includes("secret"));
    f.store.save({ ...item, title: "Later" });
    const r = f.backup.restore(file);
    assert.equal(f.store.list().length, 1);
    assert.equal(f.notes.list()[0].text, "Une note privée");
    assert.equal(
      Buffer.from(
        f.store.db.prepare("SELECT bytes FROM note_attachments").get().bytes,
      ).toString(),
      "PDFbytes",
    );
    assert.equal(JSON.parse(readFileSync(r.recovery)).data.items.length, 2);
    assert.equal(
      f.store.db
        .prepare("SELECT value FROM metadata WHERE key='beam_shared_session'")
        .get().value,
      "secret",
    );
  } finally {
    f.store.db.close();
  }
});
test("Malformed import rolls back roadmap and notes without data loss", () => {
  const f = fixture();
  try {
    f.store.save(item);
    f.notes.save({ text: "Keep" });
    const file = f.backup.snapshot();
    file.data.items[0].title = null;
    assert.throws(() => f.backup.restore(file));
    assert.equal(f.store.list()[0].title, "Feature");
    assert.equal(f.notes.list()[0].text, "Keep");
    const malicious = f.backup.snapshot();
    malicious.metadata.beam_shared_session = "evil";
    assert.throws(() => f.backup.inspect(malicious));
  } finally {
    f.store.db.close();
  }
});
test("Shared workspace and active AI cannot be overwritten by a local restore", () => {
  for (const options of [{ active: () => true }, { busy: () => true }]) {
    const f = fixture(options);
    try {
      f.store.save(item);
      assert.throws(() => f.backup.restore(f.backup.snapshot()));
      assert.equal(f.store.list().length, 1);
    } finally {
      f.store.db.close();
    }
  }
});
test("Backup rejects unexpected tables and cannot import session metadata", () => {
  const f = fixture();
  try {
    const b = f.backup.snapshot();
    b.data.metadata = [{ key: "beam_shared_session", value: "injected" }];
    assert.throws(() => f.backup.inspect(b));
    assert.equal(
      f.store.db
        .prepare("SELECT value FROM metadata WHERE key='beam_shared_session'")
        .get(),
      undefined,
    );
  } finally {
    f.store.db.close();
  }
});
