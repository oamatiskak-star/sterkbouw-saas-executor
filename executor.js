// executor.js
// SterkCalc Executor — minimale idle worker (Railway-safe)

import 'dotenv/config';

console.log('✅ SterkCalc Executor gestart');
console.log('🟡 Status: idle');
console.log('🛑 Geen polling, geen HTTP, geen timers die logica uitvoeren');

// Environment check (NO EXIT)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Ontbrekende Supabase env vars');
}

// Graceful shutdown
let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`🛑 Executor shutdown (${signal})`);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// --- KEEP PROCESS ALIVE ---
// GEEN top-level await
// GEEN polling
// GEEN loop
setInterval(() => {}, 1 << 30);
