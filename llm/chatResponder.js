import OpenAI from "openai"
import { CHATGPT_CORE_PROMPT } from "./systemPrompts/chatgptCore.prompt.js"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function chatRespond(messages) {
  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: CHATGPT_CORE_PROMPT },
      ...messages
    ],
    temperature: 0
  })
  return res.choices[0].message.content
}
