export async function generateSqlTable(payload) {
const { tableName } = payload
return `
create table if not exists ${tableName} (
id uuid primary key default gen_random_uuid(),
data jsonb,
created_at timestamptz default now()
);
`.trim()
}
