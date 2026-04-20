import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "~/lib/get-session";

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
		return { session };
	},
	component: () => <Outlet />,
});
