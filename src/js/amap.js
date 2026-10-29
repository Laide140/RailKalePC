/**
 * RailKale: Next PC - 高德 JS API 加载器
 * 用 <script> 动态注入，全局只加载一次（多个地图视图共用）
 */

import { getKey } from './keys.js'

let amapLoading = null

/**
 * 载入高德 JS API（幂等）
 * @returns {Promise<void>} 失败时 reject（未配置密钥 / 网络错误）
 */
export function loadAMap() {
  if (typeof window !== 'undefined' && window.AMap) return Promise.resolve()
  if (amapLoading) return amapLoading

  const key = getKey('amap_js')
  const sec = getKey('amap_sec')
  if (!key) return Promise.reject(new Error('未配置高德 JS API 密钥'))

  amapLoading = new Promise((resolve, reject) => {
    if (sec) window._AMapSecurityConfig = { securityJsCode: sec }
    const s = document.createElement('script')
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(key)
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      amapLoading = null
      reject(new Error('高德地图加载失败，请检查网络或密钥'))
    }
    document.head.appendChild(s)
  })
  return amapLoading
}

/** 是否已就绪 */
export function amapReady() {
  return typeof window !== 'undefined' && !!window.AMap
}
