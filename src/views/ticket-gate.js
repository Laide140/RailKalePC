/**
 * RailKale: Next PC - 检票口查询
 * 自有接口 + 12306 官方接口
 */

import { registerView } from '../js/router.js'
import { getExit, queryTicketCheck } from '../js/api.js'
import { resolveTelecode } from '../js/station.js'
import { today, escapeHTML, apiErrMsg } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = {
  trainNum: '',
  station: '',
  date: today(),
  gate: null,
  official: null,
  loading: false,
  officialLoading: false,
  searched: false
}
let hostRef = null

function esc(s) { return escapeHTML(s) }

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#ff3b30"><i class="fas fa-ticket-alt"></i></div>
        <div>
          <div class="page-title">检票口查询</div>
          <div class="page-subtitle">查询检票口、出站口与站台信息</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车次号</label>
          <input class="input" id="f-train" placeholder="如：G1" value="${esc(state.trainNum)}" />
        </div>
        <div class="field">
          <label class="field-label">车站</label>
          <input class="input" id="f-station" placeholder="如：北京南" value="${esc(state.station)}" />
        </div>
        <div class="field narrow">
          <label class="field-label">乘车日期</label>
          <input class="input" type="date" id="f-date" value="${esc(state.date)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px"><i class="fas fa-search"></i> 查询</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const trainEl = host.querySelector('#f-train')
  const stationEl = host.querySelector('#f-station')
  const dateEl = host.querySelector('#f-date')
  const resultHost = host.querySelector('#result-host')

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询…</span></div>`
      return
    }

    const g = state.gate
    const o = state.official

    if (!g && !o && !state.officialLoading) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-ticket-alt empty-icon"></i>
        <div class="empty-text">暂无检票口数据</div>
      </div>`
      return
    }

    resultHost.innerHTML = `
      <div class="grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-title">${esc(state.trainNum)} @ ${esc(state.station)} · 检票信息</div>
          <div style="margin-bottom:16px">
            <div class="field-label">检票口</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${g && g.entrance && g.entrance.length
                ? g.entrance.map(e => `<span class="tag-pill blue" style="font-size:15px;padding:7px 16px">${esc(e)}</span>`).join('')
                : '<span class="text-small text-secondary">暂无数据</span>'}
            </div>
          </div>
          <div style="margin-bottom:16px">
            <div class="field-label">出站口</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              ${g && g.exit && g.exit.length
                ? g.exit.map(e => `<span class="tag-pill orange" style="font-size:15px;padding:7px 16px">${esc(e)}</span>`).join('')
                : '<span class="text-small text-secondary">暂无数据</span>'}
            </div>
          </div>
          <div>
            <div class="field-label">站台</div>
            <div style="font-size:30px;font-weight:700;color:var(--orange);letter-spacing:-1px">${esc((g && g.platform) || '暂无')}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">12306 官方检票口</div>
          ${state.officialLoading
            ? `<div class="loading-state" style="padding:30px"><div class="spinner"></div><span>查询中…</span></div>`
            : o
              ? `<div style="text-align:center;padding:20px 0">
                   <div style="font-size:13px;color:var(--secondary);margin-bottom:10px">${esc(state.date)} 官方数据</div>
                   <div style="font-size:36px;font-weight:700;color:var(--green);letter-spacing:-1px">${esc(o.trainPlatform || '暂无数据')}</div>
                   ${o.trainPlatform ? `<div style="font-size:12px;color:var(--secondary);margin-top:8px">站台号</div>` : ''}
                 </div>`
              : `<div class="empty-state" style="padding:40px 0">
                   <i class="fas fa-clipboard-list empty-icon"></i>
                   <div class="empty-text">暂无官方数据</div>
                 </div>`}
        </div>
      </div>
    `
  }

  async function doSearch() {
    state.trainNum = trainEl.value.trim().toUpperCase()
    state.station = stationEl.value.trim()
    state.date = dateEl.value
    if (!state.trainNum) { toast('请输入车次号'); return }
    if (!state.station) { toast('请输入车站'); return }

    state.loading = true
    state.searched = true
    state.gate = null
    state.official = null
    state.officialLoading = true
    paint()

    try {
      const { telecode } = await resolveTelecode(state.station)
      const [gateRes, officialRes] = await Promise.allSettled([
        getExit(state.trainNum, telecode),
        queryTicketCheck(state.date, state.trainNum, telecode)
      ])

      state.loading = false
      state.officialLoading = false

      if (gateRes.status === 'fulfilled' && gateRes.value && gateRes.value.success && gateRes.value.data) {
        state.gate = gateRes.value.data
      } else if (gateRes.status === 'rejected') {
        console.warn('检票口查询失败', gateRes.reason)
      }

      if (officialRes.status === 'fulfilled' && officialRes.value && officialRes.value.status && officialRes.value.data) {
        state.official = officialRes.value.data
      }

      if (!state.gate && !state.official) toastError('未查询到检票口信息')
    } catch (e) {
      state.loading = false
      state.officialLoading = false
      toastError(apiErrMsg(e))
    }
    if (hostRef === host) paint()
  }

  host.querySelector('#btn-go').addEventListener('click', doSearch)
  trainEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  stationEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  paint()
  if (state.searched) paint()
}

registerView('ticket-gate', {
  title: '检票口',
  icon: 'fa-ticket-alt',
  color: '#ff3b30',
  render,
  destroy() { hostRef = null }
})
