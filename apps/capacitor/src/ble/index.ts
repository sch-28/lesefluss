/**
 * Public surface of src/ble/.
 * Everything the rest of the app needs comes from here.
 *
 *   import { ble, bleClient, BLEConnectionState } from "../ble";
 */

export { ble } from "./characteristics";
export { bleClient, type ScannedDevice } from "./client";
export { BLEConnectionState, type BLEResult } from "./types";
