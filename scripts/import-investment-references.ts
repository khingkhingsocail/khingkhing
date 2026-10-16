import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { z } from "zod";
import { investmentReferenceSchema } from "../shared/investmentReferences";
const file = process.argv[2];
if (!file) throw new Error("Provide investment reference JSON path");
const rows = z
  .array(investmentReferenceSchema)
  .min(1)
  .max(1000)
  .parse(JSON.parse(await readFile(file, "utf8")));
if (new Set(rows.map(row => row.id)).size !== rows.length)
  throw new Error("Duplicate entity ID");
const db = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  await db.beginTransaction();
  let added = 0;
  for (const row of rows) {
    const [existing] = await db.execute<mysql.RowDataPacket[]>(
      "SELECT id FROM investment_public_references WHERE id=?",
      [row.id]
    );
    if (existing.length) continue;
    await db.execute(
      "INSERT INTO investment_public_references (id,kind,payload) VALUES (?,?,?)",
      [row.id, row.kind, JSON.stringify(row)]
    );
    added++;
  }
  await db.commit();
  console.log(
    `Imported ${added} investment entities; preserved ${rows.length - added} existing entities.`
  );
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
