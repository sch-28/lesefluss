import { memo, useMemo } from "react";
import { sanitizeHtml } from "../utils/sanitize";

type Props = {
	html: string;
	className?: string;
};

/**
 * Render untrusted HTML (e.g. a Standard Ebooks book description) safely via
 * DOMPurify. Memoized so large descriptions don't re-sanitize on every parent
 * re-render.
 */
const SanitizedDescription = memo<Props>(({ html, className }) => {
	const clean = useMemo(() => sanitizeHtml(html), [html]);
	return (
		<div
			className={className}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via DOMPurify
			dangerouslySetInnerHTML={{ __html: clean }}
		/>
	);
});

SanitizedDescription.displayName = "SanitizedDescription";

export default SanitizedDescription;
