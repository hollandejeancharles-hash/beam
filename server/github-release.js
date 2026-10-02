export async function githubReleaseLogs(
  source,
  release,
  base,
  { fetcher = fetch, token } = {},
) {
  const headers = {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };
  const request = async (path) => {
    const response = await fetcher(
      "https://api.github.com/repos/" + source.scope + path,
      { headers, redirect: "error", signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok)
      throw Error(
        `Lecture des logs GitHub refusée (${response.status}). Vérifiez le dépôt et ses accès.`,
      );
    const raw = await response.text();
    if (raw.length > 5_000_000) throw Error("Logs GitHub trop volumineux.");
    return JSON.parse(raw);
  };
  const current = await request(
    "/releases/" + encodeURIComponent(release.external_id),
  );
  if (
    current.draft ||
    current.prerelease ||
    current.tag_name !== release.extra.version
  )
    throw Error(
      "La version GitHub a changé. Synchronisez le dépôt avant de générer.",
    );
  const target = current.tag_name;
  if (
    typeof base !== "string" ||
    !base.trim() ||
    base.length > 160 ||
    base === target
  )
    throw Error(
      "Définissez une version ou un commit de départ différent de la version cible.",
    );
  const start = await request("/commits/" + encodeURIComponent(base)),
    end = await request("/commits/" + encodeURIComponent(target));
  if (
    !/^[a-f0-9]{40}$/.test(start.sha || "") ||
    !/^[a-f0-9]{40}$/.test(end.sha || "")
  )
    throw Error("Tags GitHub non résolus.");
  let commits = [],
    total,
    baseSha,
    headSha;
  for (let page = 1; page <= 5; page++) {
    const data = await request(
      "/compare/" +
        encodeURIComponent(start.sha) +
        "..." +
        encodeURIComponent(end.sha) +
        "?per_page=100&page=" +
        page,
    );
    if (
      !["ahead", "identical"].includes(data.status) ||
      data.merge_base_commit?.sha !== data.base_commit?.sha
    )
      throw Error(
        "La version de départ n’est pas un ancêtre de la version cible. Choisissez une version sur la même branche.",
      );
    if (!Number.isInteger(data.total_commits) || data.total_commits > 500)
      throw Error(
        "Cette version contient trop de commits pour une analyse complète (500 maximum).",
      );
    if (page === 1) {
      total = data.total_commits;
      baseSha = data.base_commit.sha;
      headSha = end.sha;
    } else if (
      total !== data.total_commits ||
      headSha !== end.sha ||
      baseSha !== data.base_commit.sha
    )
      throw Error(
        "Les tags ont changé pendant la lecture. Relancez la génération.",
      );
    commits.push(...(data.commits || []));
    if (commits.length >= total) break;
    if (!data.commits?.length)
      throw Error("Les logs de la version sont incomplets.");
  }
  if (
    commits.length !== total ||
    new Set(commits.map((c) => c.sha)).size !== total
  )
    throw Error("Les logs de la version sont incomplets.");
  if (!commits.length) throw Error("Aucun changement entre ces deux versions.");
  return {
    release_id: release.id,
    source_id: release.source_id,
    version: target,
    base_ref: base,
    base_sha: baseSha,
    head_sha: headSha,
    commits: commits.map((c) => ({ sha: c.sha, message: c.commit.message })),
  };
}
