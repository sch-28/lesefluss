import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lesefluss/ui/dialog";
import { cn } from "@lesefluss/ui/utils";
import { Search } from "lucide-react";
import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { paletteOpen } from "../commands/global";
import { formatKey } from "../commands/keys";
import { paletteGroups } from "../commands/palette-results";
import { type Command, useCommands } from "../commands/registry";

const CommandPalette: React.FC = () => {
	const isOpen = paletteOpen.useValue();
	const commands = useCommands();
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const ranCommandRef = useRef(false);
	const listId = useId();

	const groups = useMemo(
		() =>
			isOpen
				? paletteGroups(
						commands.filter((c) => c.when?.() ?? true),
						query,
					)
				: [],
		[isOpen, commands, query],
	);
	const rows = useMemo(() => groups.flatMap((g) => g.commands), [groups]);
	const active = rows[Math.min(activeIndex, rows.length - 1)];

	useEffect(() => {
		if (isOpen) {
			setQuery("");
			setActiveIndex(0);
			ranCommandRef.current = false;
		}
	}, [isOpen]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at the top
	useEffect(() => setActiveIndex(0), [query]);

	useEffect(() => {
		if (!active) return;
		document.getElementById(optionId(listId, active.id))?.scrollIntoView({ block: "nearest" });
	}, [active, listId]);

	const run = (command: Command) => {
		ranCommandRef.current = true;
		paletteOpen.set(false);
		// After the dialog lets go of focus, so a dialog the command opens keeps it.
		setTimeout(command.run, 0);
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (rows.length === 0) return;
			const step = e.key === "ArrowDown" ? 1 : -1;
			setActiveIndex((i) => (Math.min(i, rows.length - 1) + step + rows.length) % rows.length);
		} else if (e.key === "Enter" && active) {
			e.preventDefault();
			run(active);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={paletteOpen.set}>
			<DialogContent
				showCloseButton={false}
				className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
				onCloseAutoFocus={(e) => {
					if (ranCommandRef.current) e.preventDefault();
				}}
				data-testid="command-palette"
			>
				<DialogTitle className="sr-only">Command palette</DialogTitle>
				<DialogDescription className="sr-only">
					Type to filter, arrow keys to choose, Enter to run.
				</DialogDescription>
				<div className="flex items-center gap-2 border-border border-b px-4">
					<Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
					<input
						className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
						placeholder="Type a command or search…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={onKeyDown}
						role="combobox"
						aria-expanded
						aria-controls={listId}
						aria-activedescendant={active ? optionId(listId, active.id) : undefined}
						aria-autocomplete="list"
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
				<div
					id={listId}
					role="listbox"
					aria-label="Commands"
					className="max-h-[60vh] overflow-y-auto p-1.5"
				>
					{rows.length === 0 ? (
						<p className="m-0 px-3 py-6 text-center text-muted-foreground text-sm">
							No commands match “{query.trim()}”
						</p>
					) : (
						groups.map((group) => (
							// biome-ignore lint/a11y/useSemanticElements: a listbox only owns options and groups, not fieldsets
							<div key={group.label} role="group" aria-label={group.label}>
								<div
									className="px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs"
									aria-hidden
								>
									{group.label}
								</div>
								{group.commands.map((command) => (
									<div
										key={command.id}
										id={optionId(listId, command.id)}
										role="option"
										aria-selected={command === active}
										tabIndex={-1}
										className={cn(
											"flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
											command === active && "bg-accent text-accent-foreground",
										)}
										onPointerMove={() => setActiveIndex(rows.indexOf(command))}
										onClick={() => run(command)}
										onKeyDown={onKeyDown}
									>
										<span className="truncate">{command.title}</span>
										{command.keys?.[0] && <KeyChips spec={command.keys[0]} />}
									</div>
								))}
							</div>
						))
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

function optionId(listId: string, commandId: string): string {
	return `${listId}-${commandId}`;
}

export const KeyChips: React.FC<{ spec: string }> = ({ spec }) => (
	<span className="flex shrink-0 gap-1">
		{formatKey(spec).map((chip) => (
			<kbd
				key={chip}
				className="min-w-5 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-sans text-muted-foreground text-xs"
			>
				{chip}
			</kbd>
		))}
	</span>
);

export default CommandPalette;
