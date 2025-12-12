import { pingBackend } from "../../utils/fetchBackend.js"

export async function run() {
  await pingBackend()
}
