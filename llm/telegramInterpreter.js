import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

/*
AO TELEGRAM → CHATGPT INTERPRETER
STRICT
AUTONOOM
BACKWARD COMPATIBLE
*/

const SYSTEM_PROMPT = `
Je bent AO-Architect en AO-Operator.

Zet Telegram-berichten om naar uitvoerbare systeemopdrachten.
Je mag NOOIT vrije tekst teruggeven.

Je antwoord is ALTIJD valide JSON in exact dit formaat:

{
  "type": "...",
  "actionId": "...",
  "payload": { ... }
}

Regels:
- actionId is VERPLICHT
- payload bevat altijd actionId
- Gebruik alleen toegestane acties
- Als intentie onduidelijk is: kies system_post_deploy_verify

Toegestane acties:
- architect:full_ui_pages_build
- builder:full_system_wire
- backend_run_initialization
- backend_start_calculation
- frontend_generate_standard_page
- system_post_deploy_verify

Voorbeelden:
"herbouw frontend" →
{
  "type": "architect:full_ui_pages_build",
  "actionId": "architect_full_ui_pages_build",
  "payload": {}
}

"start calculatie voor breskens" →
{
  "type": "backend_start_calculation",
  "actionId": "backend_start_calculation",
  "payload": {
    "project": "Breskens"
  }
}
`

/*
VALIDATIE
*/
function validateParsed(parsed) {
  if (!parsed) throw new Error("LEEG_RESPONSE")
  if (!parsed.type) throw new Error("TYPE_ONTBREEKT")
  if (!parsed.actionId) throw new Error("ACTION_ID_ONTBREEKT")

  return {
    type: parsed.type,
    actionId: parsed.actionId,
    payload: {
      actionId: parsed.actionId,
      ...(parsed.payload || {})
    }
  }
}

/*
INTERPRETER
*/
export async function interpretTelegramMessage(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    temperature: 0
  })

  let raw = completion.choices[0]?.message?.content

  if (!raw) {
    return {
      type: "system:post_deploy_verify",
      actionId: "system_post_deploy_verify",
      payload: { actionId: "system_post_deploy_verify" }
    }
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    // HARD FALLBACK — systeem blijft altijd draaien
    return {
      type: "system:post_deploy_verify",
      actionId: "system_post_deploy_verify",
      payload: {
        actionId: "system_post_deploy_verify",
        reason: "JSON_PARSE_FAIL",
        originalText: text
      }
    }
  }

  try {
    return validateParsed(parsed)
  } catch (err) {
    return {
      type: "system:post_deploy_verify",
      actionId: "system_post_deploy_verify",
      payload: {
        actionId: "system_post_deploy_verify",
        reason: err.message,
        originalText: text
      }
    }
  }
}
