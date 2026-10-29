/**
 * RailKale: Next PC - 列车雷达
 * 对应移动端 pages/train-radar（上游是 web-view + document.title 桥接）
 *
 * 桌面端改为原生实现，不再依赖内嵌网页与 title 通信：
 *  - 高德 JS 地图常驻，「扫描」时按当前视野取周边车站
 *  - 用自有数据源给每个车站拉当日到发车次，再查这些车次的实时位置
 *  - 位置点直接画在地图上，点击查看车次信息并可跳转车次详情
 *
 * 车站来源：地图视野内的「城市名 → 主要车站」映射（内置常用城市表），
 * 不额外消耗高德 POI 额度；也可手动追加车站再扫描。
 */

import { registerView, navigate } from '../js/router.js'
import {
  getStationBigScreen, getTrainLocate, getTrainSetOfTrain
} from '../js/api.js'
import { loadAMap } from '../js/amap.js'
import { getKey } from '../js/keys.js'
import { escapeHTML, debounce } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

/** 视野内取多少个车站做扫描（每个站一次大屏请求） */
const MAX_STATIONS = 8
/** 一次扫描最多定位多少趟车次 */
const MAX_TRAINS = 60
/** 车次定位并发（避免一次打爆接口） */
const CONCURRENCY = 8

/** 常用城市 → 主要车站（用于把视野中心转成可查询的车站） */
const CITY_STATIONS = [
  { city: '北京', lng: 116.407, lat: 39.904, stations: ['北京南', '北京西', '北京朝阳'] },
  { city: '天津', lng: 117.190, lat: 39.125, stations: ['天津西', '天津'] },
  { city: '石家庄', lng: 114.514, lat: 38.042, stations: ['石家庄'] },
  { city: '太原', lng: 112.549, lat: 37.857, stations: ['太原南'] },
  { city: '呼和浩特', lng: 111.670, lat: 40.818, stations: ['呼和浩特东'] },
  { city: '沈阳', lng: 123.429, lat: 41.796, stations: ['沈阳北', '沈阳南'] },
  { city: '长春', lng: 125.323, lat: 43.817, stations: ['长春西', '长春'] },
  { city: '哈尔滨', lng: 126.534, lat: 45.803, stations: ['哈尔滨西', '哈尔滨'] },
  { city: '大连', lng: 121.618, lat: 38.914, stations: ['大连北'] },
  { city: '上海', lng: 121.473, lat: 31.230, stations: ['上海虹桥', '上海'] },
  { city: '南京', lng: 118.797, lat: 32.060, stations: ['南京南', '南京'] },
  { city: '杭州', lng: 120.155, lat: 30.274, stations: ['杭州东', '杭州西'] },
  { city: '苏州', lng: 120.619, lat: 31.299, stations: ['苏州北', '苏州'] },
  { city: '合肥', lng: 117.283, lat: 31.861, stations: ['合肥南'] },
  { city: '温州', lng: 120.699, lat: 27.994, stations: ['温州南'] },
  { city: '福州', lng: 119.306, lat: 26.075, stations: ['福州南', '福州'] },
  { city: '厦门', lng: 118.089, lat: 24.479, stations: ['厦门北', '厦门'] },
  { city: '南昌', lng: 115.858, lat: 28.682, stations: ['南昌西', '南昌'] },
  { city: '济南', lng: 117.000, lat: 36.675, stations: ['济南西', '济南'] },
  { city: '青岛', lng: 120.383, lat: 36.067, stations: ['青岛北', '青岛'] },
  { city: '郑州', lng: 113.625, lat: 34.746, stations: ['郑州东', '郑州'] },
  { city: '武汉', lng: 114.305, lat: 30.593, stations: ['武汉', '汉口', '武昌'] },
  { city: '长沙', lng: 112.939, lat: 28.228, stations: ['长沙南'] },
  { city: '广州', lng: 113.264, lat: 23.129, stations: ['广州南', '广州东'] },
  { city: '深圳', lng: 114.057, lat: 22.543, stations: ['深圳北', '深圳'] },
  { city: '南宁', lng: 108.366, lat: 22.817, stations: ['南宁东'] },
  { city: '海口', lng: 110.199, lat: 20.044, stations: ['海口东'] },
  { city: '重庆', lng: 106.551, lat: 29.563, stations: ['重庆北', '重庆西'] },
  { city: '成都', lng: 104.066, lat: 30.572, stations: ['成都东', '成都南'] },
  { city: '贵阳', lng: 106.630, lat: 26.647, stations: ['贵阳北'] },
  { city: '昆明', lng: 102.833, lat: 24.880, stations: ['昆明南', '昆明'] },
  { city: '西安', lng: 108.948, lat: 34.341, stations: ['西安北'] },
  { city: '兰州', lng: 103.834, lat: 36.061, stations: ['兰州西'] },
  { city: '西宁', lng: 101.778, lat: 36.617, stations: ['西宁'] },
  { city: '银川', lng: 106.278, lat: 38.466, stations: ['银川'] },
  { city: '乌鲁木齐', lng: 87.617, lat: 43.792, stations: ['乌鲁木齐'] },
  { city: '拉萨', lng: 91.132, lat: 29.660, stations: ['拉萨'] }
]

