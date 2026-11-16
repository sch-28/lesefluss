export type ShareCardFormat = "story" | "square";

export const SHARE_CARD_SIZES: Record<ShareCardFormat, { width: number; height: number }> = {
	story: { width: 1080, height: 1920 },
	square: { width: 1080, height: 1080 },
};

export interface ShareCardTile {
	label: string;
	value: string;
	/** A green delta next to the value, e.g. "+20". */
	delta?: string;
	/** The orange RSVP tile ("Saved by RSVP"). */
	hot?: boolean;
	/** Marks an RSVP figure with a bolt before the label. */
	rsvp?: boolean;
	/** Takes a whole row, label left and value right. */
	wide?: boolean;
}

export type ShareCardData =
	| {
			kind: "book";
			kicker: string;
			title: string;
			author: string | null;
			/** A `data:` or `blob:` image; anything else is treated as no cover. */
			cover: string | null;
			/** A session card's big time; a finished card has none. */
			hero?: string;
			/** Book percent before and after the sitting, drawn as a bar on the cover. */
			progress?: { from: number; to: number };
			tiles: ShareCardTile[];
			handle: string | null;
	  }
	| {
			kind: "speed";
			kicker: string;
			/** Covers for the wall behind the card; empty draws generated ones. */
			covers: string[];
			/** One big figure, or two side by side for a reader of both modes. */
			heroes: ShareCardTile[];
			trend: number[];
			tiles: ShareCardTile[];
			handle: string | null;
	  };

export interface ShareCardOptions {
	format: ShareCardFormat;
	showHandle: boolean;
}

export interface ShareCardImages {
	cover: CanvasImageSource | null;
	covers: CanvasImageSource[];
}

type Ctx = CanvasRenderingContext2D;

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const PAD = 72;
const GAP = 24;
const TILE_H = 176;
const HERO_TILE_H = 250;
const HOT = "#c94b2a";
const DELTA = "#7ee2a8";

