import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) throw new Error("RESEND_API_KEY is required");
const resend = new Resend(apiKey);

const FROM = "Lesefluss <hello@lesefluss.app>";

type MailInput = {
	to: string;
	subject: string;
	html: string;
};

export async function sendMail({ to, subject, html }: MailInput) {
	const { error } = await resend.emails.send({ from: FROM, to, subject, html });
	if (error) {
		console.error("mailer: send failed", { subject, error });
		throw new Error(`Email send failed: ${error.message}`);
	}
}

const wrap = (title: string, body: string) => `
<!doctype html>
<html>
	<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f6f6f6; margin: 0; padding: 32px;">
		<table role="presentation" style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px;">
			<tr><td>
				<h1 style="margin: 0 0 16px; font-size: 20px; color: #111;">${title}</h1>
				${body}
				<p style="margin-top: 32px; font-size: 12px; color: #888;">Sent by Lesefluss · If you didn't expect this email, you can safely ignore it.</p>
			</td></tr>
		</table>
	</body>
</html>`;

const cta = (url: string, label: string) =>
	`<p style="margin: 16px 0 24px;"><a href="${url}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">${label}</a></p>
	<p style="font-size: 13px; color: #666;">Or copy this link: <br><span style="word-break: break-all;">${url}</span></p>`;

export const verificationEmail = (url: string) => ({
	subject: "Verify your Lesefluss email",
	html: wrap(
		"Verify your email",
		`<p style="color:#333;">Welcome to Lesefluss — confirm your email to finish setting up your account.</p>${cta(url, "Verify email")}`,
	),
});

export const passwordResetEmail = (url: string) => ({
	subject: "Reset your Lesefluss password",
	html: wrap(
		"Reset your password",
		`<p style="color:#333;">We received a request to reset your password. This link expires shortly.</p>${cta(url, "Reset password")}`,
	),
});
