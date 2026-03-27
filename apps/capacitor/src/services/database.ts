import { Capacitor } from "@capacitor/core";
import {
	CapacitorSQLite,
	SQLiteConnection,
	type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import { DEFAULT_SETTINGS } from "../constants/settings";

export interface ESP32Device {
	id: string;
	name: string;
	lastConnected: number;
}

export interface RSVPSettings {
	id: number;
	wpm: number;
	delayComma: number;
	delayPeriod: number;
	accelStart: number;
	accelRate: number;
	xOffset: number;
	wordOffset: number;
	inverse: boolean;
	bleOn: boolean;
	currentSlot: number;
	updatedAt: number;
	devMode: boolean;
}

export interface Book {
	id?: number;
	title: string;
	author?: string;
	content: string;
	position: number;
	slot?: number; // Which ESP32 slot (1-4) if synced
	addedAt: number;
	lastRead?: number;
}

class DatabaseService {
	private sqlite: SQLiteConnection;
	private db: SQLiteDBConnection | null = null;
	private readonly DB_NAME = "rsvp.db";
	private readonly DB_VERSION = 2; // Increment this when schema changes during dev

	constructor() {
		this.sqlite = new SQLiteConnection(CapacitorSQLite);
	}

	async initialize(): Promise<void> {
		try {
			// Check if platform supports SQLite
			const platform = Capacitor.getPlatform();
			if (platform === "web") {
				// Use jeep-sqlite web component for web platform
				await customElements.whenDefined("jeep-sqlite");
				const jeepSqlite = document.createElement("jeep-sqlite");
				document.body.appendChild(jeepSqlite);
				await this.sqlite.initWebStore();
			}

			// DEV MODE: Drop and recreate DB if version changed
			const storedVersion = localStorage.getItem("db_version");
			if (storedVersion && parseInt(storedVersion) !== this.DB_VERSION) {
				console.log(`Database version changed (${storedVersion} → ${this.DB_VERSION}), dropping old database...`);
				try {
					const connExists = await this.sqlite.isConnection(this.DB_NAME, false);
					if (connExists.result) {
						await this.sqlite.closeConnection(this.DB_NAME, false);
					}
				} catch (e) {
					console.log("No existing connection to close");
				}
				
				// Check if database exists and delete it
				try {
					const dbExists = await this.sqlite.isDatabase(this.DB_NAME);
					if (dbExists.result) {
						await CapacitorSQLite.deleteDatabase({ database: this.DB_NAME });
						console.log("Old database dropped");
					}
				} catch (e) {
					console.log("Error deleting database:", e);
				}
			}
			localStorage.setItem("db_version", this.DB_VERSION.toString());

			// Create or open database
			this.db = await this.sqlite.createConnection(
				this.DB_NAME,
				false,
				"no-encryption",
				1,
				false,
			);

			await this.db.open();
			await this.createTables();
			console.log("Database initialized successfully");
		} catch (error) {
			console.error("Failed to initialize database:", error);
			throw error;
		}
	}

	private async createTables(): Promise<void> {
		if (!this.db) throw new Error("Database not initialized");

		const statements = `
      -- Device connection history
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_connected INTEGER NOT NULL
      );

      -- RSVP settings (single row, id=1)
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        wpm INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.WPM},
        delay_comma REAL NOT NULL DEFAULT ${DEFAULT_SETTINGS.DELAY_COMMA},
        delay_period REAL NOT NULL DEFAULT ${DEFAULT_SETTINGS.DELAY_PERIOD},
        accel_start REAL NOT NULL DEFAULT ${DEFAULT_SETTINGS.ACCEL_START},
        accel_rate REAL NOT NULL DEFAULT ${DEFAULT_SETTINGS.ACCEL_RATE},
        x_offset INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.X_OFFSET},
        word_offset INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.WORD_OFFSET},
        inverse INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.INVERSE ? 1 : 0},
        ble_on INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.BLE_ON ? 1 : 0},
        current_slot INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.CURRENT_SLOT},
        dev_mode INTEGER NOT NULL DEFAULT ${DEFAULT_SETTINGS.DEV_MODE ? 1 : 0},
        updated_at INTEGER NOT NULL
      );

      -- Books library
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT,
        content TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        slot INTEGER,
        added_at INTEGER NOT NULL,
        last_read INTEGER
      );

      -- Initialize default settings if not exists
      INSERT OR IGNORE INTO settings (
        id, wpm, delay_comma, delay_period, accel_start, accel_rate,
        x_offset, word_offset, inverse, ble_on, current_slot, dev_mode, updated_at
      ) VALUES (
        1, ${DEFAULT_SETTINGS.WPM}, ${DEFAULT_SETTINGS.DELAY_COMMA}, ${DEFAULT_SETTINGS.DELAY_PERIOD}, 
        ${DEFAULT_SETTINGS.ACCEL_START}, ${DEFAULT_SETTINGS.ACCEL_RATE}, ${DEFAULT_SETTINGS.X_OFFSET}, 
        ${DEFAULT_SETTINGS.WORD_OFFSET}, ${DEFAULT_SETTINGS.INVERSE ? 1 : 0}, ${DEFAULT_SETTINGS.BLE_ON ? 1 : 0}, 
        ${DEFAULT_SETTINGS.CURRENT_SLOT}, ${DEFAULT_SETTINGS.DEV_MODE}, ${Date.now()}
      );
    `;

		await this.db.execute(statements);
	}

	// Device methods
	async saveDevice(device: ESP32Device): Promise<void> {
		if (!this.db) throw new Error("Database not initialized");

		await this.db.run(
			"INSERT OR REPLACE INTO devices (id, name, last_connected) VALUES (?, ?, ?)",
			[device.id, device.name, device.lastConnected],
		);
	}

	async getLastDevice(): Promise<ESP32Device | null> {
		if (!this.db) throw new Error("Database not initialized");

		const result = await this.db.query(
			"SELECT * FROM devices ORDER BY last_connected DESC LIMIT 1",
		);

		if (result.values && result.values.length > 0) {
			const row = result.values[0];
			return {
				id: row.id,
				name: row.name,
				lastConnected: row.last_connected,
			};
		}
		return null;
	}

	// Settings methods
	async getSettings(): Promise<RSVPSettings> {
		if (!this.db) throw new Error("Database not initialized");

		const result = await this.db.query("SELECT * FROM settings WHERE id = 1");

		if (result.values && result.values.length > 0) {
			const row = result.values[0];
			return {
				id: row.id,
				wpm: row.wpm,
				delayComma: row.delay_comma,
				delayPeriod: row.delay_period,
				accelStart: row.accel_start,
				accelRate: row.accel_rate,
				xOffset: row.x_offset,
				wordOffset: row.word_offset,
				inverse: row.inverse === 1,
				bleOn: row.ble_on === 1,
				currentSlot: row.current_slot,
				updatedAt: row.updated_at,
				devMode: row.dev_mode,
			};
		}

		throw new Error("Settings not found");
	}

	async saveSettings(
		settings: Omit<RSVPSettings, "id" | "updatedAt">,
	): Promise<void> {
		if (!this.db) throw new Error("Database not initialized");

		await this.db.run(
			`UPDATE settings SET 
        wpm = ?, delay_comma = ?, delay_period = ?, accel_start = ?, accel_rate = ?,
        x_offset = ?, word_offset = ?, inverse = ?, ble_on = ?, current_slot = ?,
        dev_mode = ?, updated_at = ?
      WHERE id = 1`,
			[
				settings.wpm,
				settings.delayComma,
				settings.delayPeriod,
				settings.accelStart,
				settings.accelRate,
				settings.xOffset,
				settings.wordOffset,
				settings.inverse ? 1 : 0,
				settings.bleOn ? 1 : 0,
				settings.currentSlot,
				settings.devMode ? 1 : 0,
				Date.now(),
			],
		);
	}

	// Book methods (for Phase 2)
	async addBook(book: Omit<Book, "id">): Promise<number> {
		if (!this.db) throw new Error("Database not initialized");

		const result = await this.db.run(
			`INSERT INTO books (title, author, content, position, slot, added_at, last_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				book.title,
				book.author || null,
				book.content,
				book.position,
				book.slot || null,
				book.addedAt,
				book.lastRead || null,
			],
		);

		return result.changes?.lastId || 0;
	}

	async getBooks(): Promise<Book[]> {
		if (!this.db) throw new Error("Database not initialized");

		const result = await this.db.query(
			"SELECT * FROM books ORDER BY last_read DESC, added_at DESC",
		);

		if (result.values) {
			return result.values.map((row) => ({
				id: row.id,
				title: row.title,
				author: row.author,
				content: row.content,
				position: row.position,
				slot: row.slot,
				addedAt: row.added_at,
				lastRead: row.last_read,
			}));
		}

		return [];
	}

	async updateBookPosition(id: number, position: number): Promise<void> {
		if (!this.db) throw new Error("Database not initialized");

		await this.db.run(
			"UPDATE books SET position = ?, last_read = ? WHERE id = ?",
			[position, Date.now(), id],
		);
	}

	async deleteBook(id: number): Promise<void> {
		if (!this.db) throw new Error("Database not initialized");

		await this.db.run("DELETE FROM books WHERE id = ?", [id]);
	}

	async close(): Promise<void> {
		if (this.db) {
			await this.sqlite.closeConnection(this.DB_NAME, false);
			this.db = null;
		}
	}
}

// Singleton instance
export const db = new DatabaseService();
