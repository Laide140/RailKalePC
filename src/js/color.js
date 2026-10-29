/**
 * RailKale: Next PC - 颜色工具
 * 移植自移动端 common/color.js：HSL ↔ HEX、调色板、可读性修正
 *
 * 【重要】这里只定义 UI 装饰用的派生色。
 * 车站大屏的状态色、铁路地图的红/蓝线路、报警红等「语义色」不在此列，必须保持原样 ——
 * 那些颜色是信息本身，不是配色。
 */

const FALLBACK = '#007aff'

/** 十六进制 → 规范化 #rrggbb（非法输入返回 null） */
export function parseHex(hex) {
  let s = String(hex || '').trim().replace('#', '')
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split('').map(c => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(s) ? '#' + s.toLowerCase() : null
}

/** 十六进制 → 规范化 #rrggbb（非法输入返回兜底色） */
export function normalizeHex(hex) {
  return parseHex(hex) || FALLBACK
}

export function hexToHsl(hex) {
  const c = normalizeHex(hex).slice(1)
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let hue = 0
  let sat = 0
  if (max !== min) {
    const d = max - min
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
  }
  return { h: Math.round(hue), s: Math.round(sat * 100), l: Math.round(l * 100) }
}

export function hslToHex(h, s, l) {
  h = ((Number(h) % 360) + 360) % 360
  s = Math.min(100, Math.max(0, Number(s))) / 100
  l = Math.min(100, Math.max(0, Number(l))) / 100
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** 是否为深色（决定叠在其上的文字用黑还是白） */
export function isDarkColor(hex) {
  return hexToHsl(hex).l < 55
}

/** 十六进制转 rgba */
export function rgba(hex, alpha = 1) {
  const int = parseInt(normalizeHex(hex).slice(1), 16)
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
}

/** 与白色混合（调浅）：ratio 0=原色 1=纯白 */
export function tint(hex, ratio) {
  const int = parseInt(normalizeHex(hex).slice(1), 16)
  const t = Math.min(1, Math.max(0, Number(ratio) || 0))
  const mix = (v) => Math.round(v + (255 - v) * t)
  return '#' + [mix((int >> 16) & 255), mix((int >> 8) & 255), mix(int & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('')
}

/** 与黑色混合（调深）：ratio 0=原色 1=纯黑 */
export function shade(hex, ratio) {
  const int = parseInt(normalizeHex(hex).slice(1), 16)
  const t = 1 - Math.min(1, Math.max(0, Number(ratio) || 0))
  return '#' + [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map(v => Math.round(v * t).toString(16).padStart(2, '0')).join('')
}

/** 保证主题色在白底上作为文字可读（过浅时自动加深） */
export function readableOnWhite(hex, maxLight = 62) {
  const base = normalizeHex(hex)
  const hsl = hexToHsl(base)
  return hsl.l <= maxLight ? base : hslToHex(hsl.h, hsl.s, maxLight)
}

/**
 * 主题调色板 → CSS 变量表
 * @param {string} hex 主题色
 */
export function themePalette(hex) {
  const base = normalizeHex(hex)
  const text = readableOnWhite(base)
  return {
    '--blue': base,
    '--theme': base,
    '--theme-text': text,
    '--theme-strong': shade(base, 0.18),
    '--theme-soft': tint(base, 0.82),
    '--theme-softer': tint(base, 0.92),
    '--theme-border': rgba(text, 0.22),
    '--theme-fill': rgba(text, 0.08),
    '--theme-fill-strong': rgba(text, 0.14)
  }
}

/** 把调色板写入全局 CSS 变量 */
export function applyThemeVars(hex) {
  const palette = themePalette(hex)
  try {
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.style) {
      const root = document.documentElement
      Object.keys(palette).forEach(k => root.style.setProperty(k, palette[k]))
    }
  } catch (e) { /* 无 DOM 环境忽略 */ }
  return palette
}

/** 以主题色为基准的同色系推荐色（由深到浅） */
export function tonePresets(hex) {
  const base = normalizeHex(hex)
  return [
    shade(base, 0.45), shade(base, 0.25), base,
    tint(base, 0.25), tint(base, 0.45), tint(base, 0.62)
  ]
}

export default {
  parseHex, normalizeHex, hexToHsl, hslToHex, isDarkColor,
  rgba, tint, shade, readableOnWhite, themePalette, applyThemeVars, tonePresets
}
