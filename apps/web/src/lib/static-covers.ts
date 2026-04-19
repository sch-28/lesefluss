import type { ExploreCover } from "./explore-covers";
import rawCovers from "./static-covers.json";

type RawCover = { id: string; title: string; author: string; file: string };

export const staticCovers: ExploreCover[] = (rawCovers as RawCover[]).map((b) => ({
	id: b.id,
	title: b.title,
	author: b.author,
	coverUrl: `/covers/${b.file}`,
}));
