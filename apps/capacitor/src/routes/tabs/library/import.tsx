import { createFileRoute } from "@tanstack/react-router";
import BookImportPage from "@/pages/library/book-import-page";

export const Route = createFileRoute("/tabs/library/import")({
	component: BookImportPage,
});
