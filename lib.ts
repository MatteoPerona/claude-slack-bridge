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

// Single-instance lock: the lock file holds the PID of the newest bridge. An instance
// keeps listening only while the file still names it; a new session takes over by
// writing its own PID. Unreadable or empty content counts as "still ours", so a
// missing file never silences the only running bridge.
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
