import OpenAI from "openai"

/*
========================
SAFE OPENAI INIT
========================
*/
const OPENAI_KEY = process.env.OPENAI_API_KEY

let openai = null
if (OPENAI_KEY && OPENAI_KEY.length > 10) {
  openai = new OpenAI({ apiKey: OPENAI_KEY })
}

/*
========================
SYSTEM PROMPT
– MAG PRATEN
– MAG ACTIES VOORSTELLEN
– JSON OF CHAT
========================
*/
const SYSTEM_PROMPT = `
Je bent AO, een autonome bouw- en ontwikkelassistent.

Je taak:
1. Als de gebruiker een ACTIE vraagt: geef JSON.
2. Als de gebruiker een VRAAG stelt of praat: geef NORMALE TEKST.

REGELS JSON:
- Gebruik alleen JSON als er echt een actie nodig is.
- Formaat:

{
  "type": "...",
  "actionId": "...",
  "payload": { ... }
}

Toegestane acties:
- architect_full_ui_pages_build
- backend_start_calculation
- backend_run_initialization
- frontend_generate_standard_page
- system_post_deploy_verify

Als geen actie nodig is: praat normaal terug.
`

/*
========================
INTERPRETER
========================
*/
export async function interpretTelegramMessage(text) {
  // ❗ HARD FALLBACK
  if (!openai) {
    return {
      reply:
        "Ik ben online, maar ChatGPT is niet gekoppeld.\n" +
        "Controleer OPENAI_API_KEY."
    }
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    temperature: 0.2
  })

  const msg = completion.choices[0]?.message?.content
  if (!msg) {
    return { reply: "Ik kreeg geen antwoord. Probeer het opnieuw." }
  }

  // ======================
  // JSON → ACTIE
  // ======================
  try {
    const parsed = JSON.parse(msg)

    if (parsed.actionId) {
      return {
        type: parsed.type || parsed.actionId,
        actionId: parsed.actionId,
        payload: parsed.payload || {}
      }
    }
  } catch {
    // geen JSON = praat
  }

  // ======================
  // TEKST → CHAT
  // ======================
  return {
    reply: msg
  }
}
