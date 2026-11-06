import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lesefluss/ui/dialog";
import type React from "react";
import { useMemo } from "react";
import { shortcutSheetOpen } from "../commands/global";
import { useCommands } from "../commands/registry";
import { shortcutGroups } from "../commands/shortcut-groups";
import { KeyChips } from "./command-palette";

const ShortcutSheet: React.FC = () => {
	const isOpen = shortcutSheetOpen.useValue();
	const commands = useCommands();
	const groups = useMemo(
		() => (isOpen ? shortcutGroups(commands.filter((c) => c.when?.() ?? true)) : []),
		[isOpen, commands],
	);

	return (
		<Dialog open={isOpen} onOpenChange={shortcutSheetOpen.set}>
			<DialogContent
				className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
				data-testid="shortcut-sheet"
			>
				<DialogTitle>Keyboard shortcuts</DialogTitle>
				<DialogDescription className="sr-only">Shortcuts for this screen.</DialogDescription>
				<div className="flex flex-col gap-4">
					{groups.map((group) => (
						<section key={group.label} aria-label={group.label} data-testid="shortcut-group">
							<h3 className="m-0 mb-1.5 font-medium text-muted-foreground text-xs">
								{group.label}
							</h3>
							<ul className="m-0 flex list-none flex-col gap-1 p-0">
								{group.rows.map((row) => (
									<li key={row.id} className="flex items-center justify-between gap-3 text-sm">
										<span className="truncate">{row.title}</span>
										<span className="flex shrink-0 flex-wrap justify-end gap-2">
											{row.keys.map((key) => (
												<KeyChips key={key} spec={key} />
											))}
										</span>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default ShortcutSheet;