function hashHue(text: string): number {
	let h = 0;
	for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
	return h % 360;
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function sizeOf(img: CanvasImageSource): { w: number; h: number } {
	const sized = img as {
		naturalWidth?: number;
		naturalHeight?: number;
		width?: unknown;
		height?: unknown;
	};
	const w = sized.naturalWidth || (typeof sized.width === "number" ? sized.width : 0);
	const h = sized.naturalHeight || (typeof sized.height === "number" ? sized.height : 0);
	return { w: w || 1, h: h || 1 };
}

/** Draws `img` filling the box like CSS `object-fit: cover`. */
function drawCovering(
	ctx: Ctx,
	img: CanvasImageSource,
	x: number,
	y: number,
	w: number,
	h: number,
) {
	const { w: iw, h: ih } = sizeOf(img);
	const scale = Math.max(w / iw, h / ih);
	const sw = w / scale;
	const sh = h / scale;
	ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function setFont(ctx: Ctx, font: string, letterSpacing = "0px"): void {
	ctx.font = font;
	// Older WebViews have no letterSpacing; the text just sits tighter there.
	if ("letterSpacing" in ctx) ctx.letterSpacing = letterSpacing;
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = "";
	for (const word of words) {
		const next = line ? `${line} ${word}` : word;
		if (ctx.measureText(next).width <= maxWidth || !line) {
			line = next;
			continue;
		}
		lines.push(line);
		line = word;
		if (lines.length === maxLines) break;
	}
	if (lines.length < maxLines && line) lines.push(line);
	const consumed = lines.join(" ").split(/\s+/).length;
	if (consumed < words.length || ctx.measureText(lines[lines.length - 1] ?? "").width > maxWidth) {
		let last = lines[lines.length - 1] ?? "";
		while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth)
			last = last.slice(0, -1);
		lines[lines.length - 1] = `${last.trimEnd()}…`;
	}
	return lines;
}

/** The largest font size up to `max` at which `text` fits `maxWidth`. */
function fitSize(ctx: Ctx, text: string, weight: string, max: number, maxWidth: number): number {
	let size = max;
	while (size > 20) {
		setFont(ctx, `${weight} ${size}px ${SANS}`);
		if (ctx.measureText(text).width <= maxWidth) break;
		size -= 4;
	}
	return size;
}

function drawGeneratedCover(ctx: Ctx, title: string, x: number, y: number, w: number, h: number) {
	const hue = hashHue(title);
	const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
	gradient.addColorStop(0, `hsl(${hue} 42% 46%)`);
	gradient.addColorStop(1, `hsl(${(hue + 35) % 360} 48% 16%)`);
	ctx.fillStyle = gradient;
	ctx.fillRect(x, y, w, h);
	const size = Math.max(24, Math.round(w / 8));
	setFont(ctx, `700 ${size}px ${SERIF}`);
	ctx.fillStyle = "rgba(255,255,255,0.92)";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	const lines = wrapLines(ctx, title, w * 0.82, 4);
	lines.forEach((line, i) => {
		ctx.fillText(line, x + w * 0.09, y + h * 0.1 + i * size * 1.1);
	});
}

function drawBookCover(
	ctx: Ctx,
	img: CanvasImageSource | null,
	title: string,
	x: number,
	y: number,
	w: number,
	h: number,
	progress?: { from: number; to: number },
) {
	ctx.save();
	ctx.shadowColor = "rgba(0,0,0,0.55)";
	ctx.shadowBlur = 80;
	ctx.shadowOffsetY = 36;
	roundRectPath(ctx, x, y, w, h, 14);
	ctx.fillStyle = "#222";
	ctx.fill();
	ctx.restore();

	ctx.save();
	roundRectPath(ctx, x, y, w, h, 14);
	ctx.clip();
	if (img) drawCovering(ctx, img, x, y, w, h);
	else drawGeneratedCover(ctx, title, x, y, w, h);
	if (progress) {
		const barH = 24;
		const from = Math.max(0, Math.min(100, progress.from)) / 100;
		const to = Math.max(from, Math.min(100, progress.to) / 100);
		ctx.fillStyle = "rgba(0,0,0,0.45)";
		ctx.fillRect(x, y + h - barH, w, barH);
		ctx.fillStyle = "rgba(255,255,255,0.75)";
		ctx.fillRect(x, y + h - barH, w * from, barH);
		ctx.fillStyle = "#ff7a52";
		ctx.fillRect(x + w * from, y + h - barH, w * (to - from), barH);
	}
	ctx.restore();
}

function drawShade(ctx: Ctx, width: number, height: number, strong: boolean) {
	const shade = ctx.createLinearGradient(0, 0, 0, height);
	if (strong) {
		shade.addColorStop(0, "rgba(14,8,6,0.55)");
		shade.addColorStop(0.55, "rgba(14,8,6,0.82)");
		shade.addColorStop(1, "rgba(14,8,6,0.94)");
	} else {
		shade.addColorStop(0, "rgba(10,6,4,0.15)");
		shade.addColorStop(0.45, "rgba(10,6,4,0.25)");
		shade.addColorStop(1, "rgba(10,6,4,0.72)");
	}
	ctx.fillStyle = shade;
	ctx.fillRect(0, 0, width, height);
}

/** The cover blown up and blurred as the card's colour; a generated gradient without one. */
function drawBackdrop(
	ctx: Ctx,
	img: CanvasImageSource | null,
	seed: string,
	width: number,
	height: number,
) {
	ctx.fillStyle = "#1b1310";
	ctx.fillRect(0, 0, width, height);
	if (!img) {
		const hue = hashHue(seed);
		const gradient = ctx.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, `hsl(${hue} 40% 38%)`);
		gradient.addColorStop(1, `hsl(${(hue + 35) % 360} 45% 12%)`);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
		drawShade(ctx, width, height, false);
		return;
	}
	const canBlur = typeof ctx.filter === "string";
	ctx.save();
	if (canBlur) ctx.filter = "blur(100px) saturate(1.25)";
	drawCovering(ctx, img, -width * 0.3, -height * 0.3, width * 1.6, height * 1.6);
	ctx.restore();
	if (!canBlur) {
		ctx.fillStyle = "rgba(0,0,0,0.4)";
		ctx.fillRect(0, 0, width, height);
	}
	drawShade(ctx, width, height, false);
}

