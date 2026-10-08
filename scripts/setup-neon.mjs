import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Copia la conexión de Neon al archivo .env del proyecto.');
  process.exitCode = 1;
} else {
  try {
    const schema = await readFile(new URL('../neon/schema.sql', import.meta.url), 'utf8');
    const statements = [];
    let statement = '';
    // El esquema fijo usa $$ para el cuerpo de la función; sus ; se conservan.
    for (const [index, part] of schema.replace(/--[^\n]*/g, '').split(/(\$\$[\s\S]*?\$\$)/).entries()) {
      if (index % 2) { statement += part; continue; }
      const pieces = part.split(';');
      statement += pieces.shift();
      for (const piece of pieces) {
        if (statement.trim()) statements.push(statement.trim());
        statement = piece;
      }
    }
    if (statement.trim()) statements.push(statement.trim());
    const sql = neon(url);
    await sql.transaction(statements.map(statement => sql.query(statement)), { fetchOptions: { signal: AbortSignal.timeout(30000) } });
    console.log('Neon preparado. Las recetas existentes se conservan.');
  } catch {
    console.error('No se ha podido preparar Neon. Comprueba DATABASE_URL y los permisos del propietario de la base de datos.');
    process.exitCode = 1;
  }
}
