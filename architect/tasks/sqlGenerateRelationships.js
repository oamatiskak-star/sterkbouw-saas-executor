export async function generateRelationships(payload) {
const { sourceTable, targetTable, fkField } = payload
return `
alter table ${sourceTable}
add column ${fkField} uuid references ${targetTable}(id);
`.trim()
}
