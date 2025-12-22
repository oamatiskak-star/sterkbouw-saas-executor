function normalizeAction(action) {
  return String(action)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
}

export function planTask(actionId, payload = {}) {
  if (!actionId) {
    throw new Error("PLAN_TASK_MISSING_ACTION")
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("PLAN_TASK_INVALID_PAYLOAD")
  }

  if (!payload.project_id) {
    throw new Error("PLAN_TASK_MISSING_PROJECT_ID")
  }

  return {
    actionId: normalizeAction(actionId),
    payload
  }
}
