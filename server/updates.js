import { readFileSync } from "node:fs";
export function compareVersions(a, b) {
  const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(v);
  const x = parse(a),
    y = parse(b);
  if (!x || !y) return null;
  for (let i = 1; i <= 3; i++)
    if (+x[i] !== +y[i]) return Math.sign(+x[i] - +y[i]);
  return (
    Math.sign(
      (x[4] === undefined ? Infinity : +x[4]) -
        (y[4] === undefined ? Infinity : +y[4]),
    ) || 0
  );
}
export function createUpdates(fetcher = fetch) {
  const { version } = JSON.parse(
    readFileSync(new URL("../shared/version.json", import.meta.url)),
  );
  let cache,
    checked = 0;
  return async function check(force = false) {
    if (!force && cache && Date.now() - checked < 6 * 3600000) return cache;
    const response = await fetcher(
      "https://api.github.com/repos/hollandejeancharles-hash/beam/releases?per_page=20",
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw Error(
        "La vérification des mises à jour est indisponible. Réessayez plus tard.",
      );
    const releases = await response.json();
    const release = releases
      .filter(
        (r) =>
          !r.draft &&
          compareVersions(r.tag_name, version) !== null &&
          r.assets?.some((a) => a.name === "Beam-AppleSilicon.dmg"),
      )
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
    checked = Date.now();
    cache = {
      current: version,
      latest: release?.tag_name || version,
      available: !!release && compareVersions(release.tag_name, version) > 0,
      url: release
        ? `https://github.com/hollandejeancharles-hash/beam/releases/tag/${encodeURIComponent(release.tag_name)}`
        : "https://github.com/hollandejeancharles-hash/beam/releases",
      checked: new Date(checked).toISOString(),
    };
    return cache;
  };
}
