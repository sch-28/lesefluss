/** What `prepareOpfsStore` found and did, for the console and tests. */
export type StoreOutcome = "existing" | "fresh" | "moved";

export interface OpfsStoreDeps {
	hasMarker(): Promise<boolean>;
	writeMarker(): Promise<void>;
	hasLegacy(): Promise<boolean>;
	readLegacy(): Promise<Uint8Array | undefined>;
	deleteLegacy(): Promise<void>;
	hasDbFile(): boolean;
	/** Writes the bytes as the OPFS database; resolves to the bytes written. */
	importDb(bytes: Uint8Array): Promise<number>;
	unlinkDb(): void;
	/** Opens the imported database and throws unless it is intact. */
	verify(): Promise<void>;
	warn(message: string, err?: unknown): void;
}

/**
 * Makes the OPFS database the library's store, moving the legacy IndexedDB store
 * over first if there is one. Confirm-then-delete: the legacy store is deleted only
 * after the imported copy passed `verify` and the marker says OPFS is the store,
 * so a failure at any step leaves the legacy store untouched for the fallback, and
 * the next start tries again.
 *
 * Without the marker the legacy store is the source of truth: a database file in
 * the pool is an unfinished move and gets replaced or dropped. With the marker,
 * a legacy store is never imported again, so it cannot overwrite newer data; a
 * leftover one is deleted.
 */
export async function prepareOpfsStore(deps: OpfsStoreDeps): Promise<StoreOutcome> {
	if (await deps.hasMarker()) {
		// Left over from a move whose delete failed; safe to delete now the marker is set.
		if (await deps.hasLegacy().catch(() => false)) {
			await deps.deleteLegacy().catch((err) => deps.warn("could not delete the legacy store", err));
		}
		return "existing";
	}

	if (!(await deps.hasLegacy())) {
		if (deps.hasDbFile()) deps.unlinkDb();
		await deps.writeMarker();
		return "fresh";
	}

	try {
		const bytes = await deps.readLegacy();
		if (!bytes) throw new Error("Legacy store vanished during the move");
		const written = await deps.importDb(bytes);
		if (written !== bytes.byteLength) {
			throw new Error(`Imported ${written} of ${bytes.byteLength} bytes`);
		}
		await deps.verify();
		await deps.writeMarker();
	} catch (err) {
		try {
			deps.unlinkDb();
		} catch (unlinkErr) {
			deps.warn("could not drop the half-moved database", unlinkErr);
		}
		throw err;
	}

	try {
		await deps.deleteLegacy();
	} catch (err) {
		// The marker already makes OPFS the store; the legacy copy is only wasted space now.
		deps.warn("moved, but could not delete the legacy store", err);
	}
	return "moved";
}
