export function publicIntake(value) {
  if (!value) return null;
  if (
    typeof value.portal !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.portal,
    )
  )
    throw Error("Portail de demandes invalide.");
  const url = new URL(value.endpoint);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.pathname !== "/functions/v1/beam-public-demands" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("Adresse du portail de demandes invalide.");
  return { portal: value.portal, endpoint: url.href };
}
