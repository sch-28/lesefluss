import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@lesefluss/ui/button";
import { Label } from "@lesefluss/ui/label";
import { RadioGroup, RadioGroupItem } from "@lesefluss/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@lesefluss/ui/select";
import { PageHeader } from "@/components/app-shell/page-header";
import { useToast } from "@/components/toast";
import { queryHooks } from "@/services/db/hooks";
import { type ExportFormat, type ExportScope, exportHighlights } from "@/services/export";

export const Route = createFileRoute("/tabs/settings/export")({
	component: ExportSettings,
});

function parseScope(value: string): ExportScope {
	if (value === "all") return { type: "all" };
	if (value.startsWith("series:")) return { type: "series", id: value.slice(7) };
	return { type: "book", id: value.slice(5) };
}

function ExportSettings() {
	const { showToast } = useToast();
	const { data: booksData } = queryHooks.useBooks();
	const { data: seriesList } = queryHooks.useSeriesList();
	const books = booksData?.books;

	const [selectValue, setSelectValue] = useState("all");
	const [format, setFormat] = useState<ExportFormat>("markdown");

	const exportMutation = useMutation({
		mutationFn: () => exportHighlights({ format, scope: parseScope(selectValue) }),
		onSuccess: () => showToast("Highlights exported", "success"),
		onError: (err: Error) => showToast(err.message || "Export failed", "danger"),
	});

	return (
		<div className="bg-background">
			<PageHeader title="Export highlights" icon={Download} />
			<div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-4">
				<div>
					<Label htmlFor="export-scope" className="mb-2 block">
						Source
					</Label>
					<Select value={selectValue} onValueChange={setSelectValue}>
						<SelectTrigger id="export-scope">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All books</SelectItem>
							{books?.map((book) => (
								<SelectItem key={book.id} value={`book:${book.id}`}>
									{book.title}
								</SelectItem>
							))}
							{seriesList?.map((s) => (
								<SelectItem key={s.id} value={`series:${s.id}`}>
									{s.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div>
					<div className="mb-2 font-medium text-foreground text-sm">Format</div>
					<RadioGroup
						value={format}
						onValueChange={(v) => setFormat(v as ExportFormat)}
						className="space-y-2"
					>
						<div className="flex items-center gap-3">
							<RadioGroupItem id="fmt-md" value="markdown" />
							<Label htmlFor="fmt-md">Markdown</Label>
						</div>
						<div className="flex items-center gap-3">
							<RadioGroupItem id="fmt-csv" value="csv" />
							<Label htmlFor="fmt-csv">CSV</Label>
						</div>
					</RadioGroup>
				</div>

				<Button
					onClick={() => exportMutation.mutate()}
					disabled={exportMutation.isPending}
					className="w-full"
				>
					{exportMutation.isPending ? <Loader2 className="animate-spin" /> : null}
					{exportMutation.isPending ? "Exporting..." : "Export"}
				</Button>
			</div>
		</div>
	);
}
