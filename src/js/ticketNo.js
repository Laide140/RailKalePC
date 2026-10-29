/**
 * RailKale: Next PC - 纪念车票票号
 *
 * 规则（与移动端一致）：默认 A000001，每生成一张自增 1；
 *       超过 A999999 后回卷到 A000001。
 *
 * 序号持久化在本地缓存（localStorage → 应用数据目录），
 * 清缓存或重装后从 1 重新开始。
 */

const STORAGE_KEY = 'ticket_seq'
const PREFIX = 'A'
const MAX = 999999

function readSeq() {
  try {
    const raw = window.localStorage.getItem('rkpc:' + STORAGE_KEY)
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    return 0
  }
}

function writeSeq(n) {
  try {
    window.localStorage.setItem('rkpc:' + STORAGE_KEY, String(n))
  } catch (e) { /* 配额或不可用，忽略 */ }
}

/**
 * 读取当前已生成到第几张（不递增）
 * @returns {number} 1 ~ 999999
 */
export function peekTicketSeq() {
  return (readSeq() % MAX) + 1
}

/**
 * 取下一张票的序号并持久化
 * @returns {number} 1 ~ 999999
 */
export function nextTicketSeq() {
  const next = peekTicketSeq()
  writeSeq(next)
  return next
}

/**
 * 序号 → 票号字符串
 * @param {number} seq 1 ~ 999999
 * @returns {string} 如 A000001
 */
export function formatTicketNo(seq) {
  let n = parseInt(seq, 10)
  if (!Number.isFinite(n) || n < 1) n = 1
  if (n > MAX) n = ((n - 1) % MAX) + 1
  return PREFIX + String(n).padStart(6, '0')
}

/**
 * 票号字符串 → 序号（用于用户手工填写后继续自增）
 * @param {string} ticketNo 如 A000123
 * @returns {number} 解析失败返回 0
 */
export function parseTicketNo(ticketNo) {
  const m = String(ticketNo || '').trim().match(/^[A-Za-z]?(\d{1,6})$/)
  if (!m) return 0
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 1 ? n : 0
}

export default { peekTicketSeq, nextTicketSeq, formatTicketNo, parseTicketNo }
