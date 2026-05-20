import { createFileRoute } from "@tanstack/react-router";
import BookReader from "@/pages/reader";

export const Route = createFileRoute("/tabs/reader/$id")({
	component: BookReader,
});
