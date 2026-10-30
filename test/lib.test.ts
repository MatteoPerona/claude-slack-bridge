import { describe, expect, test } from 'bun:test'
import { accept, chunk, formatPermission, parseEnv, parseVerdict, stillOwner, threadOf } from '../lib.ts'

const cfg = { owner: 'UOWNER', channel: 'CBRIDGE', botUserId: 'UBOT' }
const msg = { user: 'UOWNER', channel: 'CBRIDGE', ts: '1.1', text: 'hi' }

describe('accept', () => {
  test('owner in the bridge channel', () => expect(accept(msg, cfg)).toBe(true))
  test('other user', () => expect(accept({ ...msg, user: 'UOTHER' }, cfg)).toBe(false))
  test('other channel', () => expect(accept({ ...msg, channel: 'COTHER' }, cfg)).toBe(false))
  test('bot message, including our own', () => expect(accept({ ...msg, bot_id: 'B1' }, cfg)).toBe(false))
  test('owner via an allowed app (connector)', () =>
    expect(accept({ ...msg, bot_id: 'BCOMP', app_id: 'ACOMP' }, { ...cfg, ownerApps: ['ACOMP'] })).toBe(true))
  test('owner via an app not on the list', () =>
    expect(accept({ ...msg, bot_id: 'BX', app_id: 'AOTHER' }, { ...cfg, ownerApps: ['ACOMP'] })).toBe(false))
  test('allowed app posting as someone else', () =>
    expect(accept({ ...msg, user: 'UOTHER', bot_id: 'BCOMP', app_id: 'ACOMP' }, { ...cfg, ownerApps: ['ACOMP'] })).toBe(false))
  test('our bot user', () => expect(accept({ ...msg, user: 'UBOT' }, { ...cfg, owner: 'UBOT' })).toBe(false))
  test('edits and other subtypes', () => expect(accept({ ...msg, subtype: 'message_changed' }, cfg)).toBe(false))
  test('empty text', () => expect(accept({ ...msg, text: '' }, cfg)).toBe(false))
})

describe('threadOf', () => {
  test('top-level message starts its own thread', () => expect(threadOf(msg)).toBe('1.1'))
  test('reply belongs to its parent', () => expect(threadOf({ ...msg, ts: '2.2', thread_ts: '1.1' })).toBe('1.1'))
})

describe('parseVerdict', () => {
  test('yes', () => expect(parseVerdict('yes abcde')).toEqual({ request_id: 'abcde', behavior: 'allow' }))
  test('no', () => expect(parseVerdict('no abcde')).toEqual({ request_id: 'abcde', behavior: 'deny' }))
  test('short forms', () => expect(parseVerdict('y abcde')?.behavior).toBe('allow'))
  test('dictation capitals and punctuation', () =>
    expect(parseVerdict('Yes, ABCDE.')).toEqual({ request_id: 'abcde', behavior: 'allow' }))
  test('ID alphabet excludes l', () => expect(parseVerdict('yes abcle')).toBeNull())
  test('not a verdict', () => expect(parseVerdict('yes please do it')).toBeNull())
  test('verdict inside a sentence is not a verdict', () => expect(parseVerdict('I said yes abcde')).toBeNull())
})

describe('chunk', () => {
  test('short text is one chunk', () => expect(chunk('hello')).toEqual(['hello']))
  test('splits on paragraphs under the limit', () => {
    const parts = chunk('a'.repeat(60) + '\n\n' + 'b'.repeat(60), 100)
    expect(parts).toEqual(['a'.repeat(60), 'b'.repeat(60)])
  })
  test('hard-splits a long line', () => {
    const parts = chunk('x'.repeat(250), 100)
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50])
  })
})

describe('formatPermission', () => {
  test('code comes first and the reply format is spelled out', () => {
    const s = formatPermission({ request_id: 'abcde', tool_name: 'Bash', description: 'List files', input_preview: '{"command":"ls"}' })
    expect(s.startsWith('Approval needed, code abcde.')).toBe(true)
    expect(s).toContain('"yes abcde" or "no abcde"')
  })
  test('long previews are cut', () => {
    const s = formatPermission({ request_id: 'abcde', tool_name: 'Write', description: 'd', input_preview: 'z'.repeat(5000) })
    expect(s.length).toBeLessThan(1800)
  })
})

describe('stillOwner', () => {
  test('lock names us', () => expect(stillOwner('123\n', 123)).toBe(true))
  test('a newer session took over', () => expect(stillOwner('456', 123)).toBe(false))
  test('missing or garbled lock keeps the current bridge', () => {
    expect(stillOwner(null, 123)).toBe(true)
    expect(stillOwner('', 123)).toBe(true)
  })
})

describe('parseEnv', () => {
  test('reads KEY=value lines and ignores the rest', () =>
    expect(parseEnv('A=1\n# comment\nB = no\nC=x=y\n')).toEqual({ A: '1', C: 'x=y' }))
})
