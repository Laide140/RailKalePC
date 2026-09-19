/**
 * RailKale: Next PC - 路网地图
 * 高德 JS API 全屏地图 + GeoJSON 铁路图层（按需下载并缓存到 localStorage）
 */

import { registerView } from '../js/router.js'
import { getKey } from '../js/keys.js'
import { getRailwayDir, getRailwayIndex } from '../js/api.js'
import { cacheGet, cacheSet, cacheRemove, cacheClear, cacheSizeMB, cacheIsPersistent } from '../js/settings.js'
import { escapeHTML } from '../js/util.js'
import { toast, toastError, confirmDialog } from '../js/ui.js'

// 省级行政区 GeoJSON 文件名
const FILE_LIST = [
  '110000.geojson', '120000.geojson', '130000.geojson', '140000.geojson', '150000.geojson',
  '210000.geojson', '220000.geojson', '230000.geojson',
  '310000.geojson', '320000.geojson', '330000.geojson', '340000.geojson', '350000.geojson',
  '360000.geojson', '370000.geojson',
  '410000.geojson', '420000.geojson', '430000.geojson', '440000.geojson', '450000.geojson', '460000.geojson',
  '500000.geojson', '510000.geojson', '520000.geojson', '530000.geojson', '540000.geojson',
  '610000.geojson', '620000.geojson', '630000.geojson', '640000.geojson', '650000.geojson',
  '810000.geojson', '820000.geojson'
]

const PROVINCE = {
  110000: '北京', 120000: '天津', 130000: '河北', 140000: '山西', 150000: '内蒙古',
  210000: '辽宁', 220000: '吉林', 230000: '黑龙江',
  310000: '上海', 320000: '江苏', 330000: '浙江', 340000: '安徽', 350000: '福建',
  360000: '江西', 370000: '山东',
  410000: '河南', 420000: '湖北', 430000: '湖南', 440000: '广东', 450000: '广西', 460000: '海南',
  500000: '重庆', 510000: '四川', 520000: '贵州', 530000: '云南', 540000: '西藏',
  610000: '陕西', 620000: '甘肃', 630000: '青海', 640000: '宁夏', 650000: '新疆',
  810000: '香港', 820000: '澳门'
}

const CACHE_PREFIX = 'railway-'

let amapLoading = null
let hostRef = null
let map = null
let layers = []
let loaded = new Set()
let cancelled = false

function esc(s) { return escapeHTML(s) }
function provinceName(fn) { return PROVINCE[fn.substring(0, 6)] || fn.substring(0, 2) }

/** 载入高德 JS API */
function loadAMap() {
  if (window.AMap) return Promise.resolve()
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
    s.onerror = () => reject(new Error('高德地图加载失败'))
    document.head.appendChild(s)
  })
  return amapLoading
}

/** 从网络加载单个 GeoJSON */
async function fetchGeoJSON(filename) {
  const dir = getRailwayDir()
  const res = await fetch(`${dir}/${filename}`, { signal: AbortSignal.timeout(90000) })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return await res.json()
}

