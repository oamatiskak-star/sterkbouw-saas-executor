export async function runBuilder(task) {
console.log("BUILDER START", task.id)

if (task.action === "REMAP") {
const { runRemap } = await import("../remap/remapEngine.js")
return runRemap(task)
}

if (task.action === "DOCUMENTS") {
const { buildDocuments } = await import("../agent/documents.js")
return buildDocuments(task)
}

console.log("BUILDER DONE", task.id)
return { ok: true }
}
