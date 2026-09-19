/**
 * RailKale: Next PC - 线路图（按车次查线路坐标 + 高德静态图）
 */

import { registerView } from '../js/router.js'
import { getMapLine, getAmapStaticMap } from '../js/api.js'
import { getKey } from '../js/keys.js'
import { escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = { train: '', data: null, loading: false, searched: false }
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#ff9500"><i class="fas fa-map"></i></div>
        <div>
          <div class="page-title">铁路线路图</div>
          <div class="page-subtitle">按车次查看途经车站与线路走向</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车次号</label>
          <input class="input" id="f-train" placeholder="如：G1" value="${esc(state.train)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px;background:#ff9500"><i class="fas fa-search"></i> 查看线路</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-train')
  const resultHost = host.querySelector('#result-host')

  function stationNames() {
    if (!state.data || !state.data.stations) return []
    return state.data.stations.map(s => Object.keys(s)[0])
  }

  function staticMapUrl() {
    const d = state.data
    if (!d || !d.stations || d.stations.length < 2) return ''
    const markers = d.stations
      .map(s => { const c = Object.values(s)[0]; return c ? c.join(',') : null })
      .filter(Boolean).join(';')

    const segments = Object.entries(d.train || {}).sort((a, b) => (a[1].index || 0) - (b[1].index || 0))
    const pathCoords = []
    for (const [, seg] of segments) {
      if (seg.line && Array.isArray(seg.line)) {
        for (const p of seg.line) pathCoords.push(p.join(','))
      }
    }
    if (pathCoords.length < 2) return ''
    return getAmapStaticMap('1024*560', `mid,0xDD3333,0:${markers}`, `3,0x3377FF,0.85,,:${pathCoords.join(';')}`)
  }

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在加载线路数据…</span></div>`
      return
    }
    if (!state.data) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-map empty-icon"></i>
        <div class="empty-text">未查询到该车次的线路数据</div>
      </div>`
      return
    }

    const names = stationNames()
    const url = staticMapUrl()
    const segments = Object.entries(state.data.train || {})

    resultHost.innerHTML = `
      <div class="grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-title">途经车站 · 共 ${names.length} 站</div>
          <div style="max-height:560px;overflow-y:auto">
            <div class="timeline">
              ${names.map((n, i) => `
                <div class="timeline-row">
                  <div class="timeline-track">
                    <div class="timeline-dot ${i === 0 ? 'first' : (i === names.length - 1 ? 'last' : '')}"></div>
                    ${i < names.length - 1 ? '<div class="timeline-line"></div>' : ''}
                  </div>
                  <div class="timeline-content" style="padding-bottom:10px">
                    <div class="timeline-station"><span>${esc(n)}</span></div>
                  </div>
                  <div class="timeline-times"><span class="text-small text-secondary">第 ${i + 1} 站</span></div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div>
          <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:14px 16px 10px" class="card-title">线路走向</div>
            <div style="height:420px;background:var(--fill2)">
              ${url
                ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover" alt="线路图"
                       onerror="this.parentElement.innerHTML='<div class=\\'map-placeholder\\'><i class=\\'fas fa-map\\' style=\\'font-size:32px\\'></i><div>线路图加载失败，请检查高德密钥</div></div>'" />`
                : `<div class="map-placeholder"><i class="fas fa-map" style="font-size:32px"></i><div>${getKey('amap') ? '暂无足够坐标绘制线路' : '未配置高德 Web 服务密钥'}</div></div>`}
            </div>
          </div>

          <div class="card">
            <div class="card-title">线路分段 · 共 ${segments.length} 段</div>
            <table class="data-table">
              <thead><tr><th>区间</th><th style="text-align:right">坐标点数</th></tr></thead>
              <tbody>
                ${segments.map(([name, seg]) => `
                  <tr>
                    <td>${esc(String(name).replace(/-/g, ' → '))}</td>
                    <td style="text-align:right" class="mono text-secondary">${seg.line ? seg.line.length : 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `
  }

  async function doSearch() {
    const t = input.value.trim().toUpperCase()
    if (!t) { toast('请输入车次号'); return }
    state.train = t
    state.loading = true
    state.searched = true
    state.data = null
    paint()
    try {
      const res = await getMapLine(t)
      state.loading = false
      if (res && res.success && res.data) {
        state.data = res.data
      } else {
        toastError((res && res.msg) || '查询失败')
      }
    } catch (e) {
      state.loading = false
      toastError(apiErrMsg(e))
    }
    if (hostRef === host) paint()
  }

  host.querySelector('#btn-go').addEventListener('click', doSearch)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  paint()
  if (state.searched) paint()
}

registerView('line-map', {
  title: '线路图',
  icon: 'fa-map',
  color: '#ff9500',
  hidden: false,
  render,
  onEnter(params) {
    if (params && params.train) state.train = params.train
  },
  destroy() { hostRef = null }
})
