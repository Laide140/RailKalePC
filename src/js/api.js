/**
 * RailKale: Next PC - API 服务层
 * 移植自移动端 service/api.js，改用 fetch + IPC 支持的持久化配置
 *
 * 数据源（可在设置中切换，默认「新」）：
 *   next   ：新（推荐）  https://next.laide.net.cn/api
 *   old    ：旧          https://rail.laide.asia/api
 *   railgo ：RailGo 友商 https://railgo-api.zenglingkun.cn/api/v2
 */

import { getKey } from './keys.js'
import { getApiSource } from './settings.js'

export const NEXT_BASE = 'https://next.laide.net.cn/api'
export const OLD_BASE = 'https://rail.laide.asia/api'
export const RAILGO_BASE = 'https://rg-api.zenglingkun.cn/api/v2'

// RailGo 支持的端点（其余端点自动回退到新源）
const RAILGO_SUPPORTED = ['getStationBigScreen', 'getExit', 'mapLine']

// 需要尾斜杠的 v2 风格端点
const SLASHED = [
  'getStationBigScreen', 'getExit', 'mapLine',
  'getStationArea', 'getLineTrains', 'getStationInfo'
]

/** 当前选中的数据源 */
export function currentSource() {
  const s = getApiSource()
  return (s === 'old' || s === 'railgo' || s === 'next') ? s : 'next'
}

/**
 * 解析某端点实际使用的 base url
 * @param {string} endpoint 端点名，如 'getStationBigScreen'
 */
export function resolveBase(endpoint) {
  const src = currentSource()
  if (src === 'railgo' && RAILGO_SUPPORTED.indexOf(endpoint) >= 0) {
    return { base: RAILGO_BASE, source: 'railgo' }
  }
  if (src === 'old') return { base: OLD_BASE, source: 'old' }
  return { base: NEXT_BASE, source: 'next' }
}

/** 当前源的基础地址 */
export function getApiBase(endpoint) {
  return resolveBase(endpoint || '').base
}

function endpointUrl(endpoint, r) {
  if (r.source === 'railgo') return r.base + '/' + endpoint
  if (SLASHED.indexOf(endpoint) >= 0) return r.base + '/' + endpoint + '/'
  return r.base + '/' + endpoint
}

function buildQuery(data) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, item)
    } else {
      params.append(k, v)
    }
  }
  const qs = params.toString()
  return qs ? '?' + qs : ''
}

/** 带超时的 fetch */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/** JSON 请求 */
/**
 * 解析接口错误信息
 * 接口在 4xx 时会返回 { error, message, hint }，其中文案对用户是有意义的
 * （如「未找到站点: 北京南」），因此需要透出而不是统一成「网络异常」。
 */
function extractApiError(status, text) {
  try {
    const j = JSON.parse(text)
    const msg = j.error || j.message || j.msg
    if (msg) return msg
  } catch (e) { /* 非 JSON，忽略 */ }
  return 'HTTP ' + status
}

/** 带业务错误信息的请求异常 */
export class ApiError extends Error {
  constructor(message, status, url) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

async function requestJSON(url, timeout = 15000) {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, timeout)
  const text = await res.text()

  if (!res.ok) {
    throw new ApiError(extractApiError(res.status, text), res.status, url)
  }

  try {
    return JSON.parse(text)
  } catch (e) {
    throw new ApiError('响应不是合法 JSON', res.status, url)
  }
}

/** 二进制请求 */
async function requestBinary(url, timeout = 30000) {
  const res = await fetchWithTimeout(url, {}, timeout)
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res
}

/**
 * 按端点名请求（自动解析 base / 路径 / 回退）
 */
export function requestEndpoint(endpoint, data = {}, opts = {}) {
  const r = resolveBase(endpoint)
  return requestJSON(endpointUrl(endpoint, r) + buildQuery(data), opts.timeout || 15000)
}

// ---------------------------------------------------------------------------
// 端点
// ---------------------------------------------------------------------------

/** 1. 车站代码表 GET /getStationCode/index.php */
export function getStationCode() {
  return requestEndpoint('getStationCode/index.php')
}

/** 2. 车次查询 GET /getTrains */
export function getTrains(from, to, date) {
  const data = { from, to }
  if (date) data.date = date
  return requestEndpoint('getTrains', data)
}

/** 3. 时刻表 GET /getTrainTimeTable/index.php */
export function getTrainTimeTable(train, date) {
  return requestEndpoint('getTrainTimeTable/index.php', { train, date })
}

/**
 * 3.1 余票 GET /getLeftTicket
 *
 * 注意：该端点 date 为必填，缺失会返回 400「缺少日期参数」，
 * 因此此处统一补默认值（今天）。
 */
