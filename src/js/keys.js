/**
 * RailKale: Next PC - 密钥管理
 *
 * 三层优先级（与移动端一致）：
 *   设置页覆盖值（本地存储） > config.js 本地配置 > 内建默认值
 *
 * 真实密钥统一放在 src/js/config.js（已在 .gitignore 忽略，不会提交）。
 * 首次使用请从 config.example.js 复制一份。
 */

import localConfig from './config.js'
import { getKeyOverrides } from './settings.js'

// 内建默认值（config.js 缺失时的兜底；请勿在此硬编码真实密钥）
export const BUILTIN_DEFAULTS = {
  amap: '',
  amap_js: '',
  amap_sec: ''
}

export const KEY_DEFS = [
  { id: 'amap', label: '高德地图 · Web服务', desc: '车次定位 / 静态地图（REST API）' },
  { id: 'amap_js', label: '高德地图 · JS API', desc: '路网地图加载（网页端）' },
  { id: 'amap_sec', label: '高德地图 · JS安全码', desc: '路网地图 JS 安全密钥' }
]

/** 从本地配置文件读取（config.js 不存在或异常时返回空对象） */
function getFileConfig() {
  try {
    return (localConfig && localConfig.keys) || {}
  } catch (e) {
    return {}
  }
}

/**
 * 获取指定密钥的有效值
 * 优先级：设置覆盖值 > 本地配置文件 > 内建默认
 * 值为 "default" 或空时，回退到配置文件中的值
 * @param {string} name
 * @returns {string}
 */
export function getKey(name) {
  const fileConfig = getFileConfig()
  const overrides = getKeyOverrides()

  const raw = (overrides[name] !== undefined && overrides[name] !== null)
    ? overrides[name]
    : (fileConfig[name] !== undefined ? fileConfig[name] : BUILTIN_DEFAULTS[name])

  if (raw === 'default' || raw === '' || !raw) {
    return fileConfig[name] || BUILTIN_DEFAULTS[name] || ''
  }
  return String(raw)
}

/**
 * 校验用户填写的密钥是否有效（简单长度检查）
 */
export function isValidKey(value) {
  return String(value || '').trim().length >= 8
}

/** 是否已配置（非空） */
export function hasKey(name) {
  return !!getKey(name)
}

/** 是否来自本地配置文件（而非设置页覆盖） */
export function isFromFile(name) {
  const overrides = getKeyOverrides()
  const o = overrides[name]
  const fileConfig = getFileConfig()
  return !!(fileConfig[name] && (o === undefined || o === null || o === 'default' || o === ''))
}
