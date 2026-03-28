import config from "./config.json" with { type: "json" };

export default config;

export const {
	protocol_version: PROTOCOL_VERSION,
	device_name: DEVICE_NAME,
	service_uuid: SERVICE_UUID,
	characteristics,
	transfer,
} = config;

export const SETTINGS_CHAR_UUID = config.characteristics.settings.uuid;
export const FILE_TRANSFER_CHAR_UUID = config.characteristics.file_transfer.uuid;
export const POSITION_CHAR_UUID = config.characteristics.position.uuid;
export const STORAGE_CHAR_UUID = config.characteristics.storage.uuid;

export const CHUNK_SIZE = config.transfer.chunk_size;
export const WINDOW_SIZE = config.transfer.window_size;
export const MAX_RETRIES = config.transfer.max_retries;
export const ACK_TIMEOUT_MS = config.transfer.ack_timeout_ms;
