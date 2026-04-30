import * as Sentry from "@sentry/node";

type ErrorContext = {
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
};

const dsn = process.env.SENTRY_DSN?.trim();

export const errorTrackingEnabled = Boolean(dsn);

if (dsn) {
	Sentry.init({
		dsn,
		environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
		release: process.env.SENTRY_RELEASE,
		sendDefaultPii: false,
		tracesSampleRate: 0,
		enableLogs: false,
		tracePropagationTargets: [],
		initialScope: {
			tags: {
				service: "catalog",
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
	if (!errorTrackingEnabled) return;
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

export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
	if (!errorTrackingEnabled) return;
	await Sentry.flush(timeoutMs);
}
