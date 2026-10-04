import { jwtVerify, createLocalJWKSet } from "npm:jose@6.1.3";
import { teamsAuthentication } from "../_shared/teams-auth.js";
import { receive } from "../_shared/intake.js";
import { persist } from "../_shared/persist.ts";
const authenticate = teamsAuthentication({
  jwtVerify,
  createLocalJWKSet,
  appId: Deno.env.get("BEAM_TEAMS_APP_ID"),
});
Deno.serve((req) => receive(req, { provider: "teams", authenticate, persist }));
