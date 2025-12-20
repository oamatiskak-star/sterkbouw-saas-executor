import OpenAI from "openai"
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function chatRespond({ text }) {
  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Je bent een behulpzame gesprekspartner." },
      { role: "user", content: text }
    ]
  })
  return r.choices[0].message.content || "Oké."
}