function drawCoverWall(
	ctx: Ctx,
	covers: CanvasImageSource[],
	seed: string,
	width: number,
	height: number,
) {
	ctx.fillStyle = "#1b1310";
	ctx.fillRect(0, 0, width, height);
	const w = 280;
	const h = 420;
	const gap = 40;
	ctx.save();
	ctx.translate(width / 2, height / 2);
	ctx.rotate((-12 * Math.PI) / 180);
	const span = Math.hypot(width, height);
	const cols = Math.ceil(span / (w + gap)) + 1;
	const rows = Math.ceil(span / (h + gap)) + 1;
	let n = 0;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = -span / 2 + c * (w + gap);
			const y = -span / 2 + r * (h + gap);
			const img = covers.length > 0 ? covers[n % covers.length] : null;
			ctx.save();
			roundRectPath(ctx, x, y, w, h, 12);
			ctx.clip();
			if (img) drawCovering(ctx, img, x, y, w, h);
			else drawGeneratedCover(ctx, `${seed}${n}`, x, y, w, h);
			ctx.restore();
			n++;
		}
	}
	ctx.restore();
	drawShade(ctx, width, height, true);
}

function drawBolt(ctx: Ctx, x: number, y: number, size: number) {
	const s = size / 24;
	ctx.beginPath();
	ctx.moveTo(x + 13 * s, y + 2 * s);
	ctx.lineTo(x + 4 * s, y + 14 * s);
	ctx.lineTo(x + 11 * s, y + 14 * s);
	ctx.lineTo(x + 10 * s, y + 22 * s);
	ctx.lineTo(x + 19 * s, y + 10 * s);
	ctx.lineTo(x + 12 * s, y + 10 * s);
	ctx.closePath();
	ctx.fill();
}

function drawLabel(ctx: Ctx, tile: ShareCardTile, x: number, y: number, size: number) {
	setFont(ctx, `600 ${size}px ${SANS}`, "3px");
	ctx.fillStyle = tile.hot ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	let at = x;
	if (tile.rsvp) {
		drawBolt(ctx, at, y - size * 0.95, size * 1.05);
		at += size * 1.15;
	}
	ctx.fillText(tile.label.toUpperCase(), at, y);
}

function drawTile(
	ctx: Ctx,
	tile: ShareCardTile,
	x: number,
	y: number,
	w: number,
	h: number,
	valueMax: number,
) {
	roundRectPath(ctx, x, y, w, h, 40);
	ctx.fillStyle = tile.hot ? HOT : "rgba(255,255,255,0.12)";
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = tile.hot ? "#e0714f" : "rgba(255,255,255,0.16)";
	ctx.stroke();

	const inner = w - 72;
	const labelSize = h > TILE_H ? 34 : 30;
	if (tile.wide) {
		drawLabel(ctx, tile, x + 36, y + h / 2 + labelSize * 0.35, labelSize);
		const size = fitSize(ctx, tile.value, "700", valueMax, inner / 2);
		ctx.fillStyle = "#fff";
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		ctx.fillText(tile.value, x + w - 36, y + h / 2);
		ctx.textAlign = "left";
		return size;
	}
	const deltaSize = Math.round(valueMax * 0.5);
	setFont(ctx, `700 ${deltaSize}px ${SANS}`);
	const deltaWidth = tile.delta ? ctx.measureText(tile.delta).width + 12 : 0;
	const size = fitSize(ctx, tile.value, "700", valueMax, inner - deltaWidth);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	const baseline = y + 36 + size * 0.85;
	ctx.fillText(tile.value, x + 36, baseline);
	if (tile.delta) {
		const valueWidth = ctx.measureText(tile.value).width;
		setFont(ctx, `700 ${deltaSize}px ${SANS}`);
		ctx.fillStyle = DELTA;
		ctx.fillText(tile.delta, x + 36 + valueWidth + 12, baseline - size * 0.3);
	}
	drawLabel(ctx, tile, x + 36, y + h - 36, labelSize);
}

/** Lays tiles out in rows of `cols`, a wide tile on a row of its own. */
function tileRows(tiles: ShareCardTile[], cols: number): ShareCardTile[][] {
	const rows: ShareCardTile[][] = [];
	let row: ShareCardTile[] = [];
	for (const tile of tiles) {
		if (tile.wide) {
			if (row.length > 0) rows.push(row);
			rows.push([tile]);
			row = [];
			continue;
		}
		row.push(tile);
		if (row.length === cols) {
			rows.push(row);
			row = [];
		}
	}
	if (row.length > 0) rows.push(row);
	return rows;
}

function gridHeight(rows: ShareCardTile[][], rowH: number): number {
	return rows.length === 0 ? 0 : rows.length * rowH + (rows.length - 1) * GAP;
}

