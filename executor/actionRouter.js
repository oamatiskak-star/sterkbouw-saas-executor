import { runBuilder } from "../builder/index.js"
import { createClient } from "@supabase/supabase-js"

/*
ACTION ROUTER
- ENIGE ingang voor EXECUTOR
- SQL is leidend
- DEPLOY GATE wordt altijd gecontroleerd
- Builder voert alleen goedgekeurde acties uit
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function runAction(task) {
  try {
    if (!task || !task.payload) {
      return { status: "ignored", reason: "GEEN_PAYLOAD" }
    }

    const payload = task.payload
    const actionId = payload.actionId

    if (!actionId) {
      return { status: "ignored", reason: "GEEN_ACTION_ID" }
    }

    /*
    ========================
    DEPLOY GATE CHECK
    ========================
    */
    const { data: gate, error: gateError } = await supabase
      .from("deploy_gate")
      .select("*")
      .eq("id", 1)
      .single()

    if (gateError || !gate) {
