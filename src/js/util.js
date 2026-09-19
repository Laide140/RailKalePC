/**
 * RailKale: Next PC - 通用工具
 */

/** 今天 YYYY-MM-DD */
export function today() {
  const d = new Date()
  return fmtDate(d)
}

/** 日期偏移 N 天 */
export function dateOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return fmtDate(d)
}

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function pad(n) {
  return n < 10 ? '0' + n : String(n)
}

/** 数组分批 */
export function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 防抖 */
export function debounce(fn, wait = 250) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

/** 节流 */
export function throttle(fn, wait = 200) {
  let last = 0
  let timer = null
  return function (...args) {
    const now = Date.now()
    const remaining = wait - (now - last)
    if (remaining <= 0) {
      last = now
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(this, args)
      }, remaining)
    }
  }
}

/** ArrayBuffer → base64 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** 数字格式化（保留 n 位） */
export function fixed(n, digits = 1) {
  const v = Number(n)
  return isFinite(v) ? v.toFixed(digits) : '0'
}

/** 秒数 → mm:ss / hh:mm:ss */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

/** 两点间距离（米） */
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** HTML 转义 */
export function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 复制到剪贴板 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text))
    return true
  } catch (e) {
    // 兜底
    try {
      const ta = document.createElement('textarea')
      ta.value = String(text)
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch (err) {
      return false
    }
  }
}

/** 在浏览器中打开链接 */
export function openExternal(url) {
  if (window.native && window.native.shell) {
    window.native.shell.openExternal(url)
  } else {
    window.open(url, '_blank')
  }
}

/** 保存 base64 图片到磁盘 */
export async function saveBase64Image(base64, defaultName) {
  if (window.native && window.native.dialog) {
    return await window.native.dialog.saveBinary({ defaultPath: defaultName, base64 })
  }
  // 浏览器兜底：直接下载
  const a = document.createElement('a')
  a.href = 'data:image/png;base64,' + base64
  a.download = defaultName
  a.click()
  return { ok: true }
}

/**
 * 由异常提取对用户有意义的错误文案
 *
 * 接口在 4xx 时会返回 { error: '未找到站点: 北京南' } 这类信息，
 * api.js 会包装成 ApiError 透出；网络层异常则给出中文兜底。
 */
export function apiErrMsg(e) {
  if (!e) return '请求失败'
  const msg = e.message || String(e)
  if (e.name === 'AbortError' || /aborted/i.test(msg)) return '请求超时，请稍后重试'
  if (e.name === 'ApiError') return msg
  if (/Failed to fetch|NetworkError|ERR_/i.test(msg)) return '网络连接失败，请检查网络'
  if (msg && msg !== 'undefined') return msg
  return '请求失败'
}

/** hex 合法性归一化 */
export function normalizeHex(v) {
  let s = String(v || '').trim().replace('#', '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toLowerCase() : null
}

// ---------------------------------------------------------------------------
// HSL ↔ HEX（主题色自定义调色器）
// ---------------------------------------------------------------------------

export function hexToHsl(hex) {
  const c = normalizeHex(hex) || '#007aff'
  const r = parseInt(c.slice(1, 3), 16) / 255
  const g = parseInt(c.slice(3, 5), 16) / 255
  const b = parseInt(c.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      default: h = ((r - g) / d + 4)
    }
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex(h, s, l) {
  h = ((Number(h) % 360) + 360) % 360
  s = Math.max(0, Math.min(100, Number(s))) / 100
  l = Math.max(0, Math.min(100, Number(l))) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  const to = v => pad(Math.round((v + m) * 255).toString(16))
  return '#' + to(r) + to(g) + to(b)
}
