export const SYSTEM_REGISTRY = {
  supabase: {
    requiredTables: [
      "projects",
      "tasks",
      "builder_results",
      "calculaties",
      "documenten",
      "planning",
      "inkoop",
      "risico"
    ]
  },

  backend: {
    requiredModules: [
      "calculaties",
      "documenten",
      "planning",
      "inkoop",
      "risico"
    ]
  },

  frontend: {
    requiredPages: [
      "/dashboard",
      "/dashboard/projects",
      "/actie/[id]",
      "/calculator",
      "/planning",
      "/uploads",
      "/bim",
      "/taken"
    ]
  }
}
