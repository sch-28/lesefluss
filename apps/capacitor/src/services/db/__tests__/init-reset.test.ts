import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbDriver } from "../driver";

const state = vi.hoisted(() => ({
	drivers: [] as DbDriver[],
	migrate: async (_driver: DbDriver) => {},
	deleteWithoutDriver: vi.fn(async () => {}),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: {}, Filesystem: {} }));
vi.mock("@capacitor/preferences", () => ({ Preferences: { clear: async () => {} } }));
vi.mock("../driver", () => ({
	createDriver: async () => {
		const driver = state.drivers.shift();
		if (!driver) throw new Error("no driver left");
		return driver;
	},
	deleteStoreWithoutDriver: state.deleteWithoutDriver,
}));
vi.mock("../migrations", () => ({ runMigrations: (d: DbDriver) => state.migrate(d) }));
vi.mock("../queries/books", () => ({
	backfillAddedAt: async () => {},
	backfillFinishedAt: async () => {},
}));

const { db, initDb, resetAppData } = await import("../index");

function fakeDriver(): DbDriver & { closed: boolean; deleted: boolean } {
	const driver = {
		kind: "opfs" as const,
		closed: false,
		deleted: false,
		open: async () => {},
		close: async () => {
			driver.closed = true;
		},
		deleteDatabase: async () => {
			driver.deleted = true;
		},
		execute: async () => {},
		run: async () => {},
		query: async () => [],
		begin: async () => {},
		commit: async () => {},
		rollback: async () => {},
	};
	return driver;
}

describe("initDb and resetAppData", () => {
	beforeEach(async () => {
		state.drivers = [];
		state.migrate = async () => {};
		state.deleteWithoutDriver.mockClear();
		// Leaves the module with no driver between tests.
		await resetAppData();
		state.deleteWithoutDriver.mockClear();
	});

	it("closes the driver of a failed start and opens a fresh one on retry", async () => {
		const first = fakeDriver();
		const second = fakeDriver();
		state.drivers = [first, second];
		state.migrate = async (d) => {
			if (d === first) throw new Error("migration failed");
		};

		await expect(initDb()).rejects.toThrow("migration failed");
		expect(first.closed).toBe(true);

		await initDb();
		expect(second.closed).toBe(false);
	});

	it("refuses queries until the migrations have run", async () => {
		let finishMigrations = () => {};
		state.drivers = [fakeDriver()];
		state.migrate = () => new Promise<void>((resolve) => (finishMigrations = resolve));

		const starting = initDb();
		await vi.waitFor(() => expect(state.drivers).toHaveLength(0));
		const early = await db.all(sql`SELECT 1`).catch((err: Error) => err);

		finishMigrations();
		await starting;
		expect((early as { cause?: unknown }).cause).toMatchObject({
			message: expect.stringContaining("not initialised"),
		});
		await expect(db.all(sql`SELECT 1`)).resolves.toEqual([]);
	});

	it("resets through the open driver when there is one", async () => {
		const driver = fakeDriver();
		state.drivers = [driver];
		await initDb();

		await resetAppData();

		expect(driver.deleted).toBe(true);
		expect(state.deleteWithoutDriver).not.toHaveBeenCalled();
	});

	it("still deletes the stored database after a start that never got a driver", async () => {
		await expect(initDb()).rejects.toThrow("no driver left");

		await resetAppData();

		expect(state.deleteWithoutDriver).toHaveBeenCalledTimes(1);
	});
});
