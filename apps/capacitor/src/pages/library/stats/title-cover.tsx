/** A missing cover shows the book's title, so a row of them isn't a wall of "BOOK" stubs. */
export function TitleCover({ title }: { title: string }) {
	return (
		<span className="line-clamp-4 break-words px-1 text-center font-semibold text-[0.55rem] text-muted-foreground leading-tight">
			{title}
		</span>
	);
}
