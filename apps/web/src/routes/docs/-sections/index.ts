import { connectingDeviceSection } from "./connecting-device";
import { esp32BuildGuideSection } from "./esp32-build-guide";
import { gettingStartedSection } from "./getting-started";
import { importingBooksSection } from "./importing-books";
import type { DocsSection } from "./shared";
import { troubleshootingItems, troubleshootingSection } from "./troubleshooting";

export const docsSections: DocsSection[] = [
	gettingStartedSection,
	importingBooksSection,
	esp32BuildGuideSection,
	connectingDeviceSection,
	troubleshootingSection,
];

export { troubleshootingItems };
export type { DocsSection };
