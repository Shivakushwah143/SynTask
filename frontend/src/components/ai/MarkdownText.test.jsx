import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import MarkdownText, { renderMarkdown } from './MarkdownText'

describe('MarkdownText', () => {
  test('renders paragraph text with line breaks preserved', () => {
    render(<MarkdownText content={`First line
Second line`} />)
    expect(screen.getByText(/First line/)).toBeInTheDocument()
    expect(screen.getByText(/Second line/)).toBeInTheDocument()
  })

  test('renders headings without leaking # markers', () => {
    const { container } = render(<MarkdownText content={`# Executive brief

## Risks`} />)
    expect(container.querySelector('h3')?.textContent).toBe('Executive brief')
    expect(container.querySelector('h4')?.textContent).toBe('Risks')
    expect(container.textContent).not.toContain('#')
  })

  test('renders bullet lists', () => {
    const { container } = render(<MarkdownText content={`- Alpha task overdue
- Beta at risk`} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('Alpha task overdue')
    expect(items[1].textContent).toContain('Beta at risk')
  })

  test('renders ordered lists', () => {
    const { container } = render(<MarkdownText content={`1. Reassign
2. Escalate`} />)
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  test('renders bold and inline code without markers', () => {
    const { container } = render(<MarkdownText content="Overdue count is **8** and key is `PROJ-1`" />)
    expect(container.querySelector('strong')?.textContent).toBe('8')
    expect(container.querySelector('code')?.textContent).toBe('PROJ-1')
    expect(container.textContent).not.toContain('**')
  })

  test('renders pipe tables as real table elements, never raw pipes', () => {
    const markdown = ['| Name | Status |', '|------|--------|', '| Riya | Active |', '| Gaurav | Overdue |'].join('\n')
    const { container } = render(<MarkdownText content={markdown} />)
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(container.querySelectorAll('th')[0]?.textContent).toBe('Name')
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) => row.textContent)
    expect(rows[0]).toContain('Riya')
    expect(rows[1]).toContain('Gaurav')
    expect(container.textContent).not.toContain('|------|')
  })

  test('strips Mongo ObjectId-looking tokens by default', () => {
    const { container } = render(<MarkdownText content="Record 5f8f9a2b3c4d5e6f7a8b9c0d is done" />)
    expect(container.textContent).not.toContain('5f8f9a2b3c4d5e6f7a8b9c0d')
  })

  test('escapes raw HTML instead of executing it', () => {
    render(<MarkdownText content="<img src=x onerror=alert(1)> hello" />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText(/hello/)).toBeInTheDocument()
  })

  test('returns null for empty content', () => {
    expect(renderMarkdown('')).toBeNull()
    expect(renderMarkdown('   ')).toBeNull()
  })
})
