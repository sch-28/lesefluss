import { createFileRoute, redirect } from "@tanstack/react-router";

/** The discussion became a tab of the buddy-read page; older links (inbox, notices) still land here. */
export const Route = createFileRoute("/tabs/social/buddy-read-discussion/$id")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/tabs/social/buddy-read/$id",
			params: { id: params.id },
			search: { tab: "discussion" },
			replace: true,
		});
	},
});
