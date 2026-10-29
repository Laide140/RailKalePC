/**
 * RailKale: Next PC - API 服务层
 * 移植自移动端 service/api.js（v3），改用 fetch + IPC 支持的持久化配置
 *
 * 数据源（可在设置中切换，默认「新」）：
 *   next   ：新（推荐）  https://next.laide.net.cn/api/v3（部分端点仍在 /api）
 *   old    ：旧          https://rail.laide.asia/api
 *   railgo ：RailGo 友商 https://rg-api.zenglingkun.cn/api/v2
 *
 * 说明：RailGo 仅支持部分端点（车站大屏 / 检票口 / 线路图），
 * 其它端点若选择了 RailGo，会自动回退到「新」数据源。
 */

import { getKey } from './keys.js'
import { getApiSource } from './settings.js'
import { getTelecode } from './station.js'

/** 「新」数据源 V3：/api/v3，路径为短名、不带 .php 与尾斜杠 */
export const NEXT_BASE = 'https://next.laide.net.cn/api/v3'
/** 「新」数据源 V2：/api，基于 Node，车次 / 余票等端点在此 */
export const NEXT_V2_BASE = 'https://next.laide.net.cn/api'
export const OLD_BASE = 'https://rail.laide.asia/api'
export const RAILGO_BASE = 'https://rg-api.zenglingkun.cn/api/v2'

/**
 * /api/v3 下的端点名。旧名 /api/getXxx 在 v3 下都是 404，
 * 车次 / 余票 / 路网索引等未进 v3 的端点仍留在 /api。
 */
const V3_PATH = {
  getStationCode: 'stationCode',
  getStationBigScreen: 'stationBigScreen',
  getExit: 'stationExit',
  getStationArea: 'stationArea',
  getLineTrains: 'lineTrains',
  getStationInfo: 'stationInfo',
  getStationSaleTimeInfo: 'stationSaleTimeInfo',
  getTrainTimeTable: 'trainTimeTable',
  getTrainLocate: 'trainLocate',
  getTrainData: 'emu',
  bureauMap: 'bureauMap',
  mapLine: 'mapLine',
  getTrains: 'getTrains'
}

// RailGo 支持的端点集合（其余端点自动回退到新源）
const RAILGO_SUPPORTED = ['getStationBigScreen', 'getExit', 'mapLine']

// 旧源下需要尾斜杠的 v2 风格端点（避免 301）；RailGo 不能带尾斜杠
const SLASHED = [
  'getStationBigScreen', 'getExit', 'mapLine',
  'getStationArea', 'getLineTrains', 'getStationInfo', 'getStationSaleTimeInfo'
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
  // 已进 v3 的端点走 /api/v3；其余（车次 / 余票等）仍走 /api
  if (V3_PATH[endpoint]) return { base: NEXT_BASE, source: 'next' }
  return { base: NEXT_V2_BASE, source: 'next-v2' }
}

/** 当前源的基础地址 */
export function getApiBase(endpoint) {
  return resolveBase(endpoint || '').base
}

function endpointUrl(endpoint, r) {
  // v3：短名、不带 .php 与尾斜杠
  if (r.source === 'next') return r.base + '/' + V3_PATH[endpoint]
  if (r.source === 'railgo') return r.base + '/' + endpoint
  if (SLASHED.indexOf(endpoint) >= 0) return r.base + '/' + endpoint + '/'
  return r.base + '/' + endpoint
}

/**
 * 取某端点的完整 URL（供页面自己拼查询串的场景，如雷达）
 * @param {string} endpoint
 */
export function endpointHref(endpoint) {
  return endpointUrl(endpoint, resolveBase(endpoint))
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
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

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
  if (!res.ok) throw new ApiError(extractApiError(res.status, text), res.status, url)
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new ApiError('响应不是合法 JSON', res.status, url)
  }
}

async function requestBinary(url, timeout = 30000) {
  const res = await fetchWithTimeout(url, {}, timeout)
  if (!res.ok) throw new ApiError('HTTP ' + res.status, res.status, url)
  return res
}

