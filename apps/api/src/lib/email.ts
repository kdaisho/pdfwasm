import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";
import { render } from "hibachi";
import Otp from "../emails/Otp.svelte";

const mailerSend = new MailerSend({
	apiKey: process.env.MAILERSEND_API_KEY!,
});

// Accept either a full email or just a domain (e.g. "test-abc.mlsender.net" → "noreply@test-abc.mlsender.net")
const rawFrom = process.env.MAILERSEND_FROM_EMAIL!;
const FROM_EMAIL = rawFrom.includes("@") ? rawFrom : `noreply@${rawFrom}`;
const FROM_NAME = "PDF Viewer";

export async function sendOtpEmail(
	to: string,
	otp: string,
	type: "signup" | "password_reset",
): Promise<void> {
	const subject =
		type === "signup"
			? "Confirm your email — PDF Viewer"
			: "Reset your passphrase — PDF Viewer";

	const actionLabel =
		type === "signup"
			? "complete your registration"
			: "reset your passphrase";

	const props = { subject, actionLabel, otp };
	const html = render({ template: Otp, props });
	const text = render({ template: Otp, props, options: { plainText: true } });

	const emailParams = new EmailParams()
		.setFrom(new Sender(FROM_EMAIL, FROM_NAME))
		.setTo([new Recipient(to)])
		.setSubject(subject)
		.setHtml(html)
		.setText(text);

	try {
		await mailerSend.email.send(emailParams);
	} catch (err) {
		console.error(
			"[email] MailerSend error:",
			JSON.stringify(err, null, 2),
		);
		throw err;
	}
}
