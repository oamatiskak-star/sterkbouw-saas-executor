import * as dotenv from "dotenv"
dotenv.config()

import express from "express"
import { createClient } from "@supabase/supabase-js"

const AO_ROLE = process.env.AO_ROLE
const PORT = process.env.PORT || 10000

const app = express()

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.get("/ping", (_, res) => {
res.send("AO LIVE : " + AO_ROLE)
})

/*
AO ARCHITECT

– LEEST ALLEEN
– GEEN TASKS
– GEEN LOOPS
– GEEN EXECUTIE
*/
if (AO_ROLE === "ARCHITECT") {
console.log("AO ARCHITECT gestart")
console.log("Modus: analyse en ontwerp")
}

/*
AO EXECUTOR – DOCUMENTS

– ENIGE DIE UITVOERT
*/
if (AO_ROLE === "EXECUTOR") {
console.log("AO EXECUTOR gestart")
console.log("Subrol: DOCUMENTS")

async function work() {
const { data: tasks } = await supabase
.from("tasks")
.select("*")
.eq("status", "open")
.eq("assigned_to", "documents")
.limit(1)

if (!tasks || tasks.length === 0) return

const task = tasks[0]

await supabase
  .from("tasks")
  .update({ status: "running" })
  .eq("id", task.id)

await supabase.from("results").insert({
  project_id: task.project_id,
  type: "documents_processed",
  data: { ok: true }
})

await supabase
  .from("tasks")
  .update({ status: "done" })
  .eq("id", task.id)


}

setInterval(work, 5000)
}

/*
SAFETY NET

*/
if (!AO_ROLE) {
console.error("AO_ROLE ontbreekt. Service stopt.")
process.exit(1)
}

app.listen(PORT, () => {
console.log("AO service live op poort", PORT)
})