/** 按端点名请求（自动解析 base / 路径 / 回退） */
export function requestEndpoint(endpoint, data = {}, opts = {}) {
  const r = resolveBase(endpoint)
  return requestJSON(endpointUrl(endpoint, r) + buildQuery(data), opts.timeout || 15000)
}

// ---------------------------------------------------------------------------
// 端点
// ---------------------------------------------------------------------------

/** 1. 车站代码表 */
export function getStationCode() {
  return requestEndpoint('getStationCode')
}

/** 2. 车次查询 */
export function getTrains(from, to, date) {
  const data = { from, to }
  if (date) data.date = date
  return requestEndpoint('getTrains', data)
}

/** 3. 时刻表 */
export function getTrainTimeTable(train, date) {
  return requestEndpoint('getTrainTimeTable', { train, date })
}

/**
 * 3.1 余票
 * 注意：该端点 date 为必填，缺失会返回 400「缺少日期参数」，因此统一补默认值。
 */
export function getLeftTickets(from, to, date) {
  if (!from || !to) return Promise.reject(new Error('余票查询缺少 from/to 参数'))
  return requestEndpoint('getLeftTicket', { from, to, date: date || todayStr() })
}

/** 3.2 站台规模 */
export function getStationArea(station) {
  return requestEndpoint('getStationArea', { station })
}

/** 4. 列车实时位置 */
export function getTrainLocate(train) {
  return requestEndpoint('getTrainLocate', { train })
}

/** 5. 纪念车票（返回图片二进制） */
export async function getTicket(params) {
  const r = resolveBase('getTicket')
  const res = await requestBinary(endpointUrl('getTicket', r) + buildQuery(params), 30000)
  return await res.arrayBuffer()
}

/** 6. 车站大屏 */
export function getStationBigScreen(stationTelecode) {
  return requestEndpoint('getStationBigScreen', { stationTelecode })
}

/** 7. 检票口 */
export function getExit(trainNum, stationTelecode) {
  return requestEndpoint('getExit', { trainNum, stationTelecode })
}

/** 8. 线路图数据 */
export function getMapLine(train) {
  return requestEndpoint('mapLine', { train })
}

/** 8.1 按车站查线路上运行的车次（列车雷达） */
export function getLineTrains(stations) {
  return requestEndpoint('getLineTrains', { station: stations || [] })
}

/** 8.2 车站交通接驳 */
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

/**
 * 13. 列车广播 TTS - 讯飞（自有接口，始终走新源）
 */
export function getTrainBroadcastUrl(text, opts = {}) {
  const speed = opts.speed ? '&speed=' + opts.speed : ''
  const pitch = opts.pitch ? '&pitch=' + opts.pitch : ''
  return NEXT_BASE + '/xiaoyanTTS?context=' + encodeURIComponent(text) + speed + pitch + '&_t=' + Date.now()
}

/** 14. 列车广播 TTS - 百度 */
export function getBaiduTtsUrl(text, speed = 5) {
  return 'https://fanyi.baidu.com/gettts?lan=zh&text=' + encodeURIComponent(text) + '&spd=' + speed + '&source=web&_t=' + Date.now()
}

// ---------------------------------------------------------------------------
// 算路器
// ---------------------------------------------------------------------------

/**
 * 算路器 —— 任意两站之间的最短走行线路（CRTrainRoute）
 * GET /api/v3/stationRoute?from={站名或电报码}&to={...}&km={可选目标里程}&ver={1|2}
 *
 * 响应要点：
 *   distance.meters / kilometers  走行距离
 *   stations[]                    途经车站（按沿线里程升序，含 km / offsetM）
 *   geometry.coordinates          LineString [lng, lat] 数组（GCJ-02，可直接上高德地图）
 *   ferry                         跨海轮渡信息
 *   kmPlan                        指定里程规划详情，未指定为 null
 *
 * 注：该端点冷启动较慢（实测首个请求 10s+），且指定里程模式服务端要跑 45s+，
 * 因此超时统一放宽到 120s；失败时返回 { ok:false, error, hint } 而不是抛错。
 *
 * @param {string} from 起点站名或电报码
 * @param {string} to   终点站名或电报码
 * @param {number} [km] 目标里程（公里），留空走最短路
 * @param {number} [ver] 指定里程模式：1=整段（大概里程，默认，快）；2=微调（精确里程，慢）
 */
