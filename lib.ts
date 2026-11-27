// Pure helpers for the bridge Slack channel. No I/O, so they can be unit-tested.

export type Config = {
  owner: string // Slack user ID allowed to talk to the session
  channel: string // the one Slack channel the bridge listens and replies in
  ownerApps?: string[] // app IDs allowed to post as the owner (e.g. a connector)
  botUserId?: string // our own bot user, filled in after auth.test
}

export type SlackMessage = {
  user?: string
  channel?: string
  ts?: string
  thread_ts?: string
  text?: string
  bot_id?: string
  app_id?: string
  subtype?: string
}

// Accept only plain messages from the owner, in the bridge channel.
// Gate on the sender, not just the channel (channels-reference: "Gate inbound messages").
// Messages an app posts with the owner's user token carry the owner's user ID plus the
// app's bot_id; accept those only from apps in ownerApps. Our own replies come from our
// bot user, so the owner check drops them.
export function accept(msg: SlackMessage, cfg: Config): boolean {
  if (msg.subtype) return false // edits, joins, file shares, etc.
  if (!msg.ts || !msg.text) return false
  if (msg.channel !== cfg.channel) return false
  if (msg.user !== cfg.owner) return false
  if (cfg.botUserId && msg.user === cfg.botUserId) return false
  if (msg.bot_id && !(msg.app_id && cfg.ownerApps?.includes(msg.app_id))) return false
  return true
}

// The thread a message belongs to: its parent, or itself when it starts one.
export function threadOf(msg: SlackMessage): string {
  return msg.thread_ts ?? msg.ts!
}

// Permission verdicts: "yes abcde", "no abcde", "y abcde", "n abcde".
// IDs are 5 letters from a-z without l. /i tolerates phone and voice capitalization,
// and trailing punctuation is allowed because dictation adds it ("Yes, abcde.").
const VERDICT_RE = /^\s*(y|yes|n|no)[\s,:]+([a-km-z]{5})[\s.!]*$/i

export function parseVerdict(
  text: string,
): { request_id: string; behavior: 'allow' | 'deny' } | null {
  const m = VERDICT_RE.exec(text)
  if (!m) return null
  return {
    request_id: m[2].toLowerCase(),
    behavior: m[1].toLowerCase().startsWith('y') ? 'allow' : 'deny',
  }
}

// Slack caps chat.postMessage text at ~4000 chars; split on paragraph, then line, then hard.
export function chunk(text: string, limit = 3900): string[] {
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit)
    if (cut < limit / 2) cut = rest.lastIndexOf('\n', limit)
    if (cut < limit / 2) cut = limit
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

// Approval prompt, written to be read aloud: the code comes first, details after.
export function formatPermission(p: {
  request_id: string
  tool_name: string
  description: string
  input_preview: string
}): string {
  const preview =
    p.input_preview.length > 1500
      ? p.input_preview.slice(0, 1500) + ' …'
      : p.input_preview
  return (
    `Approval needed, code ${p.request_id}. ` +
    `Claude wants to use ${p.tool_name}: ${p.description}. ` +
    `Reply "yes ${p.request_id}" or "no ${p.request_id}".\n` +
    '```\n' +
    preview +
    '\n```'
  )
}

// Hold until idle: Claude Code takes a channel message that arrives while the session is
// idle as the owner's instruction, but hands one that arrives mid-turn to Claude as
// untrusted external data. So a message is held while a turn runs and delivered when it
// ends. Permission verdicts are never held: the turn waiting on one is busy by definition.
export function shouldHold(text: string, busy: boolean): boolean {
  return busy && !parseVerdict(text)
}

// Safety net: an interrupted turn never reports its end, so held messages go out anyway
// once the oldest has waited this long. They may then arrive mid-turn, as without holding.
export const HOLD_TIMEOUT_MS = 5 * 60 * 1000

export function holdExpired(heldSince: number, now: number): boolean {
  return now - heldSince >= HOLD_TIMEOUT_MS
}

export type Inbound = { text: string; thread_ts: string; message_ts: string }

// Everything held goes out as one notification: sent separately, the second would land
// mid-turn again. A single message is delivered exactly as if it had not been held.
// Several are listed oldest first, each under a line stating its own thread_ts and
// message_ts so Claude can answer it in its thread; meta carries the latest message's.
export function combine(msgs: Inbound[]): {
  content: string
  meta: { thread_ts: string; message_ts: string }
} {
  const last = msgs[msgs.length - 1]
  const content =
    msgs.length === 1
      ? last.text
      : `${msgs.length} messages arrived while you were working, oldest first. Answer each in its own thread.\n\n` +
        msgs
          .map((m, i) => `Message ${i + 1} (thread_ts ${m.thread_ts}, message_ts ${m.message_ts}):\n${m.text}`)
          .join('\n\n')
  return { content, meta: { thread_ts: last.thread_ts, message_ts: last.message_ts } }
}

// Single-instance lock: the lock file holds the PID of the instance that owns the Slack
// connection. A starting instance takes the bridge only when no live instance holds it,
// so opening another session never silences the one already listening. The exception is
// an explicit takeover (SLACK_BRIDGE_TAKEOVER=1, set by an always-on launcher).
// `alive` reports whether a PID is a running process.
export function shouldTakeBridge(
  lockContent: string | null,
  takeover: boolean,
  alive: (pid: number) => boolean,
): boolean {
  if (takeover) return true
  const owner = Number.parseInt((lockContent ?? '').trim(), 10)
  return !(owner > 0) || !alive(owner) // no valid PID, or a stale lock
}

// The owner keeps listening only while the lock still names it; a takeover replaces the
// PID. Unreadable or empty content counts as "still ours", so a missing file never
// silences the only running bridge.
export function stillOwner(lockContent: string | null, pid: number): boolean {
  const owner = Number.parseInt((lockContent ?? '').trim(), 10)
  return !Number.isFinite(owner) || owner === pid
}

// Parse KEY=value lines from the .env file. Real environment wins over the file.
export function parseEnv(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
