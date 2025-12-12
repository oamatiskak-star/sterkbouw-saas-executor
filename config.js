import dotenv from "dotenv"
dotenv.config()

const config = {
  telegram: {
    bot_token: process.env.TELEGRAM_BOT_TOKEN,
    chat_id: process.env.TELEGRAM_CHAT_ID
  }
}

export default config
