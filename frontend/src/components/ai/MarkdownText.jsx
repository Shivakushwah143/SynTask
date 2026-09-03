import React from 'react'

/**
 * MarkdownText — dependency-free, safe Markdown-lite renderer for agent
 * narrative answers.
 *
 * Supports the subset the agents actually emit: headings, bold, italic,
 * inline code, links, bullet + numbered lists, pipe tables, blockquotes and
 * line breaks. Everything is rendered as React elements (never
 * dangerouslySetInnerHTML), so raw HTML in answers is displayed as text and
 * cannot execute.
 *
 * Also strips Mongo/ObjectId-looking tokens (24-hex strings) and obvious
 * internal ids from the rendered output unless `showIds` is set, so the UI
 * never shows raw database identifiers.
 */

const OBJECT_ID_RE = /\b[0-9a-f]{24}\b/g

const escapeInline = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

/**
 * Render inline markdown (bold/italic/code/links) from a plain string.
 * Returns an array of React nodes.
 */
const renderInline = (raw, keyPrefix = 'i', showIds = false) => {
  const text = showIds ? raw : raw.replace(OBJECT_ID_RE, '')
  const escaped = escapeInline(text)
  // Tokenise into code, bold, italic, links and plain text segments.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)]+\))/g
  const nodes = []
  let lastIndex = 0
  let match
  let key = 0
  while ((match = pattern.exec(escaped)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(escaped.slice(lastIndex, match.index))
    }
    const [full] = match
    if (full.startsWith('`')) {
      nodes.push(<code key={`${keyPrefix}-c${key}`} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-primary-700 dark:bg-gray-800 dark:text-primary-200">{full.slice(1, -1)}</code>)
    } else if (full.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${key}`} className="font-semibold text-gray-900 dark:text-gray-50">{full.slice(2, -2)}</strong>)
    } else if (full.startsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-e${key}`} className="italic">{full.slice(1, -1)}</em>)
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(full)
      const label = linkMatch?.[1] ?? full
      const href = linkMatch?.[2] ?? ''
      const safeHref = href.startsWith('http://') || href.startsWith('https://') ? href : undefined
      nodes.push(
        safeHref
          ? <a key={`${keyPrefix}-a${key}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 hover:text-primary-700 dark:text-primary-300">{label}</a>
          : label,
      )
    }
    key += 1
    lastIndex = match.index + full.length
  }
  if (lastIndex < escaped.length) {
    nodes.push(escaped.slice(lastIndex))
  }
  return nodes
}

/** Parse a pipe table into { headers, rows } or null. */
const parseTable = (headerLine, separatorLine, bodyLines) => {
  if (!/^\s*\|/.test(headerLine) || !/^\s*\|?[\s:|-]+\|?\s*$/.test(separatorLine)) return null
  const split = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  const headers = split(headerLine)
  if (!headers.length) return null
  const rows = bodyLines
    .filter((line) => line.trim().startsWith('|'))
    .map(split)
    .filter((cells) => cells.length === headers.length)
  if (!rows.length) return null
  return { headers, rows }
}

/** Render a full markdown-lite document into React nodes. */
export const renderMarkdown = (content, { showIds = false } = {}) => {
  if (typeof content !== 'string' || !content.trim()) return null

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Pipe table (header | separator | body) ───────────────────────────
    if (i + 1 < lines.length && /\|/.test(line) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const body = []
      let j = i + 2
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        body.push(lines[j])
        j += 1
      }
      const table = parseTable(line, lines[i + 1], body)
      if (table) {
        blocks.push(
          <div key={`mk-${blockKey++}`} className="my-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
                  {table.headers.map((header, h) => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      {renderInline(header, `h${blockKey}-${h}`, showIds)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                    {row.map((cell, c) => (
                      <td key={c} className="px-3 py-2 align-top text-gray-700 dark:text-gray-200">
                        {renderInline(cell, `c${blockKey}-${r}-${c}`, showIds)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        i = j
        continue
      }
    }

    // ── Headings ─────────────────────────────────────────────────────────
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      const text = heading[2]
      const classes = [
        'font-semibold tracking-tight text-gray-950 dark:text-gray-50',
        level === 1 ? 'mt-5 mb-2 text-xl' : level === 2 ? 'mt-4 mb-2 text-lg' : 'mt-3 mb-1.5 text-base',
      ].join(' ')
      const HeadingTag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      blocks.push(<HeadingTag key={`mk-${blockKey++}`} className={classes}>{renderInline(text, `hd${blockKey}`, showIds)}</HeadingTag>)
      i += 1
      continue
    }

    // ── Blockquote ───────────────────────────────────────────────────────
    if (/^\s*>\s?/.test(line)) {
      const quoteLines = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote key={`mk-${blockKey++}`} className="my-2 border-l-2 border-primary-300 pl-3 text-gray-600 dark:border-primary-700 dark:text-gray-300">
          {renderInline(quoteLines.join(' '), `q${blockKey}`, showIds)}
        </blockquote>,
      )
      continue
    }

    // ── Unordered list ───────────────────────────────────────────────────
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`mk-${blockKey++}`} className="my-2 space-y-1.5 pl-5">
          {items.map((item, itemKey) => (
            <li key={itemKey} className="list-disc marker:text-primary-400">
              {renderInline(item, `ul${blockKey}-${itemKey}`, showIds)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // ── Ordered list ─────────────────────────────────────────────────────
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`mk-${blockKey++}`} className="my-2 space-y-1.5 pl-5">
          {items.map((item, itemKey) => (
            <li key={itemKey} className="list-decimal marker:text-primary-500">
              {renderInline(item, `ol${blockKey}-${itemKey}`, showIds)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // ── Horizontal rule ──────────────────────────────────────────────────
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`mk-${blockKey++}`} className="my-3 border-gray-200 dark:border-gray-800" />)
      i += 1
      continue
    }

    // ── Paragraph (blank-line separated, single newlines become breaks) ──
    const paragraphLines = []
    while (i < lines.length && lines[i].trim() !== '' && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
      paragraphLines.push(lines[i])
      i += 1
    }
    if (paragraphLines.length) {
      blocks.push(
        <p key={`mk-${blockKey++}`} className="my-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
          {paragraphLines.map((paraLine, pIndex) => (
            <React.Fragment key={`p${blockKey}-${pIndex}`}>
              {pIndex > 0 && <br />}
              {renderInline(paraLine, `par${blockKey}-${pIndex}`, showIds)}
            </React.Fragment>
          ))}
        </p>,
      )
      continue
    }

    // Blank line — skip.
    i += 1
  }

  if (!blocks.length) {
    return <span className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">{content}</span>
  }
  return blocks
}

export default function MarkdownText({ content, showIds = false, className = '' }) {
  return <div className={className}>{renderMarkdown(content, { showIds })}</div>
}
