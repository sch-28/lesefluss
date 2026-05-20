import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { ClipboardList, FileText, Link as LinkIcon, type LucideIcon } from "lucide-react";
import type React from "react";

interface ImportSheetProps {
	isOpen: boolean;
	onClose: () => void;
	onPickFile: () => void;
	onPickClipboard: () => void;
	onPickUrl: () => void;
}

type Source = {
	key: "file" | "clipboard" | "url";
	icon: LucideIcon;
	title: string;
	subtitle: string;
};

const SOURCES: Source[] = [
	{
		key: "file",
		icon: FileText,
		title: "Import file",
		subtitle: "TXT, EPUB, HTML, PDF, Markdown",
	},
	{
		key: "clipboard",
		icon: ClipboardList,
		title: "Paste text",
		subtitle: "From clipboard",
	},
	{
		key: "url",
		icon: LinkIcon,
		title: "Import from URL",
		subtitle: "Articles and web novels",
	},
];

const ImportSheet: React.FC<ImportSheetProps> = ({
	isOpen,
	onClose,
	onPickFile,
	onPickClipboard,
	onPickUrl,
}) => {
	const handlers: Record<Source["key"], () => void> = {
		file: onPickFile,
		clipboard: onPickClipboard,
		url: onPickUrl,
	};

	const handlePick = (key: Source["key"]) => {
		onClose();
		handlers[key]();
	};

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Add a book</DrawerTitle>
				</DrawerHeader>
				<div className="flex flex-col px-2 pb-2">
					{SOURCES.map((s) => {
						const Icon = s.icon;
						return (
							<button
								key={s.key}
								type="button"
								onClick={() => handlePick(s.key)}
								className="flex items-center gap-4 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted"
							>
								<Icon className="size-5 shrink-0 text-muted-foreground" />
								<div className="flex flex-col">
									<span className="font-medium text-base text-foreground">{s.title}</span>
									<span className="text-muted-foreground text-sm">{s.subtitle}</span>
								</div>
							</button>
						);
					})}
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default ImportSheet;
