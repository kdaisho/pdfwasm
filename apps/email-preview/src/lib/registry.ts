import type { Component } from "svelte";
import Otp from "../../../api/src/emails/Otp.svelte";

export interface TemplateVariant {
	[key: string]: unknown;
}

export interface TemplateEntry {
	component: Component<Record<string, unknown>>;
	label: string;
	variants: Record<string, TemplateVariant>;
}

export const templates: Record<string, TemplateEntry> = {
	otp: {
		component: Otp as Component<Record<string, unknown>>,
		label: "OTP Code",
		variants: {
			signup: {
				subject: "Confirm your email — PDF Viewer",
				actionLabel: "complete your registration",
				otp: "847291",
			},
			"password-reset": {
				subject: "Reset your passphrase — PDF Viewer",
				actionLabel: "reset your passphrase",
				otp: "503816",
			},
		},
	},
};
