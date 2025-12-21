export async function run(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("CALCULATIES_BOUW_MISSING_PAYLOAD")
  }

  const { project_id } = payload

  if (!project_id) {
    throw new Error("CALCULATIES_BOUW_MISSING_PROJECT_ID")
  }

  // tijdelijke vaste output
  // later te vervangen door echte calculatie logica

  return {
    state: "DONE",
    result: {
      project_id,
      bouwsom: 1250000,
      marge: 0.18
    }
  }
}