let state = {
  manualStations: [],        // 手动追加的车站
  scanning: false,
  trains: [],                // [{ ...locate, emu_no }]
  lastScanAt: 0,
  autoScan: false,
  scanStations: [],
  progress: ''
}

let map = null
let hostRef = null
let markers = []
let cancelled = false
let autoTimer = null
let trainTip = null

function esc(s) { return escapeHTML(s) }

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** 视野范围内的城市（按距离取最近若干个） */
function citiesInView() {
  if (!map) return []
  const bounds = map.getBounds()
  if (!bounds) return []
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const out = []
  for (const c of CITY_STATIONS) {
    if (c.lng >= sw.getLng() && c.lng <= ne.getLng() && c.lat >= sw.getLat() && c.lat <= ne.getLat()) {
      const center = map.getCenter()
      const d = Math.hypot(c.lng - center.lng, c.lat - center.lat)
      out.push({ ...c, d })
    }
  }
  // 视野太小（放大到城市级别）时，把中心最近的城市也纳入
  if (!out.length) {
    const center = map.getCenter()
    let best = null
    for (const c of CITY_STATIONS) {
      const d = Math.hypot(c.lng - center.lng, c.lat - center.lat)
      if (!best || d < best.d) best = { ...c, d }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => a.d - b.d)
}

/** 由视野城市得到要扫描的车站列表 */
function pickStations() {
  const cities = citiesInView()
  const list = []
  for (const c of cities) {
    for (const s of c.stations) {
      if (list.indexOf(s) < 0) list.push(s)
      if (list.length >= MAX_STATIONS) break
    }
    if (list.length >= MAX_STATIONS) break
  }
  for (const s of state.manualStations) {
    if (list.indexOf(s) < 0 && list.length < MAX_STATIONS) list.push(s)
  }
  return list
}

function render(host) {
  hostRef = host
  const hasJsKey = !!getKey('amap_js')

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-satellite-dish"></i></div>
        <div>
          <div class="page-title">列车雷达</div>
          <div class="page-subtitle">扫描当前视野周边车站，在地图上标出正在运行的列车</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="tag-pill ${state.scanning ? 'green' : 'gray'}" id="scan-badge">
          ${state.scanning ? '扫描中…' : (state.lastScanAt ? '上次扫描 ' + fmtTime(state.lastScanAt) : '未扫描')}
        </span>
        <label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--secondary);cursor:pointer">
          <input type="checkbox" id="f-auto" ${state.autoScan ? 'checked' : ''} style="accent-color:var(--theme)" /> 自动刷新
        </label>
        <button class="btn btn-sm" id="btn-scan"><i class="fas fa-satellite-dish"></i> 扫描</button>
      </div>
    </div>

    ${hasJsKey ? '' : `<div class="card" style="border-color:var(--orange);margin-bottom:16px">
      <div style="display:flex;gap:12px;align-items:flex-start">
        <i class="fas fa-info-circle" style="color:var(--orange);font-size:19px;margin-top:2px"></i>
        <div style="flex:1">
          <div style="font-weight:600">未配置高德 JS API 密钥</div>
          <div class="field-hint">列车雷达需要在地图上展示列车位置。请到「设置 → 接口密钥」填写 <b>高德地图 · JS API</b> 与 <b>JS安全码</b>。</div>
        </div>
        <button class="btn btn-sm" id="btn-goto-settings">去设置</button>
      </div>
    </div>`}

    <div class="radar-layout">
      <div class="detail-side">
        <div class="card">
          <div class="card-title">扫描设置</div>
          <div class="field">
            <label class="field-label">追加车站（可选）</label>
            <div style="display:flex;gap:8px">
              <input class="input" id="f-station" placeholder="如：北京南" />
              <button class="btn btn-ghost btn-sm" id="btn-add-station" style="height:40px;flex-shrink:0">添加</button>
            </div>
            <div class="field-hint">最多扫描 ${MAX_STATIONS} 个车站，视野内城市会自动取最近的几个。</div>
          </div>
          <div id="manual-host" style="display:flex;flex-wrap:wrap;gap:7px"></div>
          <div class="field-hint" id="progress-text" style="margin-top:10px"></div>
        </div>

        <div class="card">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <span>扫描到的列车</span>
            <span class="tag-pill gray" style="margin-left:auto" id="train-count">${state.trains.length}</span>
          </div>
          <div id="train-list-host"></div>
        </div>
      </div>

      <div>
        <div class="radar-map-box">
          <div id="radar-map" class="amap-container"></div>
          <div class="radar-tip" id="radar-tip">
            <span class="pulse-dot" style="display:inline-block"></span><span id="radar-tip-text"></span>
          </div>
          <div class="radar-legend">
            <div class="radar-legend-row">
              <span style="width:10px;height:10px;border-radius:50%;background:#007aff;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.12)"></span>
              <span>运行中的列车</span>
            </div>
            <div class="radar-legend-row">
              <span style="width:10px;height:10px;border-radius:50%;background:#ff9500;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.12)"></span>
              <span>已到达 / 待发车</span>
            </div>
            <div class="radar-legend-row" style="color:var(--secondary);font-size:11.5px">缩放后点击「扫描」刷新</div>
          </div>
        </div>
      </div>
    </div>
  `

  host.querySelector('#btn-goto-settings')?.addEventListener('click', () => navigate('settings'))
  host.querySelector('#btn-scan').addEventListener('click', () => scan())
  host.querySelector('#f-auto').addEventListener('change', (e) => {
    state.autoScan = e.target.checked
    setupAutoScan()
  })
  const stEl = host.querySelector('#f-station')
  host.querySelector('#btn-add-station').addEventListener('click', () => addManualStation(stEl.value))
  stEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualStation(stEl.value) })

  renderManual()
  renderTrainList()
  renderProgress()

  if (!hasJsKey) {
    host.querySelector('#radar-map').innerHTML = `
      <div class="map-placeholder">
        <i class="fas fa-map" style="font-size:40px"></i>
        <div>请先配置高德 JS API 密钥</div>
      </div>`
    return
  }

  initMap()
}

function addManualStation(name) {
  const v = String(name || '').trim()
  if (!v) { toast('请输入车站名'); return }
  if (state.manualStations.includes(v)) { toast('该车站已在列表中'); return }
  state.manualStations.push(v)
  const input = hostRef && hostRef.querySelector('#f-station')
  if (input) input.value = ''
  renderManual()
}

function renderManual() {
  const el = hostRef && hostRef.querySelector('#manual-host')
  if (!el) return
  if (!state.manualStations.length) { el.innerHTML = '<span class="field-hint">未追加车站</span>'; return }
  el.innerHTML = state.manualStations.map((s, i) => `
    <span class="tag-pill blue" style="display:inline-flex;align-items:center;gap:6px">
      ${esc(s)}
      <button data-rm="${i}" style="color:inherit;font-size:11px;opacity:.7"><i class="fas fa-times"></i></button>
    </span>`).join('')
  el.querySelectorAll('[data-rm]').forEach(b => {
    b.addEventListener('click', () => {
      state.manualStations.splice(Number(b.dataset.rm), 1)
      renderManual()
    })
  })
}

function renderProgress(text) {
  const el = hostRef && hostRef.querySelector('#progress-text')
  if (el) el.textContent = text != null ? text : state.progress
}

function renderTrainList() {
  const el = hostRef && hostRef.querySelector('#train-list-host')
  if (!el) return
  const countEl = hostRef.querySelector('#train-count')
  if (countEl) countEl.textContent = String(state.trains.length)

  if (!state.trains.length) {
    el.innerHTML = `<div class="empty-state" style="padding:28px 8px">
      <i class="fas fa-satellite-dish empty-icon"></i>
      <div class="empty-text">${state.scanning ? '正在扫描…' : '点击「扫描」查找周边列车'}</div>
    </div>`
    return
  }

  const rows = state.trains.map((t, i) => {
    const running = t.status === 'running'
    return `
      <div class="radar-train-row" data-idx="${i}">
        <span style="width:9px;height:9px;border-radius:50%;background:${running ? '#007aff' : '#ff9500'};flex-shrink:0"></span>
        <span class="radar-train-no">${esc(t.train || '')}</span>
        <span class="radar-train-meta">
          ${running ? esc(t.progress || '') : (t.status === 'arrived' ? '已到达' : '待发车')}
          ${t.emu_no ? `<br /><span class="mono">${esc(t.emu_no)}</span>` : ''}
        </span>
      </div>`
  }).join('')

  el.innerHTML = `<div class="radar-list-scroll">${rows}</div>`
  el.querySelectorAll('[data-idx]').forEach(row => {
    row.addEventListener('click', () => {
      const t = state.trains[Number(row.dataset.idx)]
      if (!t) return
      focusTrain(t)
    })
  })
}

async function initMap() {
  const mapHost = hostRef && hostRef.querySelector('#radar-map')
  if (!mapHost) return
  try {
    await loadAMap()
    if (cancelled || !hostRef) return
    map = new window.AMap.Map('radar-map', {
      center: [116.397, 39.909],
      zoom: 9,
      mapStyle: 'amap://styles/fresh',
      resizeEnable: true,
      dragEnable: true,
      scrollWheel: true,
      doubleClickZoom: true,
      zoomEnable: true
    })
    // 缩放到一定级别后提示重新扫描
    map.on('zoomend', debounce(() => {
      if (state.trains.length) setTip('视野已变化，点击「扫描」刷新周边列车')
    }, 300))
    if (state.trains.length) drawMarkers()
  } catch (e) {
    console.error('[radar] 地图初始化失败', e)
    mapHost.innerHTML = `<div class="map-placeholder">
      <i class="fas fa-times-circle" style="font-size:40px;color:var(--red)"></i>
      <div>地图加载失败：${esc(e.message || e)}</div>
    </div>`
  }
}

function setTip(text) {
  const el = hostRef && hostRef.querySelector('#radar-tip')
  const tx = hostRef && hostRef.querySelector('#radar-tip-text')
  if (!el || !tx) return
  if (!text) { el.style.display = 'none'; return }
  el.style.display = 'flex'
  tx.textContent = text
}

function clearMarkers() {
  if (!map) return
  markers.forEach(m => { try { map.remove(m) } catch (e) { /* ignore */ } })
  markers = []
}

function drawMarkers() {
  if (!map) return
  clearMarkers()
  for (const t of state.trains) {
    const p = t.position
    if (!p) continue
    const lng = p.gcj02_lng || p.lng
    const lat = p.gcj02_lat || p.lat
    if (!lng || !lat) continue
    const running = t.status === 'running'
    const color = running ? '#007aff' : '#ff9500'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="8" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg>`
    const marker = new window.AMap.Marker({
      position: [lng, lat],
      icon: new window.AMap.Icon({
        image: 'data:image/svg+xml,' + encodeURIComponent(svg),
        size: new window.AMap.Size(22, 22),
        imageSize: new window.AMap.Size(22, 22)
      }),
      offset: new window.AMap.Pixel(-11, -11),
      zIndex: 200,
      title: t.train
    })
    marker.on('click', () => showTrainInfo(t))
    map.add(marker)
    markers.push(marker)
  }
}

