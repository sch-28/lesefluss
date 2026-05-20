import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/pages/onboarding";

export const Route = createFileRoute("/onboarding")({
	component: Onboarding,
});
