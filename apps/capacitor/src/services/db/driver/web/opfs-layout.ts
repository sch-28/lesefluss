/**
 * OPFS layout of the web build. The SQLite pool owns `/lesefluss/sahpool`
 * (every file in it is managed by the VFS); other stores (original EPUBs,
 * image blobs) go next to it under `/lesefluss`, never inside it.
 */
const OPFS_ROOT_DIR = "lesefluss";
export const SAHPOOL_DIRECTORY = `/${OPFS_ROOT_DIR}/sahpool`;
export const SAHPOOL_VFS_NAME = "lesefluss-sahpool";
export const OPFS_DB_FILE = "/leseflussSQLite.db";

/**
 * Exists once the OPFS database is the library's real store: written after a
 * verified move from the legacy store, or before a new user's first write. While
 * it is missing, the legacy IndexedDB store is the source of truth.
 */
const ACTIVE_MARKER = "opfs-active";

export function hasOpfsApi(): boolean {
	return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

async function rootDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
	const opfs = await navigator.storage.getDirectory();
	try {
		return await opfs.getDirectoryHandle(OPFS_ROOT_DIR, { create });
	} catch (err) {
		if ((err as DOMException).name === "NotFoundError") return null;
		throw err;
	}
}

export async function hasActiveMarker(): Promise<boolean> {
	const dir = await rootDir(false);
	if (!dir) return false;
	try {
		await dir.getFileHandle(ACTIVE_MARKER);
		return true;
	} catch (err) {
		if ((err as DOMException).name === "NotFoundError") return false;
		throw err;
	}
}

export async function writeActiveMarker(): Promise<void> {
	const dir = await rootDir(true);
	await dir?.getFileHandle(ACTIVE_MARKER, { create: true });
}

/** Removes the whole `/lesefluss` directory: the database pool and the marker. */
export async function removeOpfsRoot(): Promise<void> {
	const opfs = await navigator.storage.getDirectory();
	try {
		await opfs.removeEntry(OPFS_ROOT_DIR, { recursive: true });
	} catch (err) {
		if ((err as DOMException).name !== "NotFoundError") throw err;
	}
}
