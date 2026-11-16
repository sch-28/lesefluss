// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => {
	const conn = {
		open: vi.fn(async () => {}),
		run: vi.fn(async () => ({})),
		query: vi.fn(async () => ({ values: [{ a: 1 }] })),
		execute: vi.fn(async () => ({})),
		beginTransaction: vi.fn(async () => ({})),
		commitTransaction: vi.fn(async () => ({})),
		rollbackTransaction: vi.fn(async () => ({})),
	};
	return {
		conn,
		connection: {
			checkConnectionsConsistency: vi.fn(async () => ({})),
			createConnection: vi.fn(async () => conn),
			closeConnection: vi.fn(async () => {}),
			isDatabase: vi.fn(async () => ({ result: true })),
		},
		deleteDatabase: vi.fn(async () => {}),
	};
});

vi.mock("@capacitor-community/sqlite", () => ({
	CapacitorSQLite: { deleteDatabase: plugin.deleteDatabase },
	SQLiteConnection: vi.fn(function SQLiteConnection() {
		return plugin.connection;
	}),
}));

const { createCapacitorDriver } = await import("../native");

describe("createCapacitorDriver", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("opens lesefluss.db with the same plugin calls as before the driver", async () => {
		const driver = createCapacitorDriver("native");
		await driver.open();

		expect(plugin.connection.checkConnectionsConsistency).toHaveBeenCalled();
		expect(plugin.connection.createConnection).toHaveBeenCalledWith(
			"lesefluss.db",
			false,
			"no-encryption",
			1,
			false,
		);
		expect(plugin.conn.open).toHaveBeenCalled();
	});

	it("lets the plugin wrap a run in its own transaction only outside begin/commit", async () => {
		const driver = createCapacitorDriver("native");
		await driver.open();

		await driver.run("UPDATE a SET b = ?", [1]);
		await driver.begin();
		await driver.run("INSERT INTO a VALUES (?)", [2]);
		await driver.commit();
		await driver.run("DELETE FROM a");

		expect(plugin.conn.run.mock.calls).toEqual([
			["UPDATE a SET b = ?", [1], true],
			["INSERT INTO a VALUES (?)", [2], false],
			["DELETE FROM a", [], true],
		]);
	});

	it("runs DDL without the plugin's transaction wrapper and returns query rows", async () => {
		const driver = createCapacitorDriver("native");
		await driver.open();

		await driver.execute("CREATE TABLE a (b)");
		expect(plugin.conn.execute).toHaveBeenCalledWith("CREATE TABLE a (b)", false);
		expect(await driver.query("SELECT 1")).toEqual([{ a: 1 }]);
	});

	it("closes the connection before deleting the database", async () => {
		const driver = createCapacitorDriver("native");
		await driver.open();
		await driver.deleteDatabase();

		expect(plugin.connection.closeConnection).toHaveBeenCalledWith("lesefluss.db", false);
		expect(plugin.deleteDatabase).toHaveBeenCalledWith({ database: "lesefluss.db" });
		expect(plugin.connection.closeConnection.mock.invocationCallOrder[0]).toBeLessThan(
			plugin.deleteDatabase.mock.invocationCallOrder[0],
		);
	});

	it("releases the plugin connection when opening fails, so a retry can create it again", async () => {
		plugin.conn.open.mockRejectedValueOnce(new Error("locked"));
		const driver = createCapacitorDriver("native");

		await expect(driver.open()).rejects.toThrow("locked");
		expect(plugin.connection.closeConnection).toHaveBeenCalledWith("lesefluss.db", false);
	});
});
