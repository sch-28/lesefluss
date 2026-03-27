/// <reference types="vite/client" />

// Declare CSS modules
declare module "*.css" {
	const content: Record<string, string>;
	export default content;
}

// Declare Ionic React CSS imports
declare module "@ionic/react/css/*";
