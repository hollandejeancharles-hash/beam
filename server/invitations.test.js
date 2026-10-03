import test from "node:test";
import assert from "node:assert/strict";
import { invitationCode, invitationLink } from "../shared/invitations.js";
test("Invitation supports share link, Mac deep link and old code without sending token in web URL query", () => {
  const code = "a1".repeat(24);
  assert.equal(invitationCode(code), code);
  assert.equal(invitationCode(invitationLink(code)), code);
  assert.equal(new URL(invitationLink(code)).search, "");
  assert.equal(invitationCode(`beam://join?code=${code}`), code);
  assert.equal(invitationCode(`http://127.0.0.1:5173/#invite=${code}`), code);
  for (const input of [
    "",
    "bad link",
    "a".repeat(47),
    `javascript:alert(1)#invite=${code}`,
    `https://example.test/#invite=../secrets`,
  ])
    assert.equal(invitationCode(input), null);
});
