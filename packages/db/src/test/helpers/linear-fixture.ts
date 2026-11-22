import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

// Minimal pre-migration tables, using the production column types. No external DB.
export function fixtureTable(table: PgTable) {
  const { name, columns } = getTableConfig(table);
  return `CREATE TABLE "${name}" (${columns
    .filter((column) => column.name !== "linear_project")
    .map((column) => {
      const type = column.enumValues?.length
        ? "text"
        : column.getSQLType().replace(/vector\(\d+\)/, "text");
      return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY DEFAULT gen_random_uuid()" : column.name === "created_at" ? " DEFAULT now()" : ""}`;
    })
    .join(", ")})`;
}
