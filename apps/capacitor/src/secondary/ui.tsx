import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { Colors } from "./theme";

interface FrameProps {
	colors: Colors;
	children: ReactNode;
	align?: "center" | "stretch";
}

/** Full-screen panel with theme bg + safe padding. Content layout is defined by children. */
export function Frame({ colors, children, align = "center" }: FrameProps) {
	return (
		<div
			style={{
				background: colors.bg,
				color: colors.text,
				width: "100vw",
				height: "100vh",
				padding: "32px 40px",
				boxSizing: "border-box",
				fontFamily: "system-ui, sans-serif",
				display: "flex",
				flexDirection: "column",
				alignItems: align === "stretch" ? "stretch" : "center",
				justifyContent: align === "stretch" ? "flex-start" : "space-between",
				position: "relative",
			}}
		>
			{children}
		</div>
	);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	colors: Colors;
	variant?: "outline" | "solid" | "ghost";
}

/** Round icon/text button styled to match the active theme. */
export function Button({ colors, variant = "outline", style, children, ...rest }: ButtonProps) {
	const base: CSSProperties = {
		background: variant === "solid" ? colors.text : "transparent",
		color: variant === "solid" ? colors.bg : colors.text,
		border: variant === "ghost" ? "none" : `1px solid ${colors.muted}`,
		borderRadius: 999,
		width: 56,
		height: 56,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		cursor: "pointer",
		padding: 0,
	};
	return (
		<button type="button" {...rest} style={{ ...base, ...style }}>
			{children}
		</button>
	);
}

const ICON_SIZE = 22;
const stroke = "currentColor";

export function IconPlay({ paused = false }: { paused?: boolean }) {
	if (!paused) {
		// Pause glyph (two bars)
		return (
			<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={stroke}>
				<rect x="6" y="5" width="4" height="14" rx="1" />
				<rect x="14" y="5" width="4" height="14" rx="1" />
			</svg>
		);
	}
	return (
		<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={stroke}>
			<path d="M7 5v14l12-7z" />
		</svg>
	);
}

export function IconPrev() {
	return (
		<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={stroke}>
			<path d="M6 5h2v14H6zM20 5L9 12l11 7z" />
		</svg>
	);
}

export function IconNext() {
	return (
		<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill={stroke}>
			<path d="M16 5h2v14h-2zM4 5l11 7-11 7z" />
		</svg>
	);
}

export function IconCog() {
	return (
		<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6}>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a7.97 7.97 0 0 0 0-6l2-1.5-2-3.5-2.5 1a8 8 0 0 0-5.2-3l-.5-2.5h-4l-.5 2.5a8 8 0 0 0-5.2 3l-2.5-1-2 3.5 2 1.5a7.97 7.97 0 0 0 0 6l-2 1.5 2 3.5 2.5-1a8 8 0 0 0 5.2 3l.5 2.5h4l.5-2.5a8 8 0 0 0 5.2-3l2.5 1 2-3.5z" />
		</svg>
	);
}

export function IconBack() {
	return (
		<svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
			<path d="M15 18l-6-6 6-6" />
		</svg>
	);
}
