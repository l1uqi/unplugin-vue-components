import { dirname, isAbsolute, relative } from 'path'
import { existsSync, promises as fs } from 'fs'
import { notNullish, slash } from '@antfu/utils'
import type { Context } from './context'
import { getTransformedPath } from './utils'
import { resolveTypeImports } from './type-imports/detect'

export function parseDeclaration(code: string): Record<string, string> {
  if (!code)
    return {}
  return Object.fromEntries(Array.from(code.matchAll(/(?<!\/\/)\s+\s+['"]?(.+?)['"]?:\s(.+?)\n/g)).map(i => [i[1], i[2]]))
}

export async function generateDeclaration(ctx: Context, root: string, filepath: string, removeUnused = false): Promise<void> {
  const items = [
    ...Object.values({
      ...ctx.componentNameMap,
      ...ctx.componentCustomMap,
    }),
    ...resolveTypeImports(ctx.options.types),
  ]
  const imports: Record<string, string> = Object.fromEntries(
    items.map(({ from: path, as: name, name: importName }) => {
      if (!name)
        return undefined
      path = getTransformedPath(path, ctx)
      const related = isAbsolute(path)
        ? `./${relative(dirname(filepath), path)}`
        : path

      let entry = `typeof import('${slash(related)}')`
      if (importName)
        entry += `['${importName}']`
      else
        entry += '[\'default\']'
      return [name, entry]
    })
      .filter(notNullish),
  )

  if (!Object.keys(imports).length)
    return

  const originalContent = existsSync(filepath) ? await fs.readFile(filepath, 'utf-8') : ''

  const originalImports = parseDeclaration(originalContent)

  const lines = Object.entries({
    ...originalImports,
    ...imports,
  })
    .sort((a, b) => a[0].localeCompare(b[0]))
    .filter(([name]) => removeUnused ? items.find(i => i.as === name) : true)
    .map(([name, v]) => {
      if (!/^\w+$/.test(name))
        name = `'${name}'`
      return `${name}: ${v}`
    })

  const code = `// generated by unplugin-vue-components
// We suggest you to commit this file into source control
// Read more: https://github.com/vuejs/vue-next/pull/3399
import '@vue/runtime-core'

declare module '@vue/runtime-core' {
  export interface GlobalComponents {
    ${lines.join('\n    ')}
  }
}

export {}
`

  if (code !== originalContent)
    await fs.writeFile(filepath, code, 'utf-8')
}
