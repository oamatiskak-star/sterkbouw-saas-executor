const state = {}

export async function runAction(actionId, payload) {
  state[actionId] = {
    state: "BEZIG",
    startedAt: Date.now()
  }

  setTimeout(() => {
    state[actionId] = {
      state: "KLAAR",
      finishedAt: Date.now(),
      result: {
        message: "Actie afgerond",
        action: actionId
      }
    }
  }, 4000)

  return { ok: true, action: actionId, state: "GESTART" }
}

export async function getStatus(actionId) {
  return state[actionId] || { state: "ONBEKEND" }
}
