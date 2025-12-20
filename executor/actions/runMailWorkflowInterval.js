/**
 * Mail workflow interval – DISABLED
 *
 * Dit bestand bestaat uitsluitend om legacy imports
 * in ao.js niet te laten crashen.
 *
 * In de huidige AO-architectuur:
 * - Geen mail cron
 * - Geen interval jobs
 * - Geen side effects
 *
 * Executor werkt uitsluitend via:
 * - Supabase executor_tasks polling
 */

export function runMailWorkflowInterval() {
  console.log("[AO] Mail workflow interval is disabled by design")
}

/**
 * Default export voor veiligheid
 * (sommige legacy imports gebruiken default)
 */
export default function () {
  console.log("[AO] Mail workflow interval default export disabled")
}
