import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/diy/")({
	loader: () => {
		throw redirect({ to: "/device" });
	},
	component: () => null,
});
