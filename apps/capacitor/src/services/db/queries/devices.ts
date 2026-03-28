import { desc } from "drizzle-orm";
import { db } from "../index";
import { type Device, devices, type NewDevice } from "../schema";

/**
 * Upsert a device record — inserts or replaces based on primary key (id).
 */
export async function saveDevice(device: NewDevice): Promise<void> {
	await db
		.insert(devices)
		.values(device)
		.onConflictDoUpdate({
			target: devices.id,
			set: {
				name: device.name,
				lastConnected: device.lastConnected,
			},
		});
}

/**
 * Return the most recently connected device, or null if none.
 */
export async function getLastDevice(): Promise<Device | null> {
	const rows = await db.select().from(devices).orderBy(desc(devices.lastConnected)).limit(1);
	return rows[0] ?? null;
}