export function getLeftTickets(from, to, date) {
  if (!from || !to) {
    return Promise.reject(new Error('余票查询缺少 from/to 参数'))
  }
  return requestEndpoint('getLeftTicket', { from, to, date: date || todayStr() })
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 3.2 站台规模 GET /getStationArea/ */
export function getStationArea(station) {
  return requestEndpoint('getStationArea', { station })
}

/** 4. 列车实时位置 GET /getTrainLocate/index.php */
export function getTrainLocate(train) {
  return requestEndpoint('getTrainLocate/index.php', { train })
}

/** 5. 纪念车票 GET /getTicket（返回图片二进制） */
export async function getTicket(params) {
  const r = resolveBase('getTicket')
  const res = await requestBinary(endpointUrl('getTicket', r) + buildQuery(params), 30000)
  return await res.arrayBuffer()
}

/** 6. 车站大屏 GET /getStationBigScreen */
export function getStationBigScreen(stationTelecode) {
  return requestEndpoint('getStationBigScreen', { stationTelecode })
}

/** 7. 检票口 GET /getExit */
export function getExit(trainNum, stationTelecode) {
  return requestEndpoint('getExit', { trainNum, stationTelecode })
}

/** 8. 线路图数据 GET /mapLine */
export function getMapLine(train) {
  return requestEndpoint('mapLine', { train })
}

/** 8.1 按车站查线路上运行的车次 GET /getLineTrains/ */
export function getLineTrains(stations) {
  return requestEndpoint('getLineTrains', { station: stations || [] })
}

/** 8.2 车站交通接驳 GET /getStationInfo/ */
export function getStationInfo(stationCode) {
  return requestEndpoint('getStationInfo', { stationCode })
}

/** 9. 12306 官方检票口（POST 表单） */
export async function queryTicketCheck(trainDate, stationTrainCode, fromStationTelecode) {
  const body = new URLSearchParams({
    trainDate,
    station_train_code: stationTrainCode,
    from_station_telecode: fromStationTelecode
  })
  const res = await fetchWithTimeout(
    'https://www.12306.cn/index/otn/index12306/queryTicketCheck',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    15000
  )
  return JSON.parse(await res.text())
}

/** 10. 路网 GeoJSON 索引 */
export function getRailwayIndex() {
  return requestEndpoint('getTrainTimeTable/railway/index.php')
}

/** 11. 路网 GeoJSON 数据 */
export function getRailwayGeoJSON(filename) {
  return requestEndpoint('getTrainTimeTable/railway/' + filename, {}, { timeout: 60000 })
}

/** 11.1 GeoJSON 目录（跟随 API 源） */
export function getRailwayDir() {
  return getApiBase('getTrainTimeTable/railway/index.php') + '/getTrainTimeTable/railway'
}

/** 12. 高德静态地图 URL */
export function getAmapStaticMap(size, markers, paths) {
  const key = getKey('amap')
  let url = `https://restapi.amap.com/v3/staticmap?size=${size}&key=${encodeURIComponent(key)}`
  if (markers) url += `&markers=${encodeURIComponent(markers)}`
  if (paths) url += `&paths=${encodeURIComponent(paths)}`
  return url
}

/** 13. 列车广播 TTS - 讯飞（自有接口，走新源） */
export function getTrainBroadcastUrl(text, opts = {}) {
  const speed = opts.speed ? '&speed=' + opts.speed : ''
  const pitch = opts.pitch ? '&pitch=' + opts.pitch : ''
  return NEXT_BASE + '/getXiaoYanTTS/?context=' + encodeURIComponent(text) + speed + pitch + '&_t=' + Date.now()
}

/** 14. 列车广播 TTS - 百度 */
export function getBaiduTtsUrl(text, speed = 5) {
  return 'https://fanyi.baidu.com/gettts?lan=zh&text=' + encodeURIComponent(text) + '&spd=' + speed + '&source=web&_t=' + Date.now()
}

/** 运用担当：按车次查车组 / 按车组查交路（外部数据源 rail.re） */
export async function railReTrain(trainNo) {
  const res = await fetchWithTimeout('https://api.rail.re/train/' + encodeURIComponent(trainNo), {}, 15000)
  const text = await res.text()
  return JSON.parse(text)
}

export async function railReEmu(emuNo) {
  const res = await fetchWithTimeout('https://api.rail.re/emu/' + encodeURIComponent(emuNo), {}, 15000)
  const text = await res.text()
  return JSON.parse(text)
}

/** 解析车站代码数据 */
export function parseStationCode(rawData) {
  if (!Array.isArray(rawData)) return []
  return rawData.map(item => {
    const parts = String(item).split('|')
    return {
      code: parts[0] ? parts[0].replace('@', '') : '',
      name: parts[1] || '',
      telecode: parts[2] || '',
      pinyin: parts[3] || '',
      abbr: parts[4] || '',
      cityCode: parts[6] || '',
      city: parts[7] || ''
    }
  })
}