function drawGrid(
	ctx: Ctx,
	rows: ShareCardTile[][],
	cols: number,
	top: number,
	width: number,
	rowH: number,
	valueMax: number,
) {
	const inner = width - PAD * 2;
	rows.forEach((row, r) => {
		const span = row.length === 1 && row[0].wide ? 1 : cols;
		const w = (inner - GAP * (span - 1)) / span;
		row.forEach((tile, i) => {
			drawTile(ctx, tile, PAD + i * (w + GAP), top + r * (rowH + GAP), w, rowH, valueMax);
		});
	});
}

function drawFooter(
	ctx: Ctx,
	data: ShareCardData,
	opts: ShareCardOptions,
	width: number,
	height: number,
) {
	const baseline = height - 56;
	const mark = 52;
	roundRectPath(ctx, PAD, baseline - mark + 8, mark, mark, 10);
	ctx.fillStyle = "#fef6e4";
	ctx.fill();
	ctx.strokeStyle = "#d9543a";
	ctx.lineWidth = 6;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(PAD + 18, baseline - mark + 18);
	ctx.lineTo(PAD + 18, baseline - 2);
	ctx.lineTo(PAD + 38, baseline - 2);
	ctx.stroke();
	setFont(ctx, `650 44px ${SANS}`);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	ctx.fillText("lesefluss", PAD + mark + 18, baseline);
	if (opts.showHandle && data.handle) {
		setFont(ctx, `500 40px ${SANS}`);
		ctx.fillStyle = "rgba(255,255,255,0.7)";
		ctx.textAlign = "right";
		ctx.fillText(`@${data.handle}`, width - PAD, baseline);
		ctx.textAlign = "left";
	}
}

function drawKicker(ctx: Ctx, text: string, x: number, y: number, align: CanvasTextAlign) {
	setFont(ctx, `700 38px ${SANS}`, "7px");
	ctx.fillStyle = "rgba(255,255,255,0.85)";
	ctx.textAlign = align;
	ctx.textBaseline = "top";
	ctx.fillText(text.toUpperCase(), x, y);
	ctx.textAlign = "left";
}

