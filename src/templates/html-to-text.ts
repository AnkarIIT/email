/**
 * Minimal HTML → plain-text conversion for the accessibility and
 * deliverability fallback. Not a parser — good enough for our
 * transactional templates (and honest markup in general).
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(h[1-6]|p|div|tr|li|table|blockquote)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, text: string) => {
      // Duplicated URL is noise when it repeats the label verbatim.
      const label = stripTags(text).trim();
      return label && label !== href ? `${label}: ${href}` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}
