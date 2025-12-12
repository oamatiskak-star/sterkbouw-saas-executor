import express from "express"
import { handleCommand } from "../command_router/router.js"

const router = express.Router()

router.post("/", async (req, res) => {
  await handleCommand(req.body)
  res.status(200).send("Webhook ontvangen en verwerkt")
})

export default router
