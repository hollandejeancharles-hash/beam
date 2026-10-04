import { createClient } from "npm:@supabase/supabase-js@2.117.2";
export async function persist(provider: string, event: Record<string, string>) {
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { error } = await client.rpc("beam_receive_intake", {
    p_provider: provider,
    p_external: event.external,
    p_channel: event.channel,
    p_event: event.event,
    p_payload: event,
  });
  if (error) throw new Error("Storage refused");
}
