# AO Executor – SterkBouw SaaS Platform

Dit is de officiële AO Agent (executor) van het SterkBouw SaaS platform. De Agent bestaat uit twee componenten:

1. **Node.js AO Executor** - Monitoring, notificaties, webhooks
2. **Python AI Engine** - Document analyse, STABU calculaties, AI processing

## Componenten

### 1. Node.js AO Executor
✅ **Taken:**
- Telegrammeldingen verzenden
- Healthchecks (`/ping`, `/test`)
- Webhooks verwerken (GitHub, Vercel)
- Backend monitoring
- Status updates naar frontend

### 2. Python AI Engine (NIEUW)
✅ **Taken:**
- Documentanalyse (tekeningen, rapporten, vergunningen)
- STABU-gebaseerde kostencalculaties
- AI-gestuurde data-extractie
- Haalbaarheidsrapporten genereren
- Real-time prijsberekeningen

## Verbonden componenten

- **Backend**: [`sterkbouw-saas-back`](https://github.com/oamatiskak-star/sterkbouw-saas-back)
- **Frontend**: [`sterkbouw-saas-front`](https://github.com/oamatiskak-star/sterkbouw-saas-front)
- **Telegram Bot**: @ao_autopilot_bot
- **Supabase Database**: Prijzen, projecten, calculaties

## Installatie (volledige setup)

### 1. Node.js AO Executor
```bash
npm install
node ao.js
