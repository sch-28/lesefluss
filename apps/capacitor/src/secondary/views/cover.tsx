import type { ActiveBook } from "../../services/reader-bus";
import type { Colors } from "../theme";
import { Button, Frame, IconCog } from "../ui";

interface Props {
	colors: Colors;
	book: ActiveBook | null;
	onOpenSettings: () => void;
}

export function CoverView({ colors, book, onOpenSettings }: Props) {
	const pct = book ? Math.round(book.progress * 100) : 0;

	return (
		<Frame colors={colors}>
			<div style={{ position: "absolute", top: 16, right: 16 }}>
				<Button colors={colors} variant="ghost" onClick={onOpenSettings} aria-label="Settings">
					<IconCog />
				</Button>
			</div>

			{book?.coverImage ? (
				<img
					src={book.coverImage}
					alt=""
					style={{
						maxWidth: "min(380px, 40vw)",
						maxHeight: "55vh",
						borderRadius: 8,
						boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
					}}
				/>
			) : (
				<div
					style={{
						width: 240,
						height: 320,
						borderRadius: 8,
						background: colors.progressBg,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: colors.muted,
						fontSize: 32,
						letterSpacing: 1,
					}}
				>
					Lesefluss
				</div>
			)}

			<div style={{ textAlign: "center", maxWidth: "80vw" }}>
				<div style={{ fontSize: 26, color: colors.heading }}>{book?.title ?? ""}</div>
				{book?.author && (
					<div style={{ fontSize: 16, color: colors.muted, marginTop: 6 }}>{book.author}</div>
				)}
				{book && (
					<div style={{ fontSize: 13, color: colors.muted, marginTop: 12, letterSpacing: 0.6 }}>
						{pct}%
					</div>
				)}
			</div>
		</Frame>
	);
}
