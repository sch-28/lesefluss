function required(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing required env var: ${name}`);
	return v;
}

export const env = {
	DATABASE_URL: required("DATABASE_URL"),
	SE_EMAIL: process.env.SE_EMAIL,
	SE_PASSWORD: process.env.SE_PASSWORD,
	CATALOG_ADMIN_SECRET: process.env.CATALOG_ADMIN_SECRET,
	PORT: Number(process.env.PORT ?? 2999),
};