function showTrainInfo(t) {
  if (!map) return
  if (trainTip) { try { map.remove(trainTip) } catch (e) { /* ignore */ } }
  const p = t.position || {}
  const lng = p.gcj02_lng || p.lng
  const lat = p.gcj02_lat || p.lat

  const el = document.createElement('div')
  el.style.cssText = `background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.18);
    font-family:inherit;min-width:220px`
  el.innerHTML = `
    <div style="font-size:17px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px">
      <i class="fas fa-train" style="color:var(--theme);font-size:14px"></i>${esc(t.train || '')}
    </div>
    <div style="font-size:12.5px;color:#8e8e93;line-height:1.9">
      <div>状态：${esc(t.status === 'running' ? '运行中' : t.status === 'arrived' ? '已到达' : '等待中')}</div>
      <div>进度：${esc(t.progress || '—')}</div>
      ${t.station ? `<div>最近车站：${esc(t.station)}</div>` : ''}
      ${t.segment ? `<div>本段区间：${esc(t.segment.depart_time || '')} - ${esc(t.segment.arrive_time || '')}</div>` : ''}
      <div>车组号：${esc(t.emu_no || '查询中…')}</div>
      <div>更新：${esc(t.time || '—')}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-sm" data-act="detail" style="flex:1">车次详情</button>
      <button class="btn btn-sm btn-ghost" data-act="locate" style="flex:1">实时位置</button>
    </div>
  `
  el.querySelector('[data-act="detail"]').addEventListener('click', () => navigate('train-detail', { train: t.train }))
  el.querySelector('[data-act="locate"]').addEventListener('click', () => navigate('train-locate', { train: t.train }))

  trainTip = new window.AMap.AdvancedInfoWindow({
    content: el,
    offset: new window.AMap.Pixel(0, -16),
    autoMove: false
  })
  trainTip.open(map, [lng, lat])
}

