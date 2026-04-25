function isWhitespace(ch: string | undefined): boolean {
  return ch == null || /\s/.test(ch)
}

/**
 * 尽量保守地按 SQL 语句拆分，忽略字符串、注释与 PostgreSQL dollar-quote 中的分号。
 */
export function splitSqlStatements(input: string): string[] {
  const sql = input.trim()
  if (!sql) {
    return []
  }

  const parts: string[] = []
  let start = 0
  let i = 0
  let quote: "'" | '"' | '`' | null = null
  let inLineComment = false
  let inBlockComment = false
  let dollarTag: string | null = null

  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
      }
      i += 1
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length
        dollarTag = null
        continue
      }
      i += 1
      continue
    }

    if (quote) {
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          i += 2
          continue
        }
        quote = null
      } else if (ch === '\\' && quote !== '`') {
        i += 2
        continue
      }
      i += 1
      continue
    }

    if (ch === '$') {
      const rest = sql.slice(i)
      const match = rest.match(/^\$[A-Za-z0-9_]*\$/)
      if (match) {
        dollarTag = match[0]
        i += dollarTag.length
        continue
      }
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      i += 1
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      i += 2
      continue
    }

    if (ch === '#') {
      inLineComment = true
      i += 1
      continue
    }

    if (
      ch === '-' &&
      next === '-' &&
      (i === 0 || isWhitespace(sql[i - 1])) &&
      isWhitespace(sql[i + 2])
    ) {
      inLineComment = true
      i += 2
      continue
    }

    if (ch === ';') {
      const segment = sql.slice(start, i).trim()
      if (segment) {
        parts.push(segment)
      }
      start = i + 1
    }

    i += 1
  }

  const tail = sql.slice(start).trim()
  if (tail) {
    parts.push(tail)
  }
  return parts
}
