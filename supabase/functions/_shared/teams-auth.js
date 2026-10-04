// Uses JOSE in production and tests; never trusts issuer-provided discovery URLs.
export function teamsAuthentication({
  jwtVerify,
  createLocalJWKSet,
  appId,
  fetcher = fetch,
}) {
  let keys,
    expires = 0;
  return async (body, headers) => {
    try {
      const token = headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
      if (
        !appId ||
        !token ||
        body.channelId !== "msteams" ||
        typeof body.serviceUrl !== "string" ||
        !body.serviceUrl.startsWith("https://")
      )
        return false;
      if (!keys || Date.now() > expires) {
        const response = await fetcher(
          "https://login.botframework.com/v1/.well-known/keys",
          { signal: AbortSignal.timeout(10000), redirect: "error" },
        );
        if (!response.ok) return false;
        keys = await response.json();
        expires = Date.now() + 3600000;
      }
      const result = await jwtVerify(token, createLocalJWKSet(keys), {
        issuer: "https://api.botframework.com",
        audience: appId,
        algorithms: ["RS256"],
        clockTolerance: 300,
        requiredClaims: ["exp", "nbf", "serviceUrl"],
      });
      const key = keys.keys.find((k) => k.kid === result.protectedHeader.kid);
      return (
        result.payload.serviceUrl === body.serviceUrl &&
        Array.isArray(key?.endorsements) &&
        key.endorsements.includes("msteams")
      );
    } catch {
      expires = 0;
      return false;
    }
  };
}
