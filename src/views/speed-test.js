/**
 * RailKale: Next PC - 定位测速
 * 基于浏览器 Geolocation 的实时速度与移动轨迹（无地图依赖，Canvas 自绘）
 */

import { registerView } from '../js/router.js'
import { formatDuration, fixed, haversine, escapeHTML } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = {
  recording: false,
  points: [],
  lastFix: null,
  totalDistance: 0,
  maxSpeed: 0,
  startTs: 0,
  now: 0,
  longitude: 0,
  latitude: 0,
  accuracy: 0,
  hasFix: false,
  status: '点击开始进行定位测速',
  error: false
}

let watchId = null
let tickTimer = null
let hostRef = null
let canvasEl = null
let ctx = null
let frame = 0

function stopAll() {
  state.recording = false
  if (watchId != null) {
    try { navigator.geolocation.clearWatch(watchId) } catch (e) { /* ignore */ }
    watchId = null
  }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

function currentSpeed() {
  const seconds = (state.now - state.startTs) / 1000
  if (seconds <= 0 || state.totalDistance <= 0) return 0
  return (state.totalDistance / 1000) / (seconds / 3600)
}

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#ff9500"><i class="fas fa-gauge-high"></i></div>
        <div>
          <div class="page-title">定位测速</div>
          <div class="page-subtitle">基于系统定位的实时速度与移动轨迹（总路程 ÷ 总时长）</div>
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="speed-panel">
          <div class="speed-label">实时速度</div>
          <div class="speed-value-wrap">
            <span class="speed-value" id="speed-value">0.0</span>
            <span class="speed-unit">km/h</span>
          </div>
          <div class="speed-metrics">
            <div class="speed-metric">
              <span class="speed-metric-label">最高速度</span>
              <span class="speed-metric-value" id="max-speed">0.0 km/h</span>
            </div>
            <div class="speed-metric">
              <span class="speed-metric-label">测试时长</span>
              <span class="speed-metric-value" id="elapsed">00:00</span>
            </div>
            <div class="speed-metric">
              <span class="speed-metric-label">累计距离</span>
              <span class="speed-metric-value" id="distance">0 m</span>
            </div>
            <div class="speed-metric">
              <span class="speed-metric-label">轨迹点</span>
              <span class="speed-metric-value" id="points">0</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">当前位置</div>
          <table class="data-table">
            <tbody>
              <tr><td style="color:var(--secondary);width:90px">经度</td><td class="mono" id="lng">—</td></tr>
              <tr><td style="color:var(--secondary)">纬度</td><td class="mono" id="lat">—</td></tr>
              <tr><td style="color:var(--secondary)">精度</td><td class="mono" id="acc">—</td></tr>
            </tbody>
          </table>
        </div>

        <div class="card" style="text-align:center">
          <button class="play-btn" id="btn-toggle" style="margin:6px auto 12px">
            <i class="fas fa-play"></i>
          </button>
          <div style="font-size:13.5px;font-weight:500;color:${state.error ? 'var(--red)' : 'var(--secondary)'}" id="status">
            ${esc(state.status)}
          </div>
        </div>

        <div class="card">
          <div class="card-title">说明</div>
          <div style="font-size:12.5px;color:var(--secondary);line-height:1.8">
            <p>· 速度 = 累计路程 ÷ 测试总时长，因此起步阶段会偏低，随行程拉长逐渐收敛。</p>
            <p>· 轨迹绘制在右侧 Canvas 上，使用等距投影，适合观察相对位移。</p>
            <p>· 首次使用需要授权定位权限；桌面端定位精度依赖系统定位服务（Wi-Fi / GPS）。</p>
          </div>
        </div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <div style="padding:14px 16px 8px" class="card-title">移动轨迹</div>
        <div style="position:relative;background:var(--fill2)">
          <canvas id="track-canvas" style="width:100%;height:520px;display:block"></canvas>
        </div>
      </div>
    </div>
  `

  canvasEl = host.querySelector('#track-canvas')
  setupCanvas()
  paint()
  draw()

  host.querySelector('#btn-toggle').addEventListener('click', () => {
    if (state.recording) stopTrack()
    else startTrack()
  })

  window.addEventListener('resize', onResize)
}

function onResize() {
  if (!hostRef || !canvasEl) return
  setupCanvas()
  draw()
}

function setupCanvas() {
  if (!canvasEl) return
  const rect = canvasEl.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvasEl.width = Math.max(1, Math.round(rect.width * dpr))
  canvasEl.height = Math.max(1, Math.round((rect.height || 520) * dpr))
  ctx = canvasEl.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // 渐变背景
  const w = rect.width
  const h = rect.height || 520
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#eef4fb')
  grad.addColorStop(1, '#e6ecf5')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function paint() {
  if (!hostRef) return
  const q = (id) => hostRef.querySelector('#' + id)
  const sv = q('speed-value'); if (sv) sv.textContent = fixed(currentSpeed(), 1)
  const ms = q('max-speed'); if (ms) ms.textContent = fixed(state.maxSpeed, 1) + ' km/h'
  const el = q('elapsed')
  if (el) {
    const start = state.startTs > 0 ? state.startTs : Date.now()
    const ref = state.now > 0 ? state.now : Date.now()
    el.textContent = state.recording || state.startTs ? formatDuration((ref - start) / 1000) : '00:00'
  }
  const ds = q('distance'); if (ds) ds.textContent = fixed(state.totalDistance, 0) + ' m'
  const pt = q('points'); if (pt) pt.textContent = String(state.points.length)
  const lg = q('lng'); if (lg) lg.textContent = state.hasFix ? state.longitude.toFixed(6) : '—'
  const la = q('lat'); if (la) la.textContent = state.hasFix ? state.latitude.toFixed(6) : '—'
  const ac = q('acc'); if (ac) ac.textContent = state.accuracy ? '±' + fixed(state.accuracy, 0) + ' 米' : '—'
  const st = q('status')
  if (st) {
    st.textContent = state.status
    st.style.color = state.error ? 'var(--red)' : 'var(--secondary)'
  }
  const btn = q('btn-toggle')
  if (btn) {
    btn.classList.toggle('playing', state.recording)
    btn.querySelector('i').className = 'fas ' + (state.recording ? 'fa-stop' : 'fa-play')
  }
}

function draw() {
  if (!ctx || !canvasEl) return
  const rect = canvasEl.getBoundingClientRect()
  const w = rect.width
  const h = rect.height || 520

  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, '#eef4fb')
  grad.addColorStop(1, '#e6ecf5')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // 网格
  ctx.strokeStyle = 'rgba(60,60,67,0.07)'
  ctx.lineWidth = 1
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

  const pts = state.points
  if (pts.length === 0) {
    ctx.fillStyle = '#a6adb8'
    ctx.font = '14px -apple-system, "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('点击「开始」记录轨迹', w / 2, h / 2)
    return
  }

  // 计算边界（等距投影）
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    const x = p.lng * Math.cos(p.lat * Math.PI / 180)
    const y = p.lat
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const spanX = Math.max(maxX - minX, 1e-6)
  const spanY = Math.max(maxY - minY, 1e-6)
  const pad = 46
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  const toXY = (p) => ({
    x: w / 2 + (p.lng * Math.cos(p.lat * Math.PI / 180) - cx) * scale,
    y: h / 2 - (p.lat - cy) * scale
  })

  // 光晕
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(52,199,89,0.22)'
  ctx.lineWidth = 9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  pts.forEach((p, i) => {
    const { x, y } = toXY(p)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 主路径
  ctx.beginPath()
  ctx.strokeStyle = '#34c759'
  ctx.lineWidth = 3
  pts.forEach((p, i) => {
    const { x, y } = toXY(p)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 起点
  const s0 = toXY(pts[0])
  ctx.beginPath()
  ctx.fillStyle = '#34c759'
  ctx.arc(s0.x, s0.y, 5, 0, Math.PI * 2)
  ctx.fill()

  // 当前点（脉冲）
  const last = toXY(pts[pts.length - 1])
  const pulse = 12 + Math.sin(frame / 3) * 2
  ctx.beginPath()
  ctx.fillStyle = 'rgba(0,122,255,0.22)'
  ctx.arc(last.x, last.y, pulse, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = '#fff'
  ctx.arc(last.x, last.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = '#007aff'
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2)
  ctx.fill()

  // 底部信息
  ctx.fillStyle = 'rgba(60,60,67,0.5)'
  ctx.font = '11px -apple-system, "PingFang SC", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`轨迹点 ${pts.length} · 累计 ${fixed(state.totalDistance, 0)} m`, 12, h - 12)
}

function handleFix(coords) {
  const lng = Number(coords.longitude)
  const lat = Number(coords.latitude)
  if (!isFinite(lng) || !isFinite(lat)) return

  const t = Date.now()
  state.longitude = lng
  state.latitude = lat
  state.accuracy = coords.accuracy || 0
  state.hasFix = true
  state.now = t

  if (state.lastFix) {
    const d = haversine(state.lastFix.lat, state.lastFix.lng, lat, lng)
    const dt = (t - state.lastFix.t) / 1000
    if (dt > 0 && d > 0.6) state.totalDistance += d
  }
  state.lastFix = { lng, lat, t }
  state.points.push({ lng, lat, t })

  if (t - state.startTs >= 3000) {
    const cs = currentSpeed()
    if (cs > state.maxSpeed) state.maxSpeed = cs
  }
  if (state.recording) state.status = '正在实时测速…'
  paint()
  draw()
}

function handleError(err) {
  console.error('Geolocation error', err)
  if (err && err.code === 1) {
    state.error = true
    state.recording = false
    state.status = '定位权限被拒绝，请在系统设置中允许本应用使用定位'
    stopAll()
  } else if (err && err.code === 2) {
    state.status = '定位暂时不可用，正在重试…'
  } else if (err && err.code === 3) {
    state.status = '定位超时，正在重试…'
  } else {
    state.error = true
    state.recording = false
    state.status = '定位失败，请稍后再试'
  }
  paint()
}

function startTrack() {
  if (!navigator.geolocation) {
    toastError('当前环境不支持定位')
    return
  }
  stopAll()
  state.points = []
  state.maxSpeed = 0
  state.totalDistance = 0
  state.lastFix = null
  state.startTs = Date.now()
  state.now = state.startTs
  state.recording = true
  state.error = false
  state.status = '正在获取定位权限…'
  paint()
  draw()

  watchId = navigator.geolocation.watchPosition(
    (pos) => handleFix(pos.coords),
    handleError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  )

  tickTimer = setInterval(() => {
    if (!state.recording) return
    state.now = Date.now()
    frame++
    paint()
    draw()
  }, 200)

  if (hostRef) hostRef.querySelector('#status').textContent = '正在实时定位…'
  state.status = '正在实时定位…'
  toast('已开始测速', { icon: 'success' })
}

function stopTrack() {
  stopAll()
  state.now = Date.now()
  state.status = `已停止，共记录 ${state.points.length} 个轨迹点`
  paint()
  draw()
}

function render2(host) { render(host) }

registerView('speed-test', {
  title: '定位测速',
  icon: 'fa-gauge-high',
  color: '#ff9500',
  render,
  destroy() {
    stopAll()
    window.removeEventListener('resize', onResize)
    hostRef = null
    canvasEl = null
    ctx = null
  }
})
