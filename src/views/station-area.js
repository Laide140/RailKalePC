/**
 * RailKale: Next PC - 站台规模
 */

import { registerView } from '../js/router.js'
import { getStationArea } from '../js/api.js'
import { escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

const QUICK = ['广州南', '北京南', '上海虹桥', '深圳北', '杭州东', '成都东', '武汉', '南京南', '西安北', '重庆西']

let state = { station: '', info: null, loading: false, searched: false }
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#5856d6"><i class="fas fa-stairs"></i></div>
        <div>
          <div class="page-title">站台规模</div>
          <div class="page-subtitle">查询车站的站台数与到发线路数</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车站名称</label>
          <input class="input" id="f-station" placeholder="如：广州南" value="${esc(state.station)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px;background:#5856d6"><i class="fas fa-search"></i> 查询</button>
      </div>
      <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <span style="font-size:12px;color:var(--secondary)">常用车站</span>
        ${QUICK.map(s => `<button class="btn btn-ghost btn-sm" data-station="${esc(s)}">${esc(s)}</button>`).join('')}
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-station')
  const resultHost = host.querySelector('#result-host')

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询…</span></div>`
      return
    }
    if (!state.info) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-subway empty-icon"></i>
        <div class="empty-text">未查询到该车站的站台信息</div>
      </div>`
      return
    }
    const i = state.info
    resultHost.innerHTML = `
      <div class="card" style="margin-top:18px;text-align:center;padding:30px">
        <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:22px">
          <div style="width:44px;height:44px;border-radius:12px;background:#5856d6;display:flex;align-items:center;justify-content:center;color:#fff">
            <i class="fas fa-train"></i>
          </div>
          <div style="font-size:26px;font-weight:700">${esc(i.station)}</div>
        </div>
        <div style="display:flex;justify-content:center;gap:64px;flex-wrap:wrap;background:var(--card2);border-radius:var(--radius);padding:26px">
          <div>
            <div style="font-size:52px;font-weight:700;color:#5856d6;line-height:1;letter-spacing:-2px">${esc(i.platform)}</div>
            <div style="font-size:13px;color:var(--secondary);margin-top:6px">站台</div>
          </div>
          <div style="width:1px;background:var(--separator)"></div>
          <div>
            <div style="font-size:52px;font-weight:700;color:#34c759;line-height:1;letter-spacing:-2px">${esc(i.line)}</div>
            <div style="font-size:13px;color:var(--secondary);margin-top:6px">到发线</div>
          </div>
        </div>
        ${i.matched ? `<div style="margin-top:14px;font-size:12.5px;color:var(--tertiary)">「${esc(i.matched)}」近似匹配到 ${esc(i.station)}</div>` : ''}
      </div>
    `
  }

  async function doSearch(name) {
    const val = (name || input.value).trim()
    if (!val) { toast('请输入车站名'); return }
    input.value = val
    state.station = val
    state.loading = true
    state.searched = true
    state.info = null
    paint()
    try {
      const res = await getStationArea(val)
      state.loading = false
      if (res && (res.code === 200 || res.success) && res.data && res.data.station) {
        state.info = {
          station: res.data.station,
          platform: res.data.platform,
          line: res.data.line,
          matched: (res.message && String(res.message).includes('模糊')) ? val : null
        }
      } else {
        state.info = null
        toastError('未找到该车站')
      }
    } catch (e) {
      state.loading = false
      state.info = null
      toastError(apiErrMsg(e))
    }
    if (hostRef === host) paint()
  }

  host.querySelector('#btn-go').addEventListener('click', () => doSearch())
  host.querySelectorAll('[data-station]').forEach(b => {
    b.addEventListener('click', () => doSearch(b.dataset.station))
  })
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  paint()
  if (state.searched) paint()
}

registerView('station-area', {
  title: '站台规模',
  icon: 'fa-stairs',
  color: '#5856d6',
  render,
  destroy() { hostRef = null }
})
