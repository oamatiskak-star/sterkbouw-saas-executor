import { sendTelegram } from "../../telegram/telegram.js"

export async function run(msg) {
  await sendTelegram("[AO] " + msg)
}
