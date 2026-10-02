import { tagLabelFromId } from "./explore-search";

/**
 * Labels seen in API responses this session. A selected tag drops out of the
 * facets that carried its label, so the label has to outlive that response.
 * Fed from query functions, read during render.
 */
const labels = new Map<string, string>();

export function rememberTagLabels(
	tags: readonly { id: string; label: string }[] | undefined,
): void {
	for (const t of tags ?? []) labels.set(t.id, t.label);
}

export function tagLabel(id: string): string {
	return labels.get(id) ?? tagLabelFromId(id);
}