function render(host) {
  hostRef = host
  cancelled = false

  const hasJsKey = !!getKey('amap_js')

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#ff9500"><i class="fas fa-map"></i></div>
        <div>
          <div class="page-title">路网地图</div>
          <div class="page-subtitle">全国铁路线路图 · 首次加载需下载 GeoJSON 数据</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center" id="map-actions">
        <span class="tag-pill" id="cache-badge">缓存 ${cacheSizeMB()} MB</span>
        <button class="btn btn-ghost btn-sm" id="btn-reload"><i class="fas fa-download"></i> 加载数据</button>
        <button class="btn btn-ghost btn-sm" id="btn-clear"><i class="fas fa-trash"></i> 清除缓存</button>
      </div>
    </div>

    ${cacheIsPersistent() ? '' : `<div class="card" style="border-color:var(--orange);margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <i class="fas fa-info-circle" style="color:var(--orange);font-size:20px"></i>
        <div style="flex:1">
          <div style="font-weight:600">当前环境不支持持久化缓存</div>
          <div class="field-hint">GeoJSON 数据仅保存在内存中，关闭后需重新下载。正常安装版不会有此问题。</div>
        </div>
      </div>
    </div>`}

    ${hasJsKey ? '' : `<div class="card" style="border-color:var(--orange);margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <i class="fas fa-info-circle" style="color:var(--orange);font-size:20px"></i>
        <div style="flex:1">
          <div style="font-weight:600">未配置高德 JS API 密钥</div>
          <div class="field-hint">路网地图依赖高德 JS API。请到「设置 → 接口密钥」填写 <b>高德地图 · JS API</b> 与 <b>JS安全码</b>。</div>
        </div>
        <button class="btn btn-sm" id="btn-goto-settings">去设置</button>
      </div>
    </div>`}

    <div style="position:relative">
      <div class="map-box" style="height:calc(100vh - 260px);min-height:440px">
        <div id="amap-host" class="amap-container"></div>
        <div id="map-status" style="position:absolute;bottom:16px;left:16px;z-index:50;
             background:rgba(28,28,30,.85);backdrop-filter:blur(20px);color:#fff;
             padding:9px 16px;border-radius:20px;font-size:12.5px;display:none">
          <span class="pulse-dot" style="display:inline-block;margin-right:7px;vertical-align:middle"></span>
          <span id="map-status-text"></span>
        </div>
        <div id="map-legend" style="position:absolute;bottom:16px;right:16px;z-index:50;
             background:rgba(255,255,255,.92);backdrop-filter:blur(20px);
             padding:11px 15px;border-radius:12px;font-size:12px;box-shadow:var(--shadow-md)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="width:16px;height:3px;background:#e74c3c;border-radius:2px"></span><span>铁路</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="width:16px;height:3px;background:#3498db;border-radius:2px"></span><span>地铁</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:16px;height:3px;background:#f39c12;border-radius:2px"></span><span>隧道 / 桥梁</span>
          </div>
        </div>
      </div>
    </div>
  `

  host.querySelector('#btn-clear').addEventListener('click', async () => {
    const ok = await confirmDialog('清除路网缓存', '将删除已下载的 GeoJSON 数据，下次打开需重新下载（约 169MB）。确定吗？', { danger: true, confirmText: '清除' })
    if (!ok) return
    for (const fn of FILE_LIST) cacheRemove(CACHE_PREFIX + fn.replace('.geojson', ''))
    loaded.clear()
    layers.forEach(l => { try { map && map.remove(l) } catch (e) { /* ignore */ } })
    layers = []
    const badge = host.querySelector('#cache-badge')
    if (badge) badge.textContent = `缓存 ${cacheSizeMB()} MB`
    toast('缓存已清除', { icon: 'success' })
  })

  // 仅在未配置密钥时才存在该按钮，需判空（配好密钥后按钮不渲染）
  const gotoSettings = host.querySelector('#btn-goto-settings')
  if (gotoSettings) {
    gotoSettings.addEventListener('click', async () => {
      const { navigate } = await import('../js/router.js')
      navigate('settings')
    })
  }

  host.querySelector('#btn-reload').addEventListener('click', () => startLoad(true))

  if (!hasJsKey) {
    host.querySelector('#amap-host').innerHTML = `
      <div class="map-placeholder">
        <i class="fas fa-map" style="font-size:40px"></i>
        <div>请先配置高德 JS API 密钥</div>
      </div>`
    return
  }

  initMap(host)
}

async function initMap(host) {
  const statusEl = host.querySelector('#map-status')
  const statusText = host.querySelector('#map-status-text')
  const hostDiv = host.querySelector('#amap-host')

  function setStatus(text) {
    if (!statusEl) return
    if (!text) { statusEl.style.display = 'none'; return }
    statusEl.style.display = 'block'
    statusText.textContent = text
  }

  try {
    setStatus('正在加载高德地图…')
    await loadAMap()
    if (cancelled || hostRef !== host) return

    map = new window.AMap.Map('amap-host', {
      center: [104.195397, 35.86166],
      zoom: 5,
      mapStyle: 'amap://styles/fresh',
      resizeEnable: true,
      dragEnable: true,
      scrollWheel: true,
      doubleClickZoom: true,
      zoomEnable: true
    })
    setStatus('')
  } catch (e) {
    console.error(e)
    hostDiv.innerHTML = `<div class="map-placeholder">
      <i class="fas fa-times-circle" style="font-size:40px;color:var(--red)"></i>
      <div>地图加载失败：${esc(e.message || e)}</div>
    </div>`
    setStatus('')
    return
  }

  startLoad(false)
}

async function startLoad(force) {
  if (!map || !hostRef) return
  const host = hostRef
  const statusEl = host.querySelector('#map-status')
  const statusText = host.querySelector('#map-status-text')
  const badge = host.querySelector('#cache-badge')

  function setStatus(text) {
    if (!statusEl) return
    if (!text) { statusEl.style.display = 'none'; return }
    statusEl.style.display = 'block'
    statusText.textContent = text
  }

  // 1. 先尝试读取缓存
  const cacheHits = []
  for (const fn of FILE_LIST) {
    const name = fn.replace('.geojson', '')
    const d = cacheGet(CACHE_PREFIX + name)
    if (d && d.features && d.features.length) cacheHits.push({ fn, features: d.features })
  }

  if (cacheHits.length && !force) {
    for (let i = 0; i < cacheHits.length; i++) {
      if (cancelled) return
      setStatus(`正在渲染${provinceName(cacheHits[i].fn)}（${i + 1}/${cacheHits.length}）`)
      addFeatures(cacheHits[i].features)
      await new Promise(r => setTimeout(r, 0))
      loaded.add(cacheHits[i].fn)
    }
    setStatus('')
    toast(`已从缓存加载 ${cacheHits.length} 个省级图层`, { icon: 'success' })
    return
  }

  // 2. 无缓存 → 下载
  if (!cacheHits.length) {
    const ok = await confirmDialog(
      '下载路网数据',
      `全国铁路路网数据共约 169MB，将下载 ${FILE_LIST.length} 个省级 GeoJSON 文件并缓存到本地。首次加载耗时较长，确定继续吗？`,
      { confirmText: '开始下载' }
    )
    if (!ok) { setStatus(''); return }
  }

  let done = 0
  let failed = 0
  let cacheFailed = 0
  for (const fn of FILE_LIST) {
    if (cancelled || !map) return
    const name = fn.replace('.geojson', '')
    // 跳过已缓存
    const cached = cacheGet(cache_PREFIX(name))
    if (cached && cached.features && !force) {
      addFeatures(cached.features)
      loaded.add(fn)
      done++
      continue
    }
    setStatus(`正在下载${provinceName(fn)}（${done + 1}/${FILE_LIST.length}）`)
    try {
      const gj = await fetchGeoJSON(fn)
      if (gj && gj.features && gj.features.length) {
        addFeatures(gj.features)
        const stored = cacheSet(cache_PREFIX(name), { name, features: gj.features })
        if (!stored) cacheFailed++
        loaded.add(fn)
      }
    } catch (e) {
      failed++
      console.warn('[路网] 下载失败', fn, e)
    }
    done++
    if (badge) badge.textContent = `缓存 ${cacheSizeMB()} MB`
    await new Promise(r => setTimeout(r, 0))
  }

  setStatus('')
  if (badge) badge.textContent = `缓存 ${cacheSizeMB()} MB`

  if (cacheFailed) {
    toast(`已加载，但有 ${cacheFailed} 个文件无法写入缓存（超出配额）`, { icon: 'error', duration: 4000 })
  } else if (failed) {
    toast(`加载完成，${failed} 个文件下载失败`, { icon: 'error', duration: 4000 })
  } else {
    toast('路网数据加载完成', { icon: 'success' })
  }
}

function cache_PREFIX(name) {
  return CACHE_PREFIX + name
}

function lineStyle(props) {
  const fclass = String(props.fclass || '').toLowerCase()
  const tunnel = props.tunnel === 'T'
  const bridge = props.bridge === 'T'

  if (fclass.indexOf('subway') >= 0) return { color: '#3498db', weight: 2.4, opacity: 0.9, label: '地铁' }
  if (fclass.indexOf('light_rail') >= 0 || fclass.indexOf('tram') >= 0) return { color: '#5ac8fa', weight: 2, opacity: 0.85, label: '轻轨' }
  if (fclass.indexOf('narrow') >= 0) return { color: '#af52de', weight: 2, opacity: 0.8, label: '窄轨' }
  if (tunnel) return { color: '#f39c12', weight: 2, opacity: 0.75, label: '隧道' }
  if (bridge) return { color: '#9b59b6', weight: 2, opacity: 0.8, label: '桥梁' }
  if (fclass.indexOf('rail') >= 0) return { color: '#e74c3c', weight: 2.2, opacity: 0.85, label: '铁路' }
  return { color: '#8e8e93', weight: 1.6, opacity: 0.6, label: '其它' }
}

function addFeatures(features) {
  if (!map || !features || !features.length) return
  const lines = []
  for (const f of features) {
    const geom = f.geometry
    if (!geom || !geom.coordinates) continue
    const props = f.properties || {}
    const st = lineStyle(props)

    const coordsList = geom.type === 'MultiLineString'
      ? geom.coordinates
      : (geom.type === 'LineString' ? [geom.coordinates] : [])

    for (const coords of coordsList) {
      if (!Array.isArray(coords) || coords.length < 2) continue
      lines.push(new window.AMap.Polyline({
        path: coords,
        strokeColor: st.color,
        strokeWeight: st.weight,
        strokeOpacity: st.opacity,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50,
        extData: {
          name: props.name || '未命名线路',
          type: st.label,
          fclass: props.fclass || '—',
          bridge: props.bridge === 'T',
          tunnel: props.tunnel === 'T',
          layer: props.layer
        }
      }))
    }
  }
  if (!lines.length) return

  map.add(lines)

  // 点击线路 → 弹出信息卡
  for (const line of lines) {
    line.on('click', (e) => {
      const d = line.getExtData() || {}
      showLineInfo(d)
    })
  }

  layers.push(...lines)
}

let infoOverlay = null

function showLineInfo(d) {
  if (!map) return
  if (infoOverlay) { try { map.remove(infoOverlay) } catch (e) { /* ignore */ } }

  const el = document.createElement('div')
  el.style.cssText = `background:#fff;border-radius:14px;padding:14px 18px;box-shadow:0 6px 24px rgba(0,0,0,.18);
    font-family:-apple-system,'PingFang SC',sans-serif;min-width:210px`
  el.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:9px;display:flex;align-items:center;gap:8px">
      <span style="width:14px;height:3px;background:${d.type === '地铁' ? '#3498db' : (d.type === '隧道' ? '#f39c12' : '#e74c3c')};border-radius:2px"></span>
      ${esc(d.name || '未命名线路')}
    </div>
    <div style="font-size:12.5px;color:#8e8e93;line-height:1.85">
      <div>类型：${esc(d.type || '—')}</div>
      <div>等级：${esc(d.fclass || '—')}</div>
      <div>桥梁：${d.bridge ? '是' : '否'} · 隧道：${d.tunnel ? '是' : '否'}</div>
    </div>
    <div style="margin-top:10px;font-size:11.5px;color:#c7c7cc;text-align:right">点击地图空白处关闭</div>
  `
  infoOverlay = new window.AMap.AdvancedInfoWindow({
    content: el,
    offset: new window.AMap.Pixel(0, -14),
    autoMove: true
  })
  infoOverlay.open(map, [map.getCenter().lng, map.getCenter().lat])
}

function hideLineInfo() {
  if (infoOverlay && map) {
    try { infoOverlay.close() } catch (e) { /* ignore */ }
    infoOverlay = null
  }
}

registerView('rail-network-map', {
  title: '路网地图',
  icon: 'fa-map',
  color: '#ff9500',
  render,
  destroy() {
    cancelled = true
    hideLineInfo()
    if (map) {
      try { map.destroy() } catch (e) { /* ignore */ }
      map = null
    }
    layers = []
    hostRef = null
  }
})