export async function getStationRoute(from, to, km, ver) {
  let url = NEXT_BASE + '/stationRoute?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to)
  if (km) url += '&km=' + encodeURIComponent(km)
  if (ver) url += '&ver=' + encodeURIComponent(ver)

  let res
  try {
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 120000)
  } catch (e) {
    return { ok: false, error: '算路请求超时或网络异常', hint: '该接口冷启动较慢，可稍后重试' }
  }

  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (e) { /* 504/502 时服务端返回 HTML 错误页 */ }

  if (!json) {
    if (res.status === 504) return { ok: false, error: '算路超时，请稍后重试', hint: '指定里程模式计算较慢' }
    if (res.status === 502) return { ok: false, error: '算路服务暂不可用' }
    if (!res.ok) return { ok: false, error: '算路失败（HTTP ' + res.status + '）' }
    return { ok: false, error: '算路返回数据无法解析' }
  }
  // 接口用 ok 字段表示成功，失败时带 error / hint
  if (json.ok === false) {
    return { ok: false, error: json.error || '算路失败', hint: json.hint || '', statusCode: res.status }
  }
  return json
}

// ---------------------------------------------------------------------------
// 车站开售时间
// ---------------------------------------------------------------------------

/**
 * 车站开售时间 —— 自有数据源
 * GET /api/v3/stationSaleTimeInfo（返回全部车站，约 3149 条 / 800KB，忽略入参）
 * sale_time 为 4 位字符串，如 "1630" 表示每日 16:30 起售。
 */
export function getStationSaleTimeInfo() {
  return requestEndpoint('getStationSaleTimeInfo', {}, { timeout: 60000 })
}

/** 铁路局代码 → 名称 */
export const BUREAU_NAMES = {
  B: '哈尔滨局', C: '呼和浩特局', F: '郑州局', G: '南昌局', H: '上海局',
  I: '边境口岸', J: '兰州局', K: '济南局', M: '昆明局', N: '武汉局',
  O: '青藏铁路公司', P: '北京局', Q: '广铁集团', R: '乌鲁木齐局', T: '沈阳局',
  U: '广东城际铁路公司', V: '太原局', W: '成都局', X: '香港铁路公司',
  Y: '西安局', Z: '南宁局'
}

/** 路局简码 → 简称（如 B → 哈局） */
export const BUREAU_SHORT_NAMES = {
  B: '哈局', C: '呼局', F: '郑局', G: '南局', H: '上局',
  I: '口岸', J: '兰局', K: '济局', M: '昆局', N: '武局',
  O: '青藏', P: '京局', Q: '广铁', R: '乌局', T: '沈局',
  U: '广东城际', V: '太局', W: '成局', X: '港铁',
  Y: '西局', Z: '宁局'
}

/** 路局备注（号段来历等） */
export const BUREAU_NOTES = {
  I: '实际作为转义字符，不作常规使用',
  U: '原归属上海局徐州分局，铁路分局建制撤销后号段清空，后由广东城际接手使用',
  X: '原归属齐齐哈尔局，并入哈尔滨局后号段清空，后由港铁接手使用'
}

/**
 * 是否为已改名的车站
 *
 * 数据源中 bureau_code 为空即表示该站已改名：原站名对应的记录不再
 * 归属任何路局，station_telecode 也一并为空（电报码随旧站名作废）。
 */
export function isRenamedStation(item) {
  return !String((item && item.bureau_code) || '').trim()
}

/** 取路局全称；未收录的代码返回空串 */
export function bureauName(code) {
  return BUREAU_NAMES[String(code || '').trim().toUpperCase()] || ''
}

