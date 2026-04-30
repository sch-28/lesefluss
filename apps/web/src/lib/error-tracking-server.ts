import * as Sentry from "@sentry/tanstackstart-react";

let serverInitialized = false;

export function initServerErrorTracking(): void {
	if (serverInitialized) return;
	const dsn = process.env.SENTRY_DSN?.trim();
	if (!dsn) return;

	serverInitialized = true;
	Sentry.init({
		dsn,
		environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
		release: process.env.SENTRY_RELEASE,
		sendDefaultPii: false,
		tracesSampleRate: 0,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		enableLogs: false,
		tracePropagationTargets: [],
		initialScope: {
			tags: {
				service: "web-server",
			},
		},
		beforeSend(event) {
			delete event.user;
			if (event.request) {
				delete event.request.cookies;
				delete event.request.headers;
				delete event.request.query_string;
			}
			return event;
		},
	});
}