function focusTrain(t) {
  const p = t.position
  if (!p || !map) return
  const lng = p.gcj02_lng || p.lng
  const lat = p.gcj02_lat || p.lat
  if (!lng || !lat) return
  map.setZoomAndCenter(12, [lng, lat])
  showTrainInfo(t)
}

/** 并发受限的 map */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++
      try { out[idx] = await fn(items[idx], idx) } catch (e) { out[idx] = null }
    }
  })
  await Promise.all(workers)
  return out
}

async function scan() {
  if (state.scanning) return
  if (!map && getKey('amap_js')) { toast('地图尚未就绪，请稍候'); return }
  state.scanning = true
  state.progress = ''
  updateScanBadge()
  renderTrainList()

  const stations = getKey('amap_js') ? pickStations() : state.manualStations.slice(0, MAX_STATIONS)
  if (!stations.length) {
    state.scanning = false
    updateScanBadge()
    renderTrainList()
    toast('请先添加车站，或把地图缩放到城市范围')
    return
  }
  state.scanStations = stations

  try {
    // 1) 各车站大屏 → 汇总当日车次
    const trainNos = []
    const seen = {}
    let done = 0
    renderProgress(`正在查询 ${stations.length} 个车站的到发车次…`)
    await mapLimit(stations, 4, async (name) => {
      done++
      renderProgress(`正在查询车站（${done}/${stations.length}）：${name}`)
      try {
        // 大屏接口需要电报码，先尝试按站名解析
        const { resolveTelecode } = await import('../js/station.js')
        const { telecode } = await resolveTelecode(name)
        if (!telecode) return null
        const res = await getStationBigScreen(telecode)
        const list = (res && res.data) || []
        for (const item of list) {
          const no = item && item.trainNum
          if (no && !seen[no]) { seen[no] = true; trainNos.push(no) }
        }
      } catch (e) { /* 单站失败忽略 */ }
      return null
    })

    if (cancelled) return

    if (!trainNos.length) {
      state.trains = []
      state.lastScanAt = Date.now()
      toast('周边车站暂未查到车次', { icon: 'error' })
      return
    }

    // 2) 查这些车次的实时位置（只保留有坐标的）
    const targets = trainNos.slice(0, MAX_TRAINS)
    let located = 0
    renderProgress(`正在定位 ${targets.length} 趟列车…`)
    const results = await mapLimit(targets, CONCURRENCY, async (no) => {
      try {
        const r = await getTrainLocate(no)
        located++
        if (located % 10 === 0) renderProgress(`正在定位列车（${located}/${targets.length}）…`)
        if (r && r.code === 0 && r.data && r.data.position) return r.data
      } catch (e) { /* ignore */ }
      return null
    })
    if (cancelled) return

    const found = results.filter(Boolean)
    // 3) 前几趟补车组号（信息面板里用得着）
    await Promise.all(found.slice(0, 5).map(async (t) => {
      try {
        const emu = await getTrainSetOfTrain(t.train)
        if (emu) t.emu_no = emu
      } catch (e) { /* ignore */ }
    }))

    state.trains = found.sort((a, b) => {
      const ra = a.status === 'running' ? 0 : 1
      const rb = b.status === 'running' ? 0 : 1
      return ra - rb || String(a.train).localeCompare(String(b.train))
    })
    state.lastScanAt = Date.now()
    drawMarkers()
    renderProgress(`完成：${stations.length} 个车站 / ${targets.length} 趟车次 / 定位到 ${found.length} 趟`)
    if (!found.length) toast('周边列车暂无实时位置（可能未发车或已到达）')
    else toast(`扫描到 ${found.length} 趟列车`, { icon: 'success' })
  } catch (e) {
    console.error('[radar] 扫描失败', e)
    toastError('扫描失败，请稍后重试')
    renderProgress('扫描失败')
  } finally {
    state.scanning = false
    updateScanBadge()
    renderTrainList()
  }
}

function updateScanBadge() {
  const el = hostRef && hostRef.querySelector('#scan-badge')
  if (!el) return
  el.textContent = state.scanning
    ? '扫描中…'
    : (state.lastScanAt ? '上次扫描 ' + fmtTime(state.lastScanAt) : '未扫描')
  el.className = 'tag-pill ' + (state.scanning ? 'green' : 'gray')
}

function setupAutoScan() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
  if (state.autoScan) {
    autoTimer = setInterval(() => { if (!state.scanning) scan() }, 30000)
  }
}

registerView('train-radar', {
  title: '列车雷达',
  subtitle: '扫描周边车站，在地图上查看运行中的列车',
  icon: 'fa-satellite-dish',
  color: '#5ac8fa',
  render,
  destroy() {
    cancelled = true
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
    clearMarkers()
    if (trainTip) { try { trainTip.close() } catch (e) { /* ignore */ } trainTip = null }
    if (map) { try { map.destroy() } catch (e) { /* ignore */ } map = null }
    hostRef = null
  }
})
