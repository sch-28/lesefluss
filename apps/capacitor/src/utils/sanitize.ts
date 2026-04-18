import DOMPurify from "dompurify";

/**
 * Sanitize untrusted HTML (e.g. Standard Ebooks descriptions) before rendering
 * via `dangerouslySetInnerHTML`. Uses DOMPurify's safe defaults — keeps common
 * inline markup (p, em, strong, a, lists) and strips scripts, on* handlers,
 * iframes, etc.
 */
export function sanitizeHtml(dirty: string): string {
	return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
