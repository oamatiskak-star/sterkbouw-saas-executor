export function getDesignContract(moduleKey) {
  return {
    tables: [`${moduleKey.replace(':','_')}_data`],
    api: [`/api/${moduleKey}`],
    pages: [`/${moduleKey.replace(':','/')}`],
    permissions: ['read','write','admin']
  }
}
