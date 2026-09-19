/**
 * RailKale: Next PC - 设置管理
 * 通过 preload 暴露的 window.native.store 持久化到 userData/railkalenext-config.json
 */

export const SETTINGS_KEY = 'app_settings'

export const DEFAULT_SETTINGS = {
  homeLayout: 'card',        // 'card' | 'grid' | 'custom'
  themeColor: '#007aff',
  apiSource: 'next',         // 'next' | 'old' | 'railgo'
  customCards: [],           // [{ id, title, color, bgImage, features: [...] }]
  keys: {},                  // 密钥覆盖：{ amap: 'default' | '自定义值' }
  cache: {}                  // 缓存（如路网 GeoJSON 目录索引等）
}

let state = { ...DEFAULT_SETTINGS }
let loaded = false
const listeners = new Set()

function store() {
  return (typeof window !== 'undefined' && window.native && window.native.store) || null
}

/** 从磁盘读取（应用启动时调用一次） */
export async function initSettings() {
  const api = store()
  if (!api) { loaded = true; return state }
  try {
    const data = await api.getAll()
    state = { ...DEFAULT_SETTINGS, ...(data || {}) }
  } catch (e) {
    console.error('[settings] 读取失败', e)
  }
  loaded = true
  emit()
  return state
}

export function isLoaded() { return loaded }

/** 同步读取当前设置（须先 initSettings） */
export function getSettings() { return state }

/** 合并并持久化设置 */
export async function saveSettings(patch) {
  state = { ...state, ...(patch || {}) }
  emit()
  const api = store()
  if (api) {
    try {
      const next = await api.set(patch || {})
      state = { ...DEFAULT_SETTINGS, ...(next || state) }
      emit()
    } catch (e) {
      console.error('[settings] 保存失败', e)
    }
  }
  return state
}

/** 重置为默认 */
export async function resetSettings() {
  const api = store()
  if (api) {
    try { await api.reset() } catch (e) { /* ignore */ }
  }
  state = { ...DEFAULT_SETTINGS }
  emit()
  return state
}

/** 订阅变更 */
export function onSettingsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) {
    try { fn(state) } catch (e) { console.error(e) }
  }
}

// ---------------------------------------------------------------------------
// 便捷读取
// ---------------------------------------------------------------------------

export function getApiSource() {
  return state.apiSource || 'next'
}

export function getThemeColor() {
  return state.themeColor || '#007aff'
}

export function getHomeLayout() {
  return state.homeLayout || 'card'
}

export function getCustomCards() {
  return state.customCards || []
}

export function getKeyOverrides() {
  return state.keys || {}
}

/**
 * 轻量键值缓存（供路网 GeoJSON 等大块数据使用）
 *
 * 注意：页面以 file:// 加载时，localStorage 在部分环境下会抛出
 * "localStorage is not available for opaque origins"，因此这里做能力探测，
 * 不可用时降级为内存缓存（当次会话有效）。
 */

const memCache = new Map()

/** 探测 localStorage 是否真的可用 */
function localStorageAvailable() {
  try {
    const k = '__rk_probe__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch (e) {
    return false
  }
}

let lsOK = null
function ls() {
  if (lsOK === null) lsOK = localStorageAvailable()
  return lsOK ? window.localStorage : null
}

/** 缓存是否持久化（false 表示仅内存，重启后丢失） */
export function cacheIsPersistent() {
  return ls() !== null
}

export function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key)
  const s = ls()
  if (!s) return null
  try {
    const raw = s.getItem('rkpc:' + key)
    if (!raw) return null
    const val = JSON.parse(raw)
    memCache.set(key, val)
    return val
  } catch (e) {
    return null
  }
}

export function cacheSet(key, value) {
  memCache.set(key, value)
  const s = ls()
  if (!s) return false
  try {
    s.setItem('rkpc:' + key, JSON.stringify(value))
    return true
  } catch (e) {
    console.warn('[cache] 写入失败（可能超出配额）', key, e && e.name)
    return false
  }
}

export function cacheRemove(key) {
  memCache.delete(key)
  const s = ls()
  if (!s) return
  try { s.removeItem('rkpc:' + key) } catch (e) { /* ignore */ }
}

export function cacheClear() {
  const n = memCache.size
  memCache.clear()
  const s = ls()
  if (!s) return n
  try {
    const keys = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith('rkpc:')) keys.push(k)
    }
    keys.forEach(k => s.removeItem(k))
    return Math.max(keys.length, n)
  } catch (e) {
    return n
  }
}

/** 当前缓存占用（MB） */
export function cacheSizeMB() {
  const s = ls()
  if (!s) {
    // 内存缓存估算
    let total = 0
    for (const [k, v] of memCache) {
      total += (k.length + JSON.stringify(v).length) * 2
    }
    return Math.round(total / 1024 / 1024 * 10) / 10
  }
  try {
    let total = 0
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith('rkpc:')) {
        total += (k.length + (s.getItem(k) || '').length) * 2
      }
    }
    return Math.round(total / 1024 / 1024 * 10) / 10
  } catch (e) {
    return 0
  }
}

/** 缓存条目数 */
export function cacheCount() {
  let n = memCache.size
  const s = ls()
  if (!s) return n
  try {
    let c = 0
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith('rkpc:')) c++
    }
    return Math.max(n, c)
  } catch (e) {
    return n
  }
}

/** 生成唯一 id */
export function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
}

/** 应用主题色到全局 CSS 变量 */
export function applyTheme(color) {
  const c = color || '#007aff'
  document.documentElement.style.setProperty('--blue', c)
  document.documentElement.style.setProperty('--theme', c)
  document.documentElement.style.setProperty('--theme-soft', hexToRgba(c, 0.12))
  document.documentElement.style.setProperty('--theme-shadow', hexToRgba(c, 0.3))
}

/** hex → rgba */
export function hexToRgba(hex, alpha = 1) {
  let c = String(hex || '').trim()
  if (/^rgba?\(/.test(c)) {
    if (c.indexOf('rgba') === 0) return c
    return c.replace(/^rgb\(/, 'rgba(').replace(/\)$/, `,${alpha})`)
  }
  if (c.indexOf('#') === 0) c = c.slice(1)
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('')
  if (c.length !== 6) return `rgba(0,122,255,${alpha})`
  const int = parseInt(c, 16)
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
}
