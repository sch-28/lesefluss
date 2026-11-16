import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { cn } from "@lesefluss/ui/utils";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useBackHandler } from "../../../hooks/use-back-handler";
import type { Book } from "../../../services/db/schema";
import { isDangerAction, statusChoices } from "./book-action-items";
import { RatingInput } from "./rating-input";
import type { BookActionEntry } from "./use-book-actions";

type Props = {
	book: Book | null;
	entries: BookActionEntry[];
	onClose: () => void;
};

type Page = "main" | "status" | "rate";

const ROW =
	"flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-base transition-colors hover:bg-muted disabled:opacity-50";

/** The book menu as a bottom sheet, with Set status and Rate as pages of it. */
export const BookActionsSheet: React.FC<Props> = ({ book, entries, onClose }) => {
	const [page, setPage] = useState<Page>("main");
	// The menu's book is a snapshot, so the stars follow the taps here.
	const [rating, setRating] = useState<number | null>(null);
	const held = useRef<{ book: Book; entries: BookActionEntry[] } | null>(null);
	if (book) held.current = { book, entries };
	const shown = book ? { book, entries } : held.current;
	const isOpen = book !== null;

	useEffect(() => {
		if (!isOpen) setPage("main");
	}, [isOpen]);
	// Registered after the drawer's own handler, so back leaves the page first.
	useBackHandler(isOpen && page !== "main", () => setPage("main"));

	const status = shown?.entries.find((e) => e.kind === "status");
	const rate = shown?.entries.find((e) => e.kind === "rate");

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent data-testid="book-actions-sheet">
				<DrawerHeader>
					<DrawerTitle className="flex items-center gap-2 truncate">
						{page !== "main" && (
							<button
								type="button"
								aria-label="Back"
								onClick={() => setPage("main")}
								className="-my-2 -ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
							>
								<ChevronLeft className="size-5" />
							</button>
						)}
						<span className="truncate">
							{page === "status" ? "Set status" : page === "rate" ? "Rate" : shown?.book.title}
						</span>
					</DrawerTitle>
				</DrawerHeader>
				{page === "status" && status?.kind === "status" ? (
					<div className="flex flex-col p-2" role="radiogroup" aria-label="Status">
						{statusChoices(status.stored, status.automatic).map((choice) => (
							// biome-ignore lint/a11y/useSemanticElements: a styled choice row; a native radio input cannot hold the icon and check layout
							<button
								key={choice.label}
								type="button"
								role="radio"
								aria-checked={choice.isCurrent}
								onClick={() => {
									status.onPick(choice.status);
									onClose();
								}}
								className={ROW}
							>
								<span className="flex-1 truncate">{choice.label}</span>
								{choice.isCurrent && <Check className="size-5 shrink-0 text-primary" />}
							</button>
						))}
					</div>
				) : page === "rate" && rate?.kind === "rate" ? (
					<div className="flex flex-col gap-3 p-4">
						<RatingInput
							rating={rating}
							onRate={(next) => {
								setRating(next);
								rate.onRate(next);
							}}
						/>
						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1"
								disabled={rating === null}
								onClick={() => {
									setRating(null);
									rate.onRate(null);
								}}
							>
								No rating
							</Button>
							<Button className="flex-1" onClick={onClose}>
								Done
							</Button>
						</div>
					</div>
				) : (
					<div className="flex flex-col p-2">
						{shown?.entries.map((entry, i, entries) => {
							const Icon = entry.icon;
							const isPage = entry.kind !== "item";
							const startsDanger =
								i > 0 && isDangerAction(entry.id) && !isDangerAction(entries[i - 1]?.id ?? "");
							return (
								<Fragment key={entry.id}>
									{startsDanger && <hr className="my-1 border-border" />}
									<button
										type="button"
										disabled={entry.kind === "item" && entry.disabled}
										onClick={() => {
											if (entry.kind === "status") return setPage("status");
											if (entry.kind === "rate") {
												setRating(entry.rating);
												return setPage("rate");
											}
											onClose();
											entry.onSelect();
										}}
										className={cn(
											ROW,
											entry.kind === "item" && entry.destructive
												? "text-destructive"
												: "text-foreground",
										)}
									>
										<Icon className="size-5 shrink-0" />
										<span className="flex-1 truncate">{entry.label}</span>
										{isPage && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
									</button>
								</Fragment>
							);
						})}
					</div>
				)}
			</DrawerContent>
		</Drawer>
	);
};
