import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/order/")({
	loader: () => {
		throw redirect({ to: "/device", statusCode: 301 });
	},
	component: () => null,
});
