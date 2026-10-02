/** What upstreams see from us: the job and where to reach us, so they can contact rather than block. */
export function userAgent(purpose: string): string {
	return `lesefluss-catalog/1.0 ${purpose} (+https://lesefluss.app)`;
}
