import { describe, expect, test } from 'bun:test'
import { HOLD_TIMEOUT_MS, accept, chunk, combine, formatPermission, holdExpired, isStop, parseEnv, parseVerdict, shouldHold, shouldTakeBridge, stillOwner, threadOf } from '../lib.ts'

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

describe('shouldHold', () => {
  test('idle session: deliver now', () => expect(shouldHold('do the thing', false)).toBe(false))
  test('mid-turn: hold', () => expect(shouldHold('do the thing', true)).toBe(true))
  test('a verdict passes even mid-turn', () => {
    expect(shouldHold('yes abcde', true)).toBe(false)
    expect(shouldHold('No, ABCDE.', true)).toBe(false)
  })
  test('text that only looks like a verdict is held', () => expect(shouldHold('yes please do it', true)).toBe(true))
  test('"stop" passes even mid-turn', () => expect(shouldHold('Stop.', true)).toBe(false))
})

describe('isStop', () => {
  test('the word alone', () => expect(isStop('stop')).toBe(true))
  test('dictation capitals and punctuation', () => {
    expect(isStop('Stop.')).toBe(true)
    expect(isStop('STOP!')).toBe(true)
    expect(isStop(' Stop, I changed my mind')).toBe(true)
  })
  test('followed by more words', () => expect(isStop('stop and wait for me')).toBe(true))
  test('longer words are not the word', () => {
    expect(isStop('stopping by later')).toBe(false)
    expect(isStop('stopwatch app idea')).toBe(false)
    expect(isStop('stop-gap fix is fine')).toBe(false)
  })
  test('only at the start', () => expect(isStop('please stop')).toBe(false))
})

describe('holdExpired', () => {
  test('within the timeout', () => expect(holdExpired(1000, 1000 + HOLD_TIMEOUT_MS - 1)).toBe(false))
  test('at the timeout', () => expect(holdExpired(1000, 1000 + HOLD_TIMEOUT_MS)).toBe(true))
  test('the timeout is five minutes', () => expect(HOLD_TIMEOUT_MS).toBe(300_000))
})

describe('combine', () => {
  const first = { text: 'first task', thread_ts: '1.1', message_ts: '1.1' }
  const second = { text: 'a follow-up\non two lines', thread_ts: '1.1', message_ts: '2.2' }
  const third = { text: 'another task', thread_ts: '3.3', message_ts: '3.3' }
  test('one message goes out as if it had not been held', () =>
    expect(combine([second])).toEqual({ content: 'a follow-up\non two lines', meta: { thread_ts: '1.1', message_ts: '2.2' } }))
  test('several keep their order, text and own thread', () =>
    expect(combine([first, second, third]).content).toBe(
      '3 messages arrived while you were working, oldest first. Answer each in its own thread.\n\n' +
        'Message 1 (thread_ts 1.1, message_ts 1.1):\nfirst task\n\n' +
        'Message 2 (thread_ts 1.1, message_ts 2.2):\na follow-up\non two lines\n\n' +
        'Message 3 (thread_ts 3.3, message_ts 3.3):\nanother task',
    ))
  test('meta carries the latest message', () =>
    expect(combine([first, second, third]).meta).toEqual({ thread_ts: '3.3', message_ts: '3.3' }))
})

describe('shouldTakeBridge', () => {
  const alive = (pid: number) => pid === 456 // 456 is the only running process
  test('a live session holds the lock', () => expect(shouldTakeBridge('456\n', false, alive)).toBe(false))
  test('takeover wins over a live session', () => expect(shouldTakeBridge('456\n', true, alive)).toBe(true))
  test('the lock owner is gone', () => expect(shouldTakeBridge('789\n', false, alive)).toBe(true))
  test('missing or garbled lock', () => {
    expect(shouldTakeBridge(null, false, alive)).toBe(true)
    expect(shouldTakeBridge('', false, alive)).toBe(true)
    expect(shouldTakeBridge('not a pid', false, alive)).toBe(true)
  })
  test('zero and negative PIDs are never asked about', () => {
    // kill(0) and kill(-n) address process groups, so they would always look alive.
    expect(shouldTakeBridge('0', false, () => true)).toBe(true)
    expect(shouldTakeBridge('-456', false, () => true)).toBe(true)
  })
})

describe('stillOwner', () => {
  test('lock names us', () => expect(stillOwner('123\n', 123)).toBe(true))
  test('another session took over', () => expect(stillOwner('456', 123)).toBe(false))
  test('missing or garbled lock keeps the current bridge', () => {
    expect(stillOwner(null, 123)).toBe(true)
    expect(stillOwner('', 123)).toBe(true)
  })
})

describe('parseEnv', () => {
  test('reads KEY=value lines and ignores the rest', () =>
    expect(parseEnv('A=1\n# comment\nB = no\nC=x=y\n')).toEqual({ A: '1', C: 'x=y' }))
})
