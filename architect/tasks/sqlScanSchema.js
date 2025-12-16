export async function scanSchema(payload) {
// Simuleer scan resultaat
return {
tables: [
{ name: "users", columns: ["id", "name", "email"] },
{ name: "projects", columns: ["id", "title", "owner_id"] }
]
}
}
