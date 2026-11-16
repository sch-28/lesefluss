const FILE_EXTENSION =
	/\.(?:m?js|css|map|json|webmanifest|png|jpe?g|webp|gif|svg|ico|wasm|woff2?|ttf|otf|txt|xml)$/i;

/**
 * True for an /app/ path that names a file, which the SPA fallback must answer
 * with a 404: the shell's HTML under a script, manifest or icon name would be run
 * or stored as that file (by a tab on the previous build, or the service worker).
 */
export function isAppFilePath(pathname: string): boolean {
	return pathname.startsWith("/app/assets/") || FILE_EXTENSION.test(pathname);
}
