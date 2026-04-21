import { createFileRoute } from "@tanstack/react-router";
import { sendMail } from "~/lib/mailer";

const BETA_CONTACT = "contact@lesefluss.app";

function isGmail(email: string): boolean {
	const normalized = email.trim().toLowerCase();
	return /^[^\s@]+@gmail\.com$/.test(normalized);
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export const Route = createFileRoute("/api/beta-request")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let body: unknown;
				try {
					body = await request.json();
				} catch {
					return Response.json({ error: "Invalid JSON" }, { status: 400 });
				}

				const email =
					body && typeof body === "object" && "email" in body && typeof body.email === "string"
						? body.email.trim()
						: "";

				if (!isGmail(email)) {
					return Response.json(
						{ error: "Please provide a valid @gmail.com address (required for Play Store testing)." },
						{ status: 400 },
					);
				}

				const safeEmail = escapeHtml(email);
				await sendMail({
					to: BETA_CONTACT,
					subject: `Lesefluss beta access request: ${email}`,
					html: `<p>New beta tester request:</p><p><strong>${safeEmail}</strong></p><p>Add this Gmail address to the closed testing program in Play Console.</p>`,
				});

				return Response.json({ ok: true });
			},
		},
	},
});
