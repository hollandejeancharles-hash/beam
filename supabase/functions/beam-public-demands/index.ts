import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { receivePublic } from "./handler.js";
Deno.serve((req) =>
  receivePublic(req, async (body: any, request: Request) => {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(Deno.env.get("SUPABASE_URL")!, key, {
      auth: { persistSession: false },
    });
    const ip = (request.headers.get("x-forwarded-for") || "unknown")
      .split(",")[0]
      .trim();
    const visitor = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(key + "\0" + ip),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await client.rpc("beam_receive_public", {
      p_portal: body.portal,
      p_request: body.request,
      p_title: body.title,
      p_description: body.description,
      p_visitor: visitor,
      p_origin: body.origin,
    });
    if (error)
      throw new Error(
        error.message.includes("RATE_LIMIT") ? "RATE_LIMIT" : "Storage refused",
      );
  }),
);
