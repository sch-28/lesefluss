import { connectingDeviceSection } from "./connecting-device";
import { esp32BuildGuideSection } from "./esp32-build-guide";
import { gettingStartedSection } from "./getting-started";
import { importingBooksSection } from "./importing-books";
import { quickRsvpSection } from "./quick-rsvp";
import type { DocsSection } from "./shared";
import { troubleshootingItems, troubleshootingSection } from "./troubleshooting";

export const docsSections: DocsSection[] = [
	gettingStartedSection,
	importingBooksSection,
	quickRsvpSection,
	esp32BuildGuideSection,
	connectingDeviceSection,
	troubleshootingSection,
];

export type { DocsSection };
export { troubleshootingItems };
