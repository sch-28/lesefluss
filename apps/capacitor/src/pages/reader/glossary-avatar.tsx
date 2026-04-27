/**
 * Auto-generated avatar for glossary entries.
 *
 * Color is derived from the label so the user gets a stable visual identity
 * without picking one. They can override the color on the entry card.
 *
 * Initials: first letter of up to the first two whitespace-separated words.
 */

import type React from "react";

/** djb2-ish hash on a string, returns a non-negative 32-bit number. */
function hashString(s: string): number {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

/** Stable HSL hex from a label. Saturation/lightness tuned to read on dark + light themes. */
export function colorFromLabel(label: string): string {
	const hue = hashString(label.toLowerCase()) % 360;
	return hslToHex(hue, 60, 55);
}

/** Up to two-letter initials (uppercase) from the first two words of `label`. */
export function initialsFromLabel(label: string): string {
	const words = label.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0][0]?.toUpperCase() ?? "?";
	return ((words[0][0] ?? "") + (words[1][0] ?? "")).toUpperCase();
}

function hslToHex(h: number, s: number, l: number): string {
	const sN = s / 100;
	const lN = l / 100;
	const c = (1 - Math.abs(2 * lN - 1)) * sN;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lN - c / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	const toHex = (n: number) =>
		Math.round((n + m) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface GlossaryAvatarProps {
	label: string;
	color: string;
	size?: number;
	className?: string;
}

const GlossaryAvatar: React.FC<GlossaryAvatarProps> = ({ label, color, size = 32, className }) => {
	const initials = initialsFromLabel(label);
	return (
		<span
			className={className ? `glossary-avatar ${className}` : "glossary-avatar"}
			style={{
				background: color,
				width: size,
				height: size,
				fontSize: Math.round(size * 0.4),
			}}
			aria-hidden="true"
		>
			{initials}
		</span>
	);
};

export default GlossaryAvatar;
