/**
 * RailKale: Next PC - 算路器
 * 移植自移动端 pages/route-planner：任意两站之间的最短走行线路
 *
 * 桌面端：左侧粘性参数卡（起终点 / 目标里程 / 精度），右侧结果区分三块：
 * 距离摘要、全线走向静态图、途经车站表（可搜索、可复制里程）
 */

import { registerView } from '../js/router.js'
import { getStationRoute, getAmapStaticMap } from '../js/api.js'
import { getKey } from '../js/keys.js'
import { escapeHTML, copyText, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const QUICK_ROUTES = [
  ['广州南', '北京西'],
  ['上海虹桥', '成都东'],
  ['北京南', '哈尔滨西'],
  ['郑州东', '西安北'],
  ['昆明南', '拉萨']
]

let state = {
  from: '',
  to: '',
  km: '',
  ver: 1,            // 1=大概里程（默认，快）；2=精确里程（慢）
  loading: false,
  result: null,
  errorText: '',
  errorHint: ''
}

let hostRef = null
let filterKeyword = ''

function esc(s) { return escapeHTML(s) }

/** 接口返回的站名常带「站」字，界面上去掉更清爽 */
function cleanName(name) {
  return String(name || '').replace(/站$/, '')
}

/**
 * 等距抽稀：把上万个几何点压到 maxN 个，
 * 既满足高德静态图对点数与 URL 长度的限制，又能保持线路整体形状。
 */
function simplify(coords, maxN) {
  const n = coords.length
  if (n <= maxN) return coords
  const step = Math.ceil(n / maxN)
  const out = []
  for (let i = 0; i < n; i += step) out.push(coords[i])
  // 末点必留，否则线路会缺一截
  if (out[out.length - 1] !== coords[n - 1]) out.push(coords[n - 1])
  return out
}

function coords() {
  const g = state.result && state.result.geometry
  return (g && g.coordinates) || []
}

function fullMapUrl() {
  const pts = simplify(coords(), 60)
  if (pts.length < 2) return ''
  const path = pts.map(c => `${Number(c[0]).toFixed(4)},${Number(c[1]).toFixed(4)}`).join(';')
  return getAmapStaticMap('900*520', null, '7,0x007AFF,1,,:' + path)
}

function stations() {
  return (state.result && state.result.stations) || []
}

/** 算路请求进行中：每秒更新等待时长，避免用户以为卡死 */
let elapsedTimer = null
function startElapsedTimer(container) {
  stopElapsedTimer()
  const startedAt = state.requestStartedAt || Date.now()
  elapsedTimer = setInterval(() => {
    const el = container.querySelector('#elapsed-hint')
    if (!el) { stopElapsedTimer(); return }
    const sec = Math.round((Date.now() - startedAt) / 1000)
    el.textContent = `已等待 ${sec} 秒 · 该接口冷启动可能需要 10–30 秒`
  }, 1000)
}
function stopElapsedTimer() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

function render(host) {
  hostRef = host
  const hasAmap = !!getKey('amap')

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-route"></i></div>
        <div>
          <div class="page-title">算路器</div>
          <div class="page-subtitle">计算任意两站之间的最短走行线路与途经车站</div>
        </div>
      </div>
    </div>

    <div class="detail-2col" style="grid-template-columns:380px minmax(0,1fr)">
      <div class="detail-side">
        <div class="card">
          <div class="card-title">线路参数</div>
          <div class="field">
            <label class="field-label">起点站</label>
            <input class="input" id="f-from" placeholder="如：广州南" value="${esc(state.from)}" />
          </div>
          <div style="display:flex;justify-content:center;margin:-6px 0 8px">
            <button class="btn btn-ghost btn-sm" id="btn-swap" title="交换起终点"><i class="fas fa-exchange-alt"></i> 交换</button>
          </div>
          <div class="field">
            <label class="field-label">终点站</label>
            <input class="input" id="f-to" placeholder="如：北京西" value="${esc(state.to)}" />
          </div>
          <div class="field">
            <label class="field-label">目标里程（可选）</label>
            <input class="input" id="f-km" type="number" min="1" placeholder="留空 = 最短路径" value="${esc(state.km)}" />
            <div class="field-hint">填写后按指定里程规划绕行方案，便于复刻特定走行路径。</div>
          </div>
          <div class="field" id="precision-field" style="display:${state.km ? 'block' : 'none'}">
            <label class="field-label">里程精度</label>
            <div class="precision-opts">
              <div class="precision-opt ${state.ver === 1 ? 'active' : ''}" data-ver="1">
                <div class="precision-name">大概里程</div>
                <div class="precision-desc">快，约 2.5 秒</div>
              </div>
              <div class="precision-opt ${state.ver === 2 ? 'active' : ''}" data-ver="2">
                <div class="precision-name">精确里程</div>
                <div class="precision-desc">慢，约 6.5 秒起</div>
              </div>
            </div>
          </div>
          <button class="btn btn-lg" id="btn-go" style="width:100%;margin-top:6px;background:var(--theme)">
            <i class="fas fa-calculator"></i> 算 路
          </button>
        </div>

        <div class="card">
          <div class="card-title">常用线路</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${QUICK_ROUTES.map(([a, b], i) => `<button class="btn btn-ghost btn-sm" data-route="${i}">${esc(a)} → ${esc(b)}</button>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">说明</div>
          <div class="field-hint" style="line-height:1.8">
            算路结果基于铁路线路数据计算，用于还原里程与走向。<br />
            途经车站按沿线里程升序排列，坐标可直接在地图上查看。
          </div>
        </div>
      </div>

      <div id="result-host"></div>
    </div>
  `

  const fromEl = host.querySelector('#f-from')
  const toEl = host.querySelector('#f-to')
  const kmEl = host.querySelector('#f-km')
  const resultHost = host.querySelector('#result-host')

  function sync() {
    state.from = fromEl.value.trim()
    state.to = toEl.value.trim()
    state.km = kmEl.value.trim()
    host.querySelector('#precision-field').style.display = state.km ? 'block' : 'none'
  }

  function paint() {
    if (state.loading) {
      resultHost.innerHTML = `
        <div class="card">
          <div class="loading-state" style="padding:56px 20px">
            <div class="spinner"></div>
            <span>${state.km ? '正在规划指定里程线路…' : '正在计算最短路径…'}</span>
            ${state.km ? `<span class="field-hint">${state.ver === 2 ? '精确里程需反复微调，耗时较长' : '大概里程会遍历大量绕行方案'}</span>` : ''}
            <span class="field-hint" id="elapsed-hint" style="margin-top:4px">已等待 0 秒 · 该接口冷启动可能需要 10–30 秒</span>
          </div>
        </div>`
      startElapsedTimer(resultHost)
      return
    }

    if (state.errorText) {
      resultHost.innerHTML = `<div class="card">
        <div class="empty-state" style="padding:52px 20px">
          <i class="fas fa-circle-exclamation empty-icon" style="color:var(--orange)"></i>
          <div class="empty-text">${esc(state.errorText)}</div>
          ${state.errorHint ? `<div class="field-hint">${esc(state.errorHint)}</div>` : ''}
          <button class="btn btn-sm btn-ghost" id="btn-retry" style="margin-top:6px"><i class="fas fa-redo"></i> 重试</button>
        </div>
      </div>`
      resultHost.querySelector('#btn-retry').addEventListener('click', doSearch)
      return
    }

    if (!state.result) {
      resultHost.innerHTML = `<div class="card">
        <div class="empty-state" style="padding:56px 20px">
          <i class="fas fa-route empty-icon"></i>
          <div class="empty-text">输入起终点站，计算最短走行线路</div>
          <div class="field-hint">也可以从左侧「常用线路」快速试算</div>
        </div>
      </div>`
      return
    }

    const r = state.result
    const dist = r.distance || {}
    const km = Number(dist.kilometers || 0)
    const plan = r.kmPlan
    const list = stations()
    const kw = filterKeyword.trim()
    const filtered = kw
      ? list.filter(s => String(s.name || '').indexOf(kw) >= 0 || String(s.code || '').toUpperCase().indexOf(kw.toUpperCase()) >= 0)
      : list

    const mapUrl = fullMapUrl()

    resultHost.innerHTML = `
      <div class="card">
        <div class="card-title">算路结果</div>
        <div class="route-summary">
          <span class="route-km">${km.toFixed(1)}</span>
          <span class="route-unit">km</span>
          <span style="margin-left:12px;font-size:15px;font-weight:600">${esc(cleanName(state.result.from || state.from))} → ${esc(cleanName(state.result.to || state.to))}</span>
        </div>
        <div class="route-meta">
          <span class="route-meta-item">途经 <b>${list.length}</b> 站</span>
          ${r.nodeCount ? `<span class="route-meta-item"><b>${r.nodeCount}</b> 个走行节点</span>` : ''}
          ${r.ferry && r.ferry.hasFerry ? `<span class="route-meta-item" style="color:var(--theme-text)">⛴ 轮渡 <b>${Number(r.ferry.km || 0).toFixed(1)}</b> km</span>` : ''}
        </div>
        ${plan ? `<div class="route-plan">
          <div>目标 <b>${esc(plan.requestedKm)}</b> km · 实际 <b>${Number(plan.actualKm || 0).toFixed(1)}</b> km
            （偏差 ${plan.diffKm > 0 ? '+' : ''}${Number(plan.diffKm || 0).toFixed(1)}）</div>
          <div style="color:var(--secondary)">${esc(plan.mode || (plan.ver === 2 ? '微调' : '整段'))} · ${plan.reached ? '已达成' : '未达成，已返回最短路'}</div>
        </div>` : ''}
        ${r.warnings && r.warnings.length ? `<div class="route-warning">
          <i class="fas fa-triangle-exclamation" style="margin-top:2px"></i>
          <div>${r.warnings.map(w => esc(w)).join('<br />')}</div>
        </div>` : ''}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" id="btn-copy-stations"><i class="fas fa-copy"></i> 复制途经车站</button>
          <button class="btn btn-sm btn-ghost" id="btn-copy-coords"><i class="fas fa-location-dot"></i> 复制坐标</button>
        </div>
      </div>

      ${mapUrl ? `<div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <span>全线走向</span>
          ${!hasAmap ? '<span class="tag-pill orange" style="margin-left:auto">未配置高德密钥，地图不可用</span>' : ''}
        </div>
        <img class="static-map" src="${esc(mapUrl)}" alt="全线走向" style="margin-top:0" />
      </div>` : ''}

      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:10px">
          <span>途经车站</span>
          <span class="tag-pill gray">${filtered.length}${kw && filtered.length !== list.length ? ' / ' + list.length : ''}</span>
          <input class="input" id="f-filter" placeholder="筛选站名 / 电报码"
                 style="margin-left:auto;max-width:220px;height:32px" value="${esc(filterKeyword)}" />
        </div>
        ${!filtered.length ? `<div class="empty-state" style="padding:32px 10px">
          <div class="empty-text">没有匹配的车站</div>
        </div>` : `
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr><th style="width:60px">序号</th><th>车站</th><th style="width:110px">电报码</th>
                  <th style="width:120px;text-align:right">累计里程</th><th style="width:120px;text-align:right">距上站</th></tr>
            </thead>
            <tbody>
              ${filtered.map((s, i) => {
                const idx = list.indexOf(s) + 1
                const prev = list[list.indexOf(s) - 1]
                const delta = prev ? (Number(s.km || 0) - Number(prev.km || 0)) : null
                return `<tr>
                  <td class="mono text-secondary">${idx}</td>
                  <td style="font-weight:600">${esc(cleanName(s.name))}</td>
                  <td class="mono text-secondary">${esc(s.code || '—')}</td>
                  <td class="mono" style="text-align:right">${Number(s.km || 0).toFixed(1)} km</td>
                  <td class="mono text-secondary" style="text-align:right">${delta === null ? '—' : delta.toFixed(1) + ' km'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    `

    resultHost.querySelector('#btn-copy-stations')?.addEventListener('click', async () => {
      const text = list.map((s, i) => `${i + 1}\t${cleanName(s.name)}\t${Number(s.km || 0).toFixed(1)} km`).join('\n')
      const ok = await copyText(`算路：${state.from} → ${state.to}\n总里程 ${km.toFixed(1)} km\n${text}`)
      ok ? toast('已复制途经车站', { icon: 'success' }) : toastError('复制失败')
    })
    resultHost.querySelector('#btn-copy-coords')?.addEventListener('click', async () => {
      const text = coords().map(c => `${c[0]},${c[1]}`).join('\n')
      const ok = await copyText(text)
      ok ? toast(`已复制 ${coords().length} 个坐标点`, { icon: 'success' }) : toastError('复制失败')
    })

    const filterEl = resultHost.querySelector('#f-filter')
    if (filterEl) {
      filterEl.addEventListener('input', () => {
        filterKeyword = filterEl.value
        // 只重绘结果区，避免输入框失焦
        paint()
        const again = resultHost.querySelector('#f-filter')
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length) }
      })
    }
  }

  async function doSearch() {
    sync()
    filterKeyword = ''
    if (!state.from) { toast('请输入起点站'); return }
    if (!state.to) { toast('请输入终点站'); return }
    if (state.km && !(Number(state.km) > 0)) { toast('目标里程需为正数'); return }

    state.loading = true
    state.errorText = ''
    state.errorHint = ''
    state.result = null
    state.requestStartedAt = Date.now()
    paint()

    try {
      const res = await getStationRoute(
        state.from, state.to,
        state.km ? Number(state.km) : 0,
        state.km ? state.ver : 0
      )
      if (!res) {
        state.errorText = '网络异常，请稍后重试'
      } else if (res.ok === false) {
        state.errorText = res.error || '算路失败'
        state.errorHint = res.hint || ''
      } else {
        state.result = res
      }
    } catch (e) {
      state.errorText = apiErrMsg(e)
    } finally {
      state.loading = false
      stopElapsedTimer()
    }
    if (hostRef === host) paint()
  }

  host.querySelector('#btn-go').addEventListener('click', doSearch)
  host.querySelector('#btn-swap').addEventListener('click', () => {
    const t = fromEl.value
    fromEl.value = toEl.value
    toEl.value = t
    sync()
  })
  fromEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { toEl.focus() } })
  toEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  kmEl.addEventListener('input', sync)
  host.querySelectorAll('[data-ver]').forEach(el => {
    el.addEventListener('click', () => {
      state.ver = Number(el.dataset.ver)
      host.querySelectorAll('[data-ver]').forEach(x => x.classList.toggle('active', x === el))
    })
  })
  host.querySelectorAll('[data-route]').forEach(el => {
    el.addEventListener('click', () => {
      const [a, b] = QUICK_ROUTES[Number(el.dataset.route)]
      fromEl.value = a
      toEl.value = b
      kmEl.value = ''
      doSearch()
    })
  })

  paint()
}

registerView('route-planner', {
  title: '算路器',
  subtitle: '计算任意两站之间的最短走行线路',
  icon: 'fa-route',
  color: '#ff9500',
  render,
  onEnter(params) {
    if (params && params.from) state.from = params.from
    if (params && params.to) state.to = params.to
  },
  destroy() { hostRef = null }
})
