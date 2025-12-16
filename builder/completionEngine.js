export async function runCompletionTask(task) {
  switch (task.type) {
    case "CREATE_TABLE":
      return await createTable(task.name)

    case "CREATE_FRONTEND_PAGE":
      return await createFrontendPage(task.path)

    case "CREATE_BACKEND_HANDLER":
      return await createBackendHandler(task.module)

    default:
      throw new Error("ONBEKENDE_COMPLETION_TASK")
  }
}
