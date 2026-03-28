<script lang="ts">
	import { Html, Head, Body, Container, Section, Heading, Text, Hr, Preview } from 'hibachi';

	let { subject, actionLabel, otp }: { subject: string; actionLabel: string; otp: string } =
		$props();
</script>

<Html lang="en">
	<Head />
	<Preview preview="Your verification code is: {otp}" />
	<Body
		style={{
			fontFamily: "system-ui, sans-serif",
			background: "#f5f5f5",
			margin: "0",
			padding: "32px 0",
		}}
	>
		<Container
			style={{
				background: "#fff",
				maxWidth: "480px",
				margin: "0 auto",
				borderRadius: "12px",
				padding: "40px 32px",
				boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
			}}
		>
			<Section>
				<Heading
					as="h1"
					style={{
						fontSize: "22px",
						margin: "0 0 8px",
						color: "#111",
					}}
				>
					{subject}
				</Heading>

				<Text style={{ color: "#555", lineHeight: "1.6", margin: "12px 0" }}>
					Use the code below to {actionLabel}. It expires in 10 minutes.
				</Text>

				<Text
					style={{
						fontSize: "36px",
						fontWeight: "700",
						letterSpacing: "8px",
						color: "#111",
						background: "#f0f0f0",
						borderRadius: "8px",
						padding: "16px 24px",
						textAlign: "center",
						margin: "24px 0",
						fontFamily: "monospace",
					}}
				>
					{otp}
				</Text>

				<Text style={{ fontSize: "13px", color: "#888", margin: "12px 0" }}>
					If you didn't request this, you can safely ignore this email.
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
