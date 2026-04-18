/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SYNC_URL?: string;
	readonly VITE_CATALOG_URL?: string;
	readonly VITE_WEB_BUILD?: string;
}

// Declare CSS modules
declare module "*.css" {
	const content: Record<string, string>;
	export default content;
}

// Declare Ionic React CSS imports
declare module "@ionic/react/css/*";
