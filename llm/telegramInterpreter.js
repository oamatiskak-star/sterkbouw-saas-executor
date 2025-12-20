import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const SYSTEM_PROMPT = `
Je bent AO-Architect.
Zet Telegram-berichten om naar uitvoerbare systeemopdrachten.

Geef ALTIJD JSON terug:
{
  "type": "...",
  "actionId": "...",
  "payload": { ... }
}

Toegestane acties:
- architect:full_ui_pages_build
- builder:full_system_wire
- backend_run_initialization
- frontend_generate_standard_page
- system_post_deploy_verify
- backend_start_calculation
`

export async function interpretTelegramMessage(text) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ],
    temperature: 0
  })

  const json = completion.choices[0].message.content
  const parsed = JSON.parse(json)

  return {
    type: parsed.type,
    actionId: parsed.actionId,
    payload: {
      actionId: parsed.actionId,
      ...parsed.payload
    }
  }
}
