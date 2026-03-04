import { MailerSend, EmailParams, Sender, Recipient } from "mailersend";

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

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: system-ui, sans-serif; background: #f5f5f5; margin: 0; padding: 32px 0; }
    .card { background: #fff; max-width: 480px; margin: 0 auto; border-radius: 12px; padding: 40px 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    h1 { font-size: 22px; margin: 0 0 8px; color: #111; }
    p { color: #555; line-height: 1.6; margin: 12px 0; }
    .otp { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111; background: #f0f0f0; border-radius: 8px; padding: 16px 24px; text-align: center; margin: 24px 0; font-family: monospace; }
    .note { font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${subject}</h1>
    <p>Use the code below to ${actionLabel}. It expires in 10 minutes.</p>
    <div class="otp">${otp}</div>
    <p class="note">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

	const text = `Your verification code is: ${otp}\n\nUse it to ${actionLabel}. It expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`;

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
