import type { BookSummary } from "../../services/reader-bus";
import type { Colors } from "../theme";
import { Button, Frame, IconCog } from "../ui";

interface Props {
	colors: Colors;
	books: BookSummary[];
	onOpen: (bookId: string) => void;
	onOpenSettings: () => void;
}

export function LibraryView({ colors, books, onOpen, onOpenSettings }: Props) {
	return (
		<Frame colors={colors} align="stretch">
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "0 4px",
				}}
			>
				<div style={{ fontSize: 22, color: colors.heading, letterSpacing: 0.5 }}>Library</div>
				<Button colors={colors} variant="ghost" onClick={onOpenSettings} aria-label="Settings">
					<IconCog />
				</Button>
			</div>

			<div
				style={{
					flex: 1,
					overflowY: "auto",
					marginTop: 16,
					display: "grid",
					gridTemplateColumns: "1fr",
					gap: 8,
				}}
			>
				{books.map((b) => {
					const pct = Math.round(b.progress * 100);
					return (
						<button
							type="button"
							key={b.id}
							onClick={() => onOpen(b.id)}
							style={{
								display: "block",
								width: "100%",
								textAlign: "left",
								background: "transparent",
								color: colors.text,
								border: `1px solid ${colors.progressBg}`,
								borderRadius: 8,
								padding: "12px 16px",
								cursor: "pointer",
							}}
						>
							<div style={{ fontSize: 16, color: colors.heading }}>{b.title}</div>
							<div
								style={{
									fontSize: 13,
									color: colors.muted,
									marginTop: 4,
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<span>{b.author ?? "Unknown"}</span>
								{pct > 0 && <span>{pct}%</span>}
							</div>
						</button>
					);
				})}
				{books.length === 0 && (
					<div style={{ color: colors.muted, padding: 24, textAlign: "center" }}>No books yet</div>
				)}
			</div>
		</Frame>
	);
}
