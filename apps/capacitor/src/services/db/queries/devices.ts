import { desc, eq } from "drizzle-orm";
import { db } from "../index";
import { type Device, devices, type NewDevice } from "../schema";

/**
 * Upsert a device record - inserts or replaces based on primary key (id).
 * Presence in this table = the device is "paired" (user picked it once).
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
				descriptorId: device.descriptorId,
			},
		});
}

/**
 * Return all paired devices, most-recently-connected first.
 */
export async function getPairedDevices(): Promise<Device[]> {
	return db.select().from(devices).orderBy(desc(devices.lastConnected));
}

export async function forgetDevice(id: string): Promise<void> {
	await db.delete(devices).where(eq(devices.id, id));
}

/**
 * Used by the one-shot v2 pairing migration to force users through the new
 * explicit-pair flow.
 */
export async function clearAllDevices(): Promise<void> {
	await db.delete(devices);
}
