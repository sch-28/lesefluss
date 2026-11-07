import { createFileRoute } from "@tanstack/react-router";
import SpeedTestPage from "@/pages/speed-test";

export const Route = createFileRoute("/speed-test")({
	component: SpeedTestPage,
});
