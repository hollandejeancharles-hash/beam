export function invitationCode(value) {
  const input = String(value || "").trim();
  if (/^[a-f0-9]{48}$/i.test(input)) return input.toLowerCase();
  try {
    const url = new URL(input);
    if (!["http:", "https:", "beam:"].includes(url.protocol)) return null;
    const code =
      new URLSearchParams(url.hash.slice(1)).get("invite") ||
      url.searchParams.get("code");
    return /^[a-f0-9]{48}$/i.test(code || "") ? code.toLowerCase() : null;
  } catch {
    return null;
  }
}
export const invitationLink = (code) =>
  `https://hollandejeancharles-hash.github.io/beam/#invite=${encodeURIComponent(code)}`;