/** 取路局简称；未收录时回退为全称 */
export function bureauShortName(code) {
  const c = String(code || '').trim().toUpperCase()
  return BUREAU_SHORT_NAMES[c] || BUREAU_NAMES[c] || ''
}

/** "1630" → "16:30" */
export function formatSaleTime(t) {
  const s = String(t || '').trim()
  if (!/^\d{4}$/.test(s)) return s || '—'
  return s.slice(0, 2) + ':' + s.slice(2)
}

// ---------------------------------------------------------------------------
// 车组运用（车次 ↔ 车组号）
// ---------------------------------------------------------------------------

/**
 * 按日期查询车次担当车组 —— 自有数据源
 * GET /api/v3/emu?train={车次}&date={YYYYMMDD}
 *
 * 同一车次在不同日期的担当车组可能不同。日期格式必须是 8 位 YYYYMMDD；
 * 服务端数据只覆盖近期，超出范围会回退到最近可用日期（metadata.date_used）。
 */
export async function getTrainInfoByDate(train, date) {
  const day = compactDate(date)
  let url = NEXT_BASE + '/emu?train=' + encodeURIComponent(train)
  if (/^\d{8}$/.test(day)) url += '&date=' + day
  try {
    const res = await requestJSON(url, 15000)
    if (!res || !res.success || !res.data) return null
    return {
      trainSet: res.data.carGroup || '',
      date: res.data.date || '',
      dateUsed: (res.metadata && res.metadata.date_used) || res.data.date || ''
    }
  } catch (e) {
    return null
  }
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' */
export function compactDate(d) {
  return String(d || '').replace(/-/g, '')
}

/** 今天，'YYYY-MM-DD' */
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 车组运用数据（车次 ↔ 车组号 担当关系）— 自有数据源
 * GET /api/v3/emu?train={车次}&date={YYYYMMDD}   按车次查
 * GET /api/v3/emu?tn={车组号}&date={YYYYMMDD}    按车组查
 *
 * 注意参数名不同：按车次查用 train，按车组查必须用 tn。
 * 传车次 → data 为对象 { train, carGroup, date }；传车组 → data 为数组。
 *
 * @returns {Promise<{list: Array, single: Object|null}>}
 */
export async function getTrainData(mode, value, date) {
  const key = mode === 'emu' ? 'tn' : 'train'
  const day = compactDate(date)
  let url = NEXT_BASE + '/emu?' + key + '=' + encodeURIComponent(value)
  if (/^\d{8}$/.test(day)) url += '&date=' + day
  try {
    const res = await requestJSON(url, 15000)
    if (!res || !res.success) return { list: [], single: null }
    // 字段名统一为 trainSet，方便页面复用
    const norm = (o) => (o ? { train: o.train, trainSet: o.carGroup || '', date: o.date || '' } : null)
    const data = res.data
    if (Array.isArray(data)) return { list: data.map(norm).filter(Boolean), single: null }
    return { list: data ? [norm(data)] : [], single: norm(data) }
  } catch (e) {
    return { list: [], single: null }
  }
}

/** 查询某车次的担当车组号 */
export async function getTrainSetOfTrain(train, date) {
  const res = await getTrainData('train', train, date)
  if (res.single && res.single.trainSet) return res.single.trainSet
  return (res.list[0] && res.list[0].trainSet) || ''
}

/** 查询某车组担当的全部车次 */
export async function getTrainsOfTrainSet(trainSet, date) {
  const res = await getTrainData('emu', trainSet, date)
  return res.list
}

// ---------------------------------------------------------------------------
// 列车（车组）资料 —— 自有数据源 /12306/train/
//
// 目录约定：
//   /12306/train/{车型}/carInfo.json   列车信息（编组/长度/定员/时速/餐车…）
//   /12306/train/{车型}/carPic.png     列车大图
//   /12306/train/{车型}/{0-7}.png      车厢图（按标号取，缺图时跳过）
//
// carInfo.json 的 pictureUrl 为 MD5 文件名，实际图片地址是
//   https://wifi.12306.cn/resourcecenter/cateringimages/{md5}.png
// ---------------------------------------------------------------------------

const RAILWAY_ASSET_BASE = 'https://next.laide.net.cn/12306/train'
const CATERING_BASE = 'https://wifi.12306.cn/resourcecenter/cateringimages'

/** 车型（去掉车组序号与短横线）：CR400BF-A-5061 → CR400BF-A */
export function carModelOf(trainSet) {
  const s = String(trainSet || '').trim()
  const m = s.match(/^(.*?)-?\d+$/)
  return m ? m[1] : s
}

/** 列车信息 JSON 地址 */
export function carInfoUrl(trainSet) {
  return `${RAILWAY_ASSET_BASE}/${encodeURIComponent(carModelOf(trainSet))}/carInfo.json`
}

/** 列车大图地址 */
export function carPicUrl(trainSet) {
  return `${RAILWAY_ASSET_BASE}/${encodeURIComponent(carModelOf(trainSet))}/carPic.png`
}

/** 车厢图地址：index 为车厢序号（从 0 开始） */
export function carDiagramUrl(trainSet, index) {
  return `${RAILWAY_ASSET_BASE}/${encodeURIComponent(carModelOf(trainSet))}/${index}.png`
}

/** carInfo 的 pictureUrl（MD5 文件名）→ 12306 实际图片地址 */
export function cateringImageUrl(pictureUrl) {
  const md5 = String(pictureUrl || '').trim()
  if (!md5) return ''
  if (/^https?:\/\//.test(md5)) return md5
  return `${CATERING_BASE}/${md5.replace(/\.png$/i, '')}.png`
}

/** 车型 → 编组节数 的内存缓存（本次会话内有效） */
const formationCache = {}

/**
 * 从 carInfo 数组里取编组节数（「列车编组」条目的 pictureValue 形如 "16辆"）
 * @returns {number} 读不到时返回 0
 */
function formationOfInfo(info) {
  if (!Array.isArray(info)) return 0
  const row = info.find(x => x && x.pictureName === '列车编组')
  const m = /(\d+)/.exec(String((row && row.pictureValue) || ''))
  return m ? Number(m[1]) : 0
}

/** 拉 carInfo.json，按 picOrder 排序；失败返回空数组 */
async function fetchCarInfo(trainSet) {
  try {
    const res = await fetchWithTimeout(carInfoUrl(trainSet), { headers: { Accept: 'application/json' } }, 15000)
    if (!res.ok) return []
    const d = JSON.parse(await res.text())
    return Array.isArray(d) ? d.slice().sort((a, b) => (a.picOrder || 0) - (b.picOrder || 0)) : []
  } catch (e) {
    return []
  }
}

/**
 * 编组车厢数探测
 *
 * 首选 carInfo.json 里的「列车编组」字段（一次请求拿到全部资料）；
 * 拿不到时退回图片探测：图片按序号命名、序号从 0 开始，N 编组共 N 张图，
 * 即 16.png 存在 → 17 编组，15.png 存在 → 16 编组，都不存在 → 8 编组。
 *
 * @returns {Promise<number>} 编组节数（8 | 16 | 17）
 */
export async function detectFormation(trainSet) {
  const model = carModelOf(trainSet)
  if (!model) return 8
  if (formationCache[model] !== undefined) return formationCache[model]

  const fromInfo = formationOfInfo(await fetchCarInfo(model))
  if (fromInfo) {
    formationCache[model] = fromInfo
    return fromInfo
  }

  const exists = async (n) => {
    try {
      const res = await fetchWithTimeout(`${RAILWAY_ASSET_BASE}/${encodeURIComponent(model)}/${n}.png`, { method: 'HEAD' }, 8000)
      return res.ok
    } catch (e) {
      return false
    }
  }

  let n = 8
  if (await exists(16)) n = 17
  else if (await exists(15)) n = 16

  formationCache[model] = n
  return n
}

/** 生成某车型全部车厢图地址 */
export function carDiagramUrls(trainSet, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(carDiagramUrl(trainSet, i))
  return out
}

/**
 * 拉取车组资料：carInfo.json + 车厢图地址
 *
 * 车厢图按约定直接生成 0~N 的地址，不做存在性探测
 * （个别标号缺图时交由 <img> 的 error 事件处理）。
 *
 * @returns {Promise<{info: Array, diagrams: string[], carPic: string, formation: number}>}
 */
export async function getTrainSetInfo(trainSet) {
  const set = String(trainSet || '').trim()
  if (!set) return { info: [], diagrams: [], carPic: '', formation: 0 }

  const info = await fetchCarInfo(set)
  let count = formationOfInfo(info)
  if (!count) {
    count = await detectFormation(set)
  } else {
    formationCache[carModelOf(set)] = count
  }

  return {
    info,
    diagrams: carDiagramUrls(set, count || 8),
    carPic: carPicUrl(set),
    formation: count || 0
  }
}

// ---------------------------------------------------------------------------
// 车次综合信息
// ---------------------------------------------------------------------------

/**
 * 车次综合信息（时刻表 + 线路 + 实时位置 + 担当车组）
 *
 * 各子项互不阻塞：任一失败只影响对应区块，并通过 onPartial 分步回传，
 * 让页面能先渲染快的那部分（冷缓存下 getTrainLocate 可达 5s+）。
 */
export async function getTrainDetail(train, date, onPartial) {
  const trainNo = String(train || '').trim().toUpperCase()
  const day = date || todayStr()

  const emit = (patch) => {
    if (!onPartial) return
    try { onPartial(patch) } catch (e) { /* 渲染回调异常不影响数据流 */ }
  }

  const [tt, line, loc, td] = await Promise.all([
    getTrainTimeTable(trainNo, day).catch(() => null).then(r => {
      const v = (r && r.code === 0 && r.data) ? r.data : null
      if (v) emit({ timetable: v })
      return v
    }),
    getMapLine(trainNo).catch(() => null).then(r => {
      const v = (r && r.success && r.data) ? r.data : null
      if (v) emit({ line: v })
      return v
    }),
    getTrainLocate(trainNo).catch(() => null).then(r => {
      const v = (r && r.code === 0) ? (r.data || null) : null
      if (v) emit({ locate: v })
      return v
    }),
    // 担当车组按日期查询：同一车次不同日期的车组可能不同
    getTrainInfoByDate(trainNo, day).then(r => {
      const v = (r && r.trainSet) || ''
      if (v) emit({ trainSet: v })
      return v
    })
  ])

  const result = {
    train: trainNo,
    date: day,
    timetable: tt,
    platformMap: {},
    line,
    locate: loc,
    trainSet: td,
    trainSetTrains: []
  }

  // 该车组担当的全部车次（独立补充，不阻塞主体）
  if (result.trainSet) {
    result.trainSetTrains = await getTrainsOfTrainSet(result.trainSet)
  }
  return result
}

/**
 * 停台查询（独立于主流程）
 *
 * 需要车站中文名 → 电报码，而电报码来自整张车站表（约 167KB），
 * 因此单独调用，让页面主体先渲染、停台后到后填。
 *
 * @returns {Promise<Object>} { 站名: { platform, entrance, exit } }
 */
export async function getPlatformMap(trainNo, stops) {
  if (!trainNo || !stops || !stops.length) return {}
  const map = {}
  await Promise.all(stops.map(async (stop) => {
    const name = stop && stop.station_name
    if (!name || map[name]) return
    try {
      const telecode = await getTelecode(name)
      if (!telecode) return
      const res = await getExit(trainNo, telecode)
      if (res && res.success && res.data) {
        map[name] = {
          platform: res.data.platform || '',
          entrance: res.data.entrance || [],
          exit: res.data.exit || []
        }
      }
    } catch (e) { /* 单站失败忽略 */ }
  }))
  return map
}

// ---------------------------------------------------------------------------
// 其它
// ---------------------------------------------------------------------------

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
