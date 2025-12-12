import axios from "axios"
import { sendTelegram } from "../telegram/telegram.js"

const BACKEND_URL = process.env.BACKEND_URL

export async function pingBackend() {
  try {
    const r = await axios.get(BACKEND_URL + "/ping")
    await sendTelegram("[AO] Backend OK: " + r.status)
  } catch (e) {
    await sendTelegram("[AO] Backend FOUT: " + e.message)
  }
}
