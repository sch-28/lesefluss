import * as Sentry from "@sentry/tanstackstart-react";
import type { AnyRouter } from "@tanstack/react-router";

type ErrorContext = {
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
};

let browserInitialized = false;

export function initBrowserErrorTracking(router: AnyRouter): void {
	if (router.isServer || browserInitialized) return;
	const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
	if (!dsn) return;

	browserInitialized = true;
	Sentry.init({
		dsn,
		environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
		release: import.meta.env.VITE_SENTRY_RELEASE,
		sendDefaultPii: false,
		tracesSampleRate: 0,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		enableLogs: false,
		tracePropagationTargets: [],
		initialScope: {
			tags: {
				service: "web-browser",
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

export function captureException(error: unknown, context?: ErrorContext): void {
	Sentry.withScope((scope) => {
		for (const [key, value] of Object.entries(context?.tags ?? {})) {
			scope.setTag(key, value);
		}
		for (const [key, value] of Object.entries(context?.extra ?? {})) {
			scope.setExtra(key, value);
		}
		Sentry.captureException(error);
	});
}
