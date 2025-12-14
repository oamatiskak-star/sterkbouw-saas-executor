import { actions } from "../lib/actions.js"

export async function runAction(actionId, payload) {
  const cfg = actions[actionId]
  if (!cfg) return { ok:false, error:"ACTIE_ONBEKEND" }

  return {
    ok:true,
    action: actionId,
    task: cfg.task,
    status:"GESTART",
    startedAt: Date.now()
  }
}
