import { receive, verifySlack } from "../_shared/intake.js";
import { persist } from "../_shared/persist.ts";
Deno.serve((req) =>
  receive(req, {
    provider: "slack",
    persist,
    authenticate: (raw, headers) =>
      verifySlack(raw, headers, Deno.env.get("BEAM_SLACK_SIGNING_SECRET")),
  }),
);
