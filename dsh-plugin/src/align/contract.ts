import { AppError } from '../util/result.js'

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

export interface Schema {
  $ref?: string
  type?: string
  description?: string
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, Schema>
  items?: Schema
  example?: unknown
}

export interface Parameter {
  name?: string
  in?: string
  required?: boolean
  description?: string
  schema?: Schema
}

export interface Operation {
  summary?: string
  description?: string
  operationId?: string
  parameters?: Parameter[]
  requestBody?: { content?: Record<string, { schema?: Schema; example?: unknown }> }
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: Schema; example?: unknown }> }>
  [key: string]: unknown
}

export interface FoundOperation {
  method: string
  path: string
  title: string
  operation: Operation
  parameters: Parameter[]
}

export type OpenApiDoc = {
  paths?: Record<string, Record<string, unknown>>
  components?: { schemas?: Record<string, Schema> }
}

function idOf(operation: Operation): string[] {
  const keys = ['id', '_id', 'operationId', 'x-apifox-id', 'x-apifox-api-id', 'x-apifoxApiId']
  return keys.map((k) => operation[k]).filter((v) => v != null).map(String)
}

export function findOperation(doc: OpenApiDoc, apiId: string): FoundOperation | null {
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const shared = Array.isArray(item.parameters) ? (item.parameters as Parameter[]) : []
    for (const method of METHODS) {
      const operation = item[method]
      if (!operation || typeof operation !== 'object') continue
      const op = operation as Operation
      const ids = idOf(op)
      const hit = ids.some((id) => id === apiId || id === `api-${apiId}` || id.includes(`api-${apiId}`))
      if (!hit) continue
      return {
        method: method.toUpperCase(),
        path,
        title: op.summary?.trim() || op.operationId || `api-${apiId}`,
        operation: op,
        parameters: [...shared, ...(op.parameters ?? [])]
      }
    }
  }
  return null
}

export function requireOperation(doc: OpenApiDoc, apiId: string): FoundOperation {
  const found = findOperation(doc, apiId)
  if (!found) throw new AppError('APIFOX_NOT_FOUND', `Apifox 项目中未找到 api-${apiId}，可能已被删除或无访问权限`)
  return found
}

function schemasOf(doc: OpenApiDoc): Record<string, Schema> {
  return doc.components?.schemas ?? {}
}

function resolve(schema: Schema | undefined, doc: OpenApiDoc, seen: string[]): Schema | undefined {
  if (!schema?.$ref) return schema
  const name = schema.$ref.split('/').pop() ?? ''
  if (!name || seen.includes(name)) return { type: 'object', description: name }
  return schemasOf(doc)[name]
}

export function typeOf(schema: Schema | undefined): string {
  if (!schema) return '未提供'
  if (schema.enum?.length) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (schema.$ref) return schema.$ref.split('/').pop() ?? 'object'
  if (schema.type === 'array') return `${typeOf(schema.items)}[]`
  if (schema.type === 'integer') return 'integer'
  return schema.type ?? 'object'
}

export interface Field {
  path: string
  type: string
  required: boolean
  description: string
}

export function extractFields(schema: Schema | undefined, doc: OpenApiDoc, prefix: string = '', depth: number = 0, seen: string[] = []): Field[] {
  const resolved = resolve(schema, doc, seen)
  if (!resolved || depth > 4) return []
  const nextSeen = resolved.$ref ? seen : schema?.$ref ? [...seen, schema.$ref.split('/').pop() ?? ''] : seen
  if (resolved.type === 'array') return extractFields(resolved.items, doc, `${prefix}[]`, depth + 1, nextSeen)
  const props = resolved.properties
  if (!props) {
    if (!prefix) return []
    return [{ path: prefix, type: typeOf(schema), required: true, description: resolved.description?.trim() || '未提供' }]
  }
  const required = new Set(resolved.required ?? [])
  return Object.entries(props).flatMap(([name, child]) => {
    const path = prefix ? `${prefix}.${name}` : name
    const nested = extractFields(child, doc, path, depth + 1, nextSeen)
    if (nested.length && (child.properties || child.$ref || child.type === 'object' || child.type === 'array')) return nested
    return [{ path, type: typeOf(child), required: required.has(name), description: child.description?.trim() || '未提供' }]
  })
}

