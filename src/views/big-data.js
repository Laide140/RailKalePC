/**
 * RailKale: Next PC - 铁路大数据
 * 对应移动端 pages/big-data（上游当前为「开发中」占位页）
 *
 * 桌面端：不做骑车动画，改为展示数据规模概览与规划中的指标，
 * 并把「已有数据」入口直接链到对应页面，避免死页面。
 */

import { registerView, navigate } from '../js/router.js'
import { escapeHTML } from '../js/util.js'

function esc(s) { return escapeHTML(s) }

const PLANNED = [
  { icon: 'fa-chart-line', label: '客运量趋势', desc: '按路局 / 站点汇总的日均客流与节假日波动', color: '#007aff' },
  { icon: 'fa-gauge-high', label: '列车准点率', desc: '各线路正点率与晚点多发区段排行', color: '#34c759' },
  { icon: 'fa-route', label: '里程排行', desc: '按车次 / 区段统计走行里程与平均旅速', color: '#ff9500' },
  { icon: 'fa-subway', label: '车组运用效率', desc: '动车组日运用里程与在线时长分布', color: '#af52de' },
  { icon: 'fa-clock', label: '开售时间分布', desc: '全国车站起售时间热力分布', color: '#5ac8fa' },
  { icon: 'fa-network-wired', label: '路网覆盖', desc: '各省铁路里程、车站密度与复线率', color: '#ff2d55' }
]

const AVAILABLE = [
  { icon: 'fa-clock', label: '车站开售时间', desc: '全国 3000+ 车站起售时间', path: 'sale-time' },
  { icon: 'fa-building', label: '车站代码', desc: '电报码 / 拼音 / 缩写查询', path: 'station-code' },
  { icon: 'fa-route', label: '算路器', desc: '两站之间最短走行线路与里程', path: 'route-planner' },
  { icon: 'fa-map', label: '路网地图', desc: '全国铁路 GeoJSON 图层', path: 'rail-network-map' }
]

function render(host) {
  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:var(--theme)"><i class="fas fa-chart-simple"></i></div>
        <div>
          <div class="page-title">铁路大数据</div>
          <div class="page-subtitle">铁路运行与客流的统计视角</div>
        </div>
      </div>
      <span class="tag-pill orange"><i class="fas fa-screwdriver-wrench"></i> 规划中</span>
    </div>

    <div class="card">
      <div class="placeholder-hero">
        <div class="placeholder-icon"><i class="fas fa-chart-simple"></i></div>
        <div class="placeholder-title">功能开发中</div>
        <div class="placeholder-text">
          铁路大数据将以统计数据的形式呈现线路、车站与车组的运行情况。
          在正式上线前，你可以先用下面这些已经可用的数据查询功能。
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">规划中的指标</div>
      <div class="grid-3">
        ${PLANNED.map(p => `
          <div class="option-card" style="cursor:default">
            <div class="option-card-title">
              <i class="fas ${esc(p.icon)}" style="color:${esc(p.color)}"></i>${esc(p.label)}
            </div>
            <div class="option-card-desc">${esc(p.desc)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">现在就能用的数据</div>
      <div class="grid-3">
        ${AVAILABLE.map(a => `
          <div class="option-card" data-goto="${esc(a.path)}" style="cursor:pointer">
            <div class="option-card-title"><i class="fas ${esc(a.icon)}" style="color:var(--theme-text)"></i>${esc(a.label)}</div>
            <div class="option-card-desc">${esc(a.desc)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `

  host.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.goto))
  })
}

registerView('big-data', {
  title: '铁路大数据',
  subtitle: '铁路运行与客流的统计视角',
  icon: 'fa-chart-simple',
  color: '#5ac8fa',
  render
})
