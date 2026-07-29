// Va chercher le <title> (ou og:title) d'une page pour remplir
// automatiquement le titre d'un lien quand la personne le laisse vide.
// Best-effort : toute erreur (timeout, page introuvable, pas de titre...)
// renvoie simplement null, jamais d'exception.

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^\[::1\]$/,
];

function isPrivateHost(hostname) {
  return PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(hostname));
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchPageTitle(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isPrivateHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; lequizz-link-preview/1.0)",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const ogMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
    );
    if (ogMatch && ogMatch[1].trim()) return decodeEntities(ogMatch[1]);

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) return decodeEntities(titleMatch[1]);

    return null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { fetchPageTitle };
