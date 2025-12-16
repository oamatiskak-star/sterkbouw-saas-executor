import { createClient } from "@supabase/supabase-js"

import * as calculatiesBouw from "./actions/calculaties_bouw.js"
import * as calculatiesEW from "./actions/calculaties_ew.js"

import * as documentenBestek from "./actions/documenten_bestek.js"
import * as documentenOffertes from "./actions/documenten_offertes.js"
import * as documentenContracten from "./actions/documenten_contracten.js"

import * as planningFasering from "./actions/planning_fasering.js"
import * as planningDoorlooptijd from "./actions/planning_doorlooptijd.js"
import * as planningKritischPad from "./actions/planning_kritisch_pad.js"

/*
========================
SUPABASE
========================
*/
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/*
========================
BUILDER ACTION MAP
========================
– Elke actie bestaat
– Geen stille skips meer
*/
const ACTIONS = {
  "calculaties:bouw": calculatiesBouw,
  "calculaties:ew": calculatiesEW,

  "documenten:bestek": documentenBestek,
  "documenten:offertes": documentenOffertes,
  "documenten:contracten": documentenContracten,

  "planning:fasering": planningFasering,
  "planning:doorlooptijd": planningDoorlooptijd,
  "planning:kritisch_pad": planningKritischPad
}

/*
========================
BUILDER RUNNER
========================
*/
export async function runBuilder(payload = {}) {
  const actionId = payload.action
  const projectId = payload.project_id || null

  console.log("BUILDER START", actionId || "geen-id")

  if (!actionId) {
    return logResult({
      projectId,
      actionId: "onbekend",
      status: "SKIP",
      message: "Geen action opgegeven"
    })
  }

  const handler = ACTIONS[actionId]

  if (!handler || typeof handler.run !== "function") {
    return logResult({
      projectId,
      actionId,
      status: "FAILED",
      message: "Builder actie niet geïmplementeerd"
    })
  }

  try {
    const result = await handler.run({
      project_id: projectId,
      payload
    })

    return logResult({
      projectId,
      actionId,
      status: "DONE",
      data: result
    })
  } catch (err) {
    return logResult({
      projectId,
      actionId,
      status: "FAILED",
      message: err.message || "BUILDER_FOUT"
    })
  }
}

/*
========================
RESULT LOGGING
========================
*/
async function logResult({ projectId, actionId, status, data, message }) {
  const record = {
    project_id: projectId,
    action: actionId,
    status,
    data: data || null,
    message: message || null,
    created_at: new Date().toISOString()
  }

  console.log("BUILDER RESULT", status, actionId)

  await supabase
    .from("builder_results")
    .insert(record)

  return record
}
