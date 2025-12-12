# AO Executor – SterkBouw SaaS Agent

Dit is de officiële AO Agent (executor) van het SterkBouw SaaS platform. De Agent draait als een zelfstandige Render-service en is gekoppeld aan de backend, frontend en Telegram.

## Takenpakket

✅ Telegrammeldingen verzenden bij:
- Start van de AO Executor
- Fouten in de backend (ping-fout)
- Ontvangen webhooks van GitHub en Vercel

✅ Healthchecks:
- `/ping` → status van de AO Agent
- `/test` → versiecontrole van de AO Agent

✅ Webhooks:
- `/api/webhook` → ontvangt POSTs van GitHub & Vercel
- Stuurt inhoud van webhook direct door naar Telegram

✅ Backend monitoring:
- Pingt backend (`sterkbouw-saas-back`) automatisch bij opstart
- Stuurt statusmelding naar Telegram

## Verbonden componenten

- **Backend**: [`sterkbouw-saas-back`](https://github.com/oamatiskak-star/sterkbouw-saas-back)
- **Frontend**: [`sterkbouw-saas-front`](https://github.com/oamatiskak-star/sterkbouw-saas-front)
- **Telegram Bot**: @ao_autopilot_bot

## Installatie (lokaal)

```bash
npm install
node ao.js
