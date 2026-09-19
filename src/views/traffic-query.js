/**
 * RailKale: Next PC - 交通查询（车站周边接驳）
 */

import { registerView } from '../js/router.js'
import { getStationCode, getStationInfo, parseStationCode } from '../js/api.js'
import { escapeHTML } from '../js/util.js'
import { toast, toastError } from '../js/ui.js'

let state = { station: '', result: null, activeTab: 0, loading: false, searched: false }
let hostRef = null
let codeCache = null

function esc(s) { return escapeHTML(s) }

async function findStationCode(name) {
  if (!codeCache) {
    const raw = await getStationCode()
    codeCache = parseStationCode(raw)
  }
  const hit = codeCache.find(s => s.name === name)
  return hit ? hit.telecode : null
}

function render(host) {
  hostRef = host
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:#5ac8fa"><i class="fas fa-bus"></i></div>
        <div>
          <div class="page-title">交通查询</div>
          <div class="page-subtitle">车站周边地铁、公交、出租车、停车场接驳信息</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="form-row">
        <div class="field">
          <label class="field-label">车站名称</label>
          <input class="input" id="f-station" placeholder="如：上海虹桥" value="${esc(state.station)}" />
        </div>
        <button class="btn" id="btn-go" style="height:40px;background:#5ac8fa"><i class="fas fa-search"></i> 查询</button>
      </div>
    </div>

    <div id="result-host"></div>
  `

  const input = host.querySelector('#f-station')
  const resultHost = host.querySelector('#result-host')

  function currentTab() {
    if (!state.result || !state.result.tabList) return null
    return state.result.tabList[state.activeTab]
  }

  function filteredNodes() {
    if (!state.result || !state.result.nodeList) return []
    const tab = currentTab()
    if (!tab) return []
    return state.result.nodeList.filter(n =>
      tab.tabType ? (n.typeName === tab.tabName || n.nodeType === tab.tabType) : n.typeName === tab.tabName
    )
  }

  function paint() {
    if (!state.searched) { resultHost.innerHTML = ''; return }
    if (state.loading) {
      resultHost.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>正在查询…</span></div>`
      return
    }
    if (!state.result) {
      resultHost.innerHTML = `<div class="empty-state">
        <i class="fas fa-bus empty-icon"></i>
        <div class="empty-text">未查询到交通接驳信息</div>
      </div>`
      return
    }

    const tabs = state.result.tabList || []
    const nodes = filteredNodes()

    resultHost.innerHTML = `
      <div style="margin-top:18px">
        <div class="tabs">
          ${tabs.map((t, i) => `<div class="tab ${i === state.activeTab ? 'active' : ''}" data-tab="${i}">${esc(t.tabName)}</div>`).join('')}
        </div>
        ${nodes.length
          ? `<div class="grid-2">${nodes.map(n => `
              <div class="card">
                <div style="font-size:15px;font-weight:700;margin-bottom:3px">${esc(n.nodeName || '')}</div>
                ${n.des ? `<div style="font-size:12.5px;color:var(--secondary);margin-bottom:12px">${esc(n.des)}</div>` : '<div style="height:10px"></div>'}
                <div style="display:flex;flex-wrap:wrap;gap:8px">
                  ${(n.nodeList && n.nodeList.length)
                    ? n.nodeList.map(l => `
                        <span class="line-chip">
                          ${l.color ? `<span class="line-chip-dot" style="background:${esc(l.color)}"></span>` : ''}
                          <span style="${l.color ? 'font-weight:600' : ''}">${esc(l.nodeName)}</span>
                        </span>`).join('')
                    : '<span class="text-small text-secondary">暂无线路信息</span>'}
                </div>
              </div>
            `).join('')}</div>`
          : `<div class="empty-state"><i class="fas fa-bus empty-icon"></i><div class="empty-text">该分类下暂无信息</div></div>`}
      </div>
    `

    resultHost.querySelectorAll('[data-tab]').forEach(el => {
      el.addEventListener('click', () => {
        state.activeTab = Number(el.dataset.tab)
        paint()
      })
    })
  }

  async function doSearch() {
    const val = input.value.trim()
    if (!val) { toast('请输入车站名称'); return }
    state.station = val
    state.loading = true
    state.searched = true
    state.result = null
    state.activeTab = 0
    paint()
    try {
      const code = await findStationCode(val)
      if (!code) {
        state.loading = false
        toastError('未找到该车站')
        paint()
        return
      }
      const res = await getStationInfo(code)
      state.loading = false
      if (res && res.content && res.content.data) {
        state.result = res.content.data
      } else {
        toastError('未查询到交通接驳信息')
      }
    } catch (e) {
      state.loading = false
      toastError('查询失败')
    }
    if (hostRef === host) paint()
  }

  host.querySelector('#btn-go').addEventListener('click', doSearch)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })

  paint()
  if (state.searched) paint()
}

registerView('traffic-query', {
  title: '交通查询',
  icon: 'fa-bus',
  color: '#5ac8fa',
  render,
  destroy() { hostRef = null }
})
