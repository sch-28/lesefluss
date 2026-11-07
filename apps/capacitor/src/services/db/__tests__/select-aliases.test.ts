// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";

/**
 * Static half of the LESE-125.26 guard: `assertNamedColumns` in test-db only
 * sees queries a test runs, this sees every `.select({...})` in the query layer.
 * A field is fine when it is a column (`books.id`) or ends in `.as(...)`.
 */
const QUERIES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../queries");

function unaliasedSelectFields(fileName: string, source: string): string[] {
	const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
	const initializers = new Map<string, ts.Expression>();
	const found: string[] = [];

	const collect = (node: ts.Node) => {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			initializers.set(node.name.text, node.initializer);
		}
		ts.forEachChild(node, collect);
	};
	collect(file);

	const isNamed = (expr: ts.Expression, seen: Set<string>): boolean => {
		if (ts.isPropertyAccessExpression(expr)) return true;
		if (
			ts.isCallExpression(expr) &&
			ts.isPropertyAccessExpression(expr.expression) &&
			expr.expression.name.text === "as"
		) {
			return true;
		}
		if (ts.isIdentifier(expr) && !seen.has(expr.text)) {
			const init = initializers.get(expr.text);
			return init !== undefined && isNamed(init, new Set(seen).add(expr.text));
		}
		return false;
	};

	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			["select", "selectDistinct"].includes(node.expression.name.text)
		) {
			const [fields] = node.arguments;
			if (fields && ts.isObjectLiteralExpression(fields)) {
				for (const prop of fields.properties) {
					const value = ts.isPropertyAssignment(prop)
						? prop.initializer
						: ts.isShorthandPropertyAssignment(prop)
							? prop.name
							: undefined;
					if (value && !isNamed(value, new Set())) {
						const { line } = file.getLineAndCharacterOfPosition(prop.getStart());
						found.push(`${fileName}:${line + 1} ${prop.getText().split("\n")[0]}`);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}

describe("query layer select fields", () => {
	it("gives every computed column an alias, as native CapacitorSQLite needs", () => {
		const files = readdirSync(QUERIES_DIR).filter((f) => f.endsWith(".ts"));
		const unaliased = files.flatMap((f) =>
			unaliasedSelectFields(f, readFileSync(join(QUERIES_DIR, f), "utf8")),
		);
		expect(unaliased).toEqual([]);
	});

	it("flags a computed column without an alias", () => {
		const source = `
			const bookCount = sql\`(SELECT count(*) FROM x)\`;
			db.select({ id: collections.id, bookCount, total: count() });
		`;
		expect(unaliasedSelectFields("probe.ts", source)).toEqual([
			"probe.ts:3 bookCount",
			"probe.ts:3 total: count()",
		]);
	});

	it("fails a test query whose result column is named after its SQL", async () => {
		const { db, raw, close } = createTestDb();
		try {
			raw.exec("CREATE TABLE probe (id TEXT); INSERT INTO probe VALUES ('a')");
			await expect(db.all("SELECT (SELECT count(*) FROM probe) FROM probe")).rejects.toMatchObject({
				cause: { message: expect.stringMatching(/without a plain alias/) },
			});
			await expect(db.all("SELECT count(*) AS n FROM probe")).resolves.toEqual([[1]]);
		} finally {
			close();
		}
	});
});
