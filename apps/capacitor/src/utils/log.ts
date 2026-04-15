const PREFIX = "[Lesefluss]";

function makeTag(module: string) {
	return `${PREFIX}[${module}]`;
}

function log(module: string, ...args: unknown[]): void {
	console.log(makeTag(module), ...args);
}

log.warn = (module: string, ...args: unknown[]): void => {
	console.warn(makeTag(module), ...args);
};

log.error = (module: string, ...args: unknown[]): void => {
	console.error(makeTag(module), ...args);
};

export { log };
