import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());

vi.mock("mailersend", () => ({
	MailerSend: vi.fn(function () {
		return { email: { send } };
	}),
	EmailParams: vi.fn(function () {
		return {
			setFrom() {
				return this;
			},
			setTo() {
				return this;
			},
			setSubject() {
				return this;
			},
			setHtml() {
				return this;
			},
			setText() {
				return this;
			},
		};
	}),
	Sender: vi.fn(),
	Recipient: vi.fn(),
}));
vi.mock("hibachi", () => ({ render: () => "" }));
// The API's vitest config has no Svelte plugin to compile the template
vi.mock("../emails/Otp.svelte", () => ({ default: {} }));

vi.stubEnv("MAILERSEND_FROM_EMAIL", "noreply@example.com");

const { sendOtpEmail } = await import("./email.js");

describe("sendOtpEmail", () => {
	beforeEach(() => {
		send.mockReset();
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("prints the code instead of emailing it in development", async () => {
		vi.stubEnv("NODE_ENV", "development");

		await sendOtpEmail("alice@example.com", "305178", "signup");

		expect(send).not.toHaveBeenCalled();
		expect(console.info).toHaveBeenCalledWith(
			"[email] dev mode — signup code for alice@example.com: 305178",
		);
	});

	it.each(["production", "test"])(
		"emails the code and never prints it when NODE_ENV is %s",
		async (env) => {
			vi.stubEnv("NODE_ENV", env);

			await sendOtpEmail("alice@example.com", "305178", "sign_in");

			expect(send).toHaveBeenCalledOnce();
			expect(console.info).not.toHaveBeenCalled();
		},
	);
});
