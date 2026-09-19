/**
 * RailKale: Next PC - 车站代码工具
 * 电报码 ↔ 中文名互转，带内存缓存与并发去重
 */

import { getStationCode, parseStationCode } from './api.js'

let cache = null
let nameToTelecode = null
let telecodeToName = null
let loadingPromise = null

/** 加载并缓存车站数据 */
async function loadStations() {
  if (cache) return cache
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const raw = await getStationCode()
    cache = parseStationCode(raw)
    nameToTelecode = {}
    telecodeToName = {}
    for (const s of cache) {
      if (s.name) nameToTelecode[s.name.trim()] = s.telecode
      if (s.telecode) telecodeToName[s.telecode.trim().toUpperCase()] = s.name
    }
    return cache
  })()
  try {
    return await loadingPromise
  } catch (e) {
    loadingPromise = null
    throw e
  } finally {
    if (cache) loadingPromise = null
  }
}

/** 中文名 → 电报码 */
export async function getTelecode(name) {
  if (!name) return null
  await loadStations()
  return nameToTelecode[String(name).trim()] || null
}

/** 电报码 → 中文名 */
export async function getName(telecode) {
  if (!telecode) return null
  await loadStations()
  return telecodeToName[String(telecode).trim().toUpperCase()] || null
}

/**
 * 判断输入是中文名还是电报码，统一返回电报码
 * @param {string} input
 * @returns {Promise<{telecode: string, name: string|null}>}
 */
export async function resolveTelecode(input) {
  if (!input) return { telecode: '', name: null }
  const val = String(input).trim()

  // 全是字母/数字 → 可能是电报码
  if (/^[A-Za-z0-9]+$/.test(val)) {
    const name = await getName(val.toUpperCase())
    return { telecode: val.toUpperCase(), name }
  }

  // 含中文 → 当作车站名处理
  const telecode = await getTelecode(val)
  if (telecode) return { telecode, name: val }

  return { telecode: val, name: null }
}

/** 完整车站列表 */
export async function getStationList() {
  await loadStations()
  return cache
}

/** 车站搜索（用于自动补全） */
export async function searchStations(keyword, limit = 12) {
  const list = await getStationList()
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return []
  const out = []
  for (const s of list) {
    if (
      s.name.toLowerCase().includes(kw) ||
      s.pinyin.toLowerCase().includes(kw) ||
      s.telecode.toLowerCase().includes(kw) ||
      s.abbr.toLowerCase().includes(kw) ||
      s.city.toLowerCase().includes(kw)
    ) {
      out.push(s)
      if (out.length >= limit) break
    }
  }
  return out
}

export function isStationCacheReady() {
  return !!cache
}

export default { getTelecode, getName, resolveTelecode, getStationList, searchStations }
