import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { queryHooks } from "@/services/db/hooks";

export const Route = createFileRoute("/")({
	component: RootRedirect,
});

function RootRedirect() {
	const { data: settings, isPending } = queryHooks.useSettings();
	const navigate = useNavigate();
	useEffect(() => {
		if (isPending || !settings) return;
		const target = settings.onboardingCompleted ? "/tabs/library" : "/onboarding";
		navigate({ to: target, replace: true });
	}, [isPending, settings, navigate]);
	return null;
}
