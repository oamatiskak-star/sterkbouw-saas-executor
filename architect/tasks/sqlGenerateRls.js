export async function generateRlsPolicy(payload) {
const { tableName, role } = payload
return `
alter table ${tableName} enable row level security;
create policy "Allow ${role}" on ${tableName}
for select using (auth.uid() = auth.uid());
`.trim()
}
