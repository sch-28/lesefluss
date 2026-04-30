import { createFileRoute } from "@tanstack/react-router";
import { sendMail } from "~/lib/mailer";
import { checkLimit } from "~/lib/rate-limit";

const FEEDBACK_TO = "feedback@lesefluss.app";
const FEEDBACK_TYPES = ["suggestion", "bug", "question", "other"] as const;
const MAX_BODY_BYTES = 12_000;

type FeedbackType = (typeof FEEDBACK_TYPES)[number];

function isValidEmail(email: string): boolean {
	const normalized = email.trim().toLowerCase();
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function getString(body: Record<string, unknown>, key: string): string {
	const value = body[key];
	return typeof value === "string" ? value.trim() : "";
}

function parseFeedbackType(value: string): FeedbackType {
	return FEEDBACK_TYPES.includes(value as FeedbackType) ? (value as FeedbackType) : "other";
}

function getClientKey(request: Request): string {
	const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
	if (cfConnectingIp) return cfConnectingIp;

	// Forwarded headers are client-spoofable unless a trusted edge normalizes them.
	// Cloudflare supplies cf-connecting-ip in production; direct/dev traffic shares a
	// conservative bucket rather than trusting x-forwarded-for/x-real-ip.
	return "unknown";
}

function rejectOversizedRequest(request: Request): Response | null {
	const rawLength = request.headers.get("content-length");
	if (!rawLength) return null;
	const length = Number.parseInt(rawLength, 10);
	if (!Number.isFinite(length) || length <= MAX_BODY_BYTES) return null;
	return Response.json({ error: "Feedback is too long." }, { status: 413 });
}

async function readRequestText(request: Request): Promise<string | Response> {
	const oversized = rejectOversizedRequest(request);
	if (oversized) return oversized;
	if (!request.body) return "";

	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let total = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_BODY_BYTES) {
				await reader.cancel();
				return Response.json({ error: "Feedback is too long." }, { status: 413 });
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}
	return text;
}

function enforceRateLimit(request: Request): Response | null {
	const client = checkLimit(`feedback:${getClientKey(request)}`, {
		max: 5,
		windowMs: 60 * 60_000,
	});
	if (!client.ok) {
		return Response.json(
			{ error: "Too many feedback submissions. Please try again later." },
			{
				status: 429,
				headers: client.retryAfter ? { "Retry-After": String(client.retryAfter) } : undefined,
			},
		);
	}

	const global = checkLimit("feedback:global", { max: 50, windowMs: 60 * 60_000 });
	if (global.ok) return null;
	return Response.json(
		{ error: "Too many feedback submissions. Please try again later." },
		{
			status: 429,
			headers: global.retryAfter ? { "Retry-After": String(global.retryAfter) } : undefined,
		},
	);
}

export const Route = createFileRoute("/api/feedback")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let body: unknown;
				try {
					const text = await readRequestText(request);
					if (text instanceof Response) return text;
					body = JSON.parse(text);
				} catch {
					return Response.json({ error: "Invalid JSON" }, { status: 400 });
				}

				if (!body || typeof body !== "object") {
					return Response.json({ error: "Invalid feedback payload" }, { status: 400 });
				}

				const payload = body as Record<string, unknown>;
				const honeypot = getString(payload, "company");
				if (honeypot) return Response.json({ ok: true });

				const limited = enforceRateLimit(request);
				if (limited) return limited;

				const type = parseFeedbackType(getString(payload, "type"));
				const message = getString(payload, "message");
				const email = getString(payload, "email").toLowerCase();
				const source = getString(payload, "source").slice(0, 80) || "website";

				if (message.length < 10) {
					return Response.json(
						{ error: "Please share a little more detail before sending." },
						{ status: 400 },
					);
				}

				if (message.length > 5000) {
					return Response.json(
						{ error: "Feedback is too long. Please keep it under 5000 characters." },
						{ status: 400 },
					);
				}

				if (email && !isValidEmail(email)) {
					return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
				}

				try {
					await sendMail({
						to: FEEDBACK_TO,
						subject: `Lesefluss feedback: ${type}`,
						html: `<p>New Lesefluss feedback:</p>
						<p><strong>Type:</strong> ${escapeHtml(type)}</p>
						<p><strong>Source:</strong> ${escapeHtml(source)}</p>
						<p><strong>Email:</strong> ${email ? escapeHtml(email) : "Not provided"}</p>
						<hr>
						<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>`,
					});
				} catch (err) {
					console.error("feedback: send failed", err);
					return Response.json(
						{ error: "Feedback could not be sent right now. Please try again later." },
						{ status: 502 },
					);
				}

				return Response.json({ ok: true });
			},
		},
	},
});
