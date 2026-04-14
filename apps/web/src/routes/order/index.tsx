import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/order/")({
	loader: () => {
		throw redirect({ to: "/device" });
	},
	component: () => null,
});