export function toTypeScript(schema: Schema | undefined, doc: OpenApiDoc, seen: string[] = [], depth: number = 0): string {
  if (!schema || depth > 4) return 'unknown'
  if (schema.enum?.length) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? 'unknown'
    if (seen.includes(name)) return name
    const target = schemasOf(doc)[name]
    return target ? toTypeScript(target, doc, [...seen, name], depth + 1) : name
  }
  if (schema.type === 'array') return `${toTypeScript(schema.items, doc, seen, depth + 1)}[]`
  if (schema.type === 'integer') return 'number'
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? [])
    const lines = Object.entries(schema.properties ?? {}).map(
      ([name, child]) => `  ${name}${required.has(name) ? '' : '?'}: ${toTypeScript(child, doc, seen, depth + 1)}`
    )
    return lines.length ? `{\n${lines.join('\n')}\n}` : 'Record<string, unknown>'
  }
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'number') return 'number'
  if (schema.type === 'string') return 'string'
  return 'unknown'
}

function table(rows: { cells: string[] }[], headers: string[]): string {
  if (!rows.length) return '未提供'
  const head = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.cells.map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`).join('\n')
  return `${head}\n${body}`
}

function jsonBlock(value: unknown): string | null {
  if (value === undefined) return null
  const text = JSON.stringify(value, null, 2)
  if (!text || text === 'null') return null
  const cut = text.length > 2000 ? `${text.slice(0, 2000)}\n…` : text
  return `\`\`\`json\n${cut}\n\`\`\``
}

function media(content: Record<string, { schema?: Schema; example?: unknown }> | undefined): { schema?: Schema; example?: unknown } | undefined {
  if (!content) return undefined
  return content['application/json'] ?? Object.values(content)[0]
}

export function renderContract(
  doc: OpenApiDoc,
  found: FoundOperation,
  meta: { projectId: string; apiId: string; source?: string | undefined }
): { markdown: string; tsDefinition: string } {
  const params = found.parameters.filter((p) => p.name)
  const body = media(found.operation.requestBody?.content)
  const responses = Object.entries(found.operation.responses ?? {})
  const responseBlocks = responses.map(([status, res]) => {
    const picked = media(res.content)
    const example = jsonBlock(picked?.example)
    return `### ${status} ${res.description?.trim() || '说明'}\n\n${table(
      extractFields(picked?.schema, doc, '', 0, []).map((f) => ({ cells: [f.path, f.type, f.required ? '是' : '否', f.description] })),
      ['字段', '类型', '必填', '说明']
    )}${example ? `\n\n${example}` : ''}`
  })

  const reqSchema = body?.schema
  const resSchema = media(responses[0]?.[1]?.content)?.schema

  const reqTs = reqSchema ? `export interface Api${meta.apiId}Request ${toTypeScript(reqSchema, doc, [], 0)}\n\n` : ''
  const resTs = `export interface Api${meta.apiId}Response ${toTypeScript(resSchema, doc, [], 0)}`
  const tsDefinition = `${reqTs}${resTs}`

  const markdown = [
    `# 【接口契约】${found.title}`,
    `\`${found.method} ${found.path}\``,
    meta.source ? `来源: ${meta.source}` : '',
    '',
    '## 请求参数 (Query / Path / Header)',
    table(
      params.map((p) => ({ cells: [p.in || 'query', p.name || '', typeOf(p.schema), p.required ? '是' : '否', p.description?.trim() || '-'] })),
      ['位置', '名称', '类型', '必填', '说明']
    ),
    '',
    '## 请求体 (Body)',
    body?.schema ? table(extractFields(body.schema, doc, '', 0, []).map((f) => ({ cells: [f.path, f.type, f.required ? '是' : '否', f.description] })), ['字段', '类型', '必填', '说明']) : '无请求体',
    '',
    '## 响应结构 (Response)',
    responseBlocks.length ? responseBlocks.join('\n\n') : '未提供',
    '',
    '## TypeScript 契约定义',
    '```ts',
    tsDefinition,
    '```'
  ].filter(Boolean).join('\n')

  return { markdown, tsDefinition }
}