function tracePath(ctx: Ctx, pts: number[][]) {
	ctx.beginPath();
	for (const [i, [px, py]] of pts.entries()) {
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
}

function drawSpark(ctx: Ctx, values: number[], x: number, y: number, w: number, h: number) {
	if (values.length < 2) return;
	const min = Math.min(...values) - 4;
	const max = Math.max(...values) + 4;
	const pts = values.map((v, i) => [
		x + (i / (values.length - 1)) * w,
		y + h - ((v - min) / (max - min)) * h,
	]);
	tracePath(ctx, pts);
	ctx.lineTo(x + w, y + h);
	ctx.lineTo(x, y + h);
	ctx.closePath();
	ctx.fillStyle = "rgba(255,255,255,0.12)";
	ctx.fill();
	tracePath(ctx, pts);
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 8;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.stroke();
	const [lx, ly] = pts[pts.length - 1];
	ctx.beginPath();
	ctx.arc(lx, ly, 14, 0, Math.PI * 2);
	ctx.fillStyle = "#fff";
	ctx.fill();
}

function drawBookStory(
	ctx: Ctx,
	data: Extract<ShareCardData, { kind: "book" }>,
	img: CanvasImageSource | null,
	width: number,
	height: number,
) {
	const cols = data.hero ? 3 : 2;
	const rows = tileRows(data.tiles, cols);
	const gridTop = height - 140 - gridHeight(rows, TILE_H);
	drawKicker(ctx, data.kicker, width / 2, 80, "center");

	setFont(ctx, `700 84px ${SERIF}`);
	const titleLines = data.hero ? [] : wrapLines(ctx, data.title, width - PAD * 2, 2);
	const textBlock = data.hero
		? 60 + 40 + 200
		: titleLines.length * 94 + (data.author ? 70 : 0) + 20;
	const coverTop = 80 + 38 + 64;
	const room = gridTop - 56 - textBlock - coverTop - 48;
	const coverW = Math.max(240, Math.min(data.hero ? 480 : 600, room / 1.5));
	const coverH = coverW * 1.5;
	drawBookCover(
		ctx,
		img,
		data.title,
		(width - coverW) / 2,
		coverTop,
		coverW,
		coverH,
		data.progress,
	);

	let y = coverTop + coverH + 48;
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	if (data.hero) {
		setFont(ctx, `italic 48px ${SERIF}`);
		ctx.fillStyle = "rgba(255,255,255,0.75)";
		const caption = data.progress ? `${data.title} · ${Math.round(data.progress.to)}%` : data.title;
		ctx.fillText(wrapLines(ctx, caption, width - PAD * 2, 1)[0] ?? "", width / 2, y);
		y += 60 + 40;
		setFont(ctx, `800 192px ${SANS}`, "-4px");
		ctx.fillStyle = "#fff";
		ctx.fillText(data.hero, width / 2, y);
	} else {
		setFont(ctx, `700 84px ${SERIF}`);
		ctx.fillStyle = "#fff";
		for (const line of titleLines) {
			ctx.fillText(line, width / 2, y);
			y += 94;
		}
		if (data.author) {
			setFont(ctx, `italic 48px ${SERIF}`);
			ctx.fillStyle = "rgba(255,255,255,0.75)";
			ctx.fillText(wrapLines(ctx, data.author, width - PAD * 2, 1)[0] ?? "", width / 2, y + 12);
		}
	}
	ctx.textAlign = "left";
	drawGrid(ctx, rows, cols, gridTop, width, TILE_H, 72);
}

function drawBookSquare(
	ctx: Ctx,
	data: Extract<ShareCardData, { kind: "book" }>,
	img: CanvasImageSource | null,
	width: number,
	height: number,
) {
	const rows = tileRows(
		data.tiles.map((t) => ({ ...t, wide: false })),
		4,
	);
	const gridTop = height - 132 - gridHeight(rows, TILE_H);
	const coverBottom = gridTop - 48;
	const coverH = Math.min(600, coverBottom - PAD);
	const coverW = coverH / 1.5;
	drawBookCover(ctx, img, data.title, PAD, coverBottom - coverH, coverW, coverH, data.progress);

	const x = PAD + coverW + 56;
	const textW = width - PAD - x;
	ctx.textAlign = "left";
	ctx.textBaseline = "alphabetic";
	let y = coverBottom - 16;
	if (data.hero) {
		setFont(ctx, `italic 44px ${SERIF}`);
		ctx.fillStyle = "rgba(255,255,255,0.75)";
		const caption = data.progress ? `${data.title} · ${Math.round(data.progress.to)}%` : data.title;
		ctx.fillText(wrapLines(ctx, caption, textW, 1)[0] ?? "", x, y);
		y -= 76;
		const size = fitSize(ctx, data.hero, "800", 176, textW);
		setFont(ctx, `800 ${size}px ${SANS}`, "-3px");
		ctx.fillStyle = "#fff";
		ctx.fillText(data.hero, x, y);
		y -= size + 24;
	} else {
		if (data.author) {
			setFont(ctx, `italic 44px ${SERIF}`);
			ctx.fillStyle = "rgba(255,255,255,0.75)";
			ctx.fillText(wrapLines(ctx, data.author, textW, 1)[0] ?? "", x, y);
			y -= 70;
		}
		setFont(ctx, `700 72px ${SERIF}`);
		ctx.fillStyle = "#fff";
		const lines = wrapLines(ctx, data.title, textW, 3);
		for (let i = lines.length - 1; i >= 0; i--) {
			ctx.fillText(lines[i], x, y);
			y -= 82;
		}
		y += 82 - 72 - 24;
	}
	ctx.save();
	setFont(ctx, `700 34px ${SANS}`, "6px");
	ctx.fillStyle = "rgba(255,255,255,0.85)";
	ctx.textBaseline = "alphabetic";
	ctx.fillText(wrapLines(ctx, data.kicker.toUpperCase(), textW, 1)[0] ?? "", x, y);
	ctx.restore();
	drawGrid(ctx, rows, 4, gridTop, width, TILE_H, 52);
}

function drawSpeed(
	ctx: Ctx,
	data: Extract<ShareCardData, { kind: "speed" }>,
	format: ShareCardFormat,
	width: number,
	height: number,
) {
	const isStory = format === "story";
	const cols = isStory ? 3 : 4;
	const tiles = isStory ? data.tiles : data.tiles.map((t) => ({ ...t, wide: false }));
	const rows = tileRows(tiles, cols);
	const gridTop = height - (isStory ? 140 : 132) - gridHeight(rows, TILE_H);
	if (isStory) drawKicker(ctx, data.kicker, width / 2, 80, "center");
	else drawKicker(ctx, data.kicker, PAD, PAD, "left");

	const sparkH = isStory ? 260 : 0;
	let bottom = gridTop - 48;
	if (isStory && data.trend.length >= 2) {
		drawSpark(ctx, data.trend, PAD + 40, bottom - sparkH, width - PAD * 2 - 80, sparkH);
		bottom -= sparkH + 56;
	}

	if (data.heroes.length >= 2) {
		const w = (width - PAD * 2 - GAP) / 2;
		data.heroes.slice(0, 2).forEach((hero, i) => {
			drawTile(ctx, hero, PAD + i * (w + GAP), bottom - HERO_TILE_H, w, HERO_TILE_H, 136);
		});
	} else if (data.heroes[0]) {
		const hero = data.heroes[0];
		const heroW = isStory ? width - PAD * 2 : (width - PAD * 2) * 0.55;
		const size = fitSize(ctx, hero.value, "800", isStory ? 336 : 300, heroW);
		const x = isStory ? width / 2 : PAD;
		ctx.textAlign = isStory ? "center" : "left";
		setFont(ctx, `700 40px ${SANS}`, "5px");
		const caption = hero.label.toUpperCase();
		ctx.textBaseline = "alphabetic";
		const captionWidth = ctx.measureText(caption).width;
		const deltaWidth = hero.delta ? ctx.measureText(hero.delta).width + 24 : 0;
		const captionY = bottom;
		const captionX = isStory ? width / 2 - (captionWidth + deltaWidth) / 2 : PAD;
		ctx.textAlign = "left";
		ctx.fillStyle = "rgba(255,255,255,0.7)";
		ctx.fillText(caption, captionX, captionY);
		if (hero.delta) {
			ctx.fillStyle = DELTA;
			ctx.fillText(hero.delta, captionX + captionWidth + 24, captionY);
		}
		ctx.textAlign = isStory ? "center" : "left";
		setFont(ctx, `800 ${size}px ${SANS}`, "-8px");
		ctx.fillStyle = "#fff";
		ctx.fillText(hero.value, x, captionY - 56);
		ctx.textAlign = "left";
		if (!isStory && data.trend.length >= 2) {
			drawSpark(ctx, data.trend, width - PAD - 400, captionY - 236, 400, 200);
		}
	}
	drawGrid(ctx, rows, cols, gridTop, width, TILE_H, isStory ? 72 : 52);
}

/** Draws the whole card on `ctx`, which must be the format's size. Pure drawing, no loading. */
export function drawShareCard(
	ctx: Ctx,
	data: ShareCardData,
	opts: ShareCardOptions,
	images: ShareCardImages,
): void {
	const { width, height } = SHARE_CARD_SIZES[opts.format];
	if (data.kind === "book") {
		drawBackdrop(ctx, images.cover, data.title, width, height);
		if (opts.format === "story") drawBookStory(ctx, data, images.cover, width, height);
		else drawBookSquare(ctx, data, images.cover, width, height);
	} else {
		drawCoverWall(ctx, images.covers, data.kicker, width, height);
		drawSpeed(ctx, data, opts.format, width, height);
	}
	drawFooter(ctx, data, opts, width, height);
}

/** Only local images: a remote one would taint the canvas and make it unexportable. */
export function isLocalImage(src: string | null | undefined): src is string {
	return typeof src === "string" && (src.startsWith("data:image/") || src.startsWith("blob:"));
}

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
	if (!isLocalImage(src)) return Promise.resolve(null);
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

async function loadFonts(): Promise<void> {
	const fonts = typeof document !== "undefined" ? document.fonts : undefined;
	if (!fonts) return;
	await Promise.all(
		[`700 84px ${SERIF}`, `italic 48px ${SERIF}`, `800 192px ${SANS}`, `700 72px ${SANS}`].map(
			(f) => fonts.load(f).catch(() => []),
		),
	);
}

/** Renders the card to a PNG. */
export async function renderShareCard(data: ShareCardData, opts: ShareCardOptions): Promise<Blob> {
	const [cover, covers] = await Promise.all([
		loadImage(data.kind === "book" ? data.cover : null),
		Promise.all((data.kind === "speed" ? data.covers : []).slice(0, 12).map(loadImage)),
		loadFonts(),
	]);
	const { width, height } = SHARE_CARD_SIZES[opts.format];
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D is unavailable");
	drawShareCard(ctx, data, opts, {
		cover,
		covers: covers.filter((c): c is HTMLImageElement => c !== null),
	});
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Share card export failed"))),
			"image/png",
		);
	});
}
