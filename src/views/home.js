/**
 * RailKale: Next PC - 首页
 * 三种布局：分区卡片 / 宫格 / 自定义卡片
 * 顶部车次直达搜索 + 最近查询（对应移动端首页）
 */

import { SECTIONS, getFeature } from '../js/features.js'
import { registerView, navigate } from '../js/router.js'
import { getSettings, getRecentTrains, addSearchHistory, hexToRgba } from '../js/settings.js'
import { escapeHTML } from '../js/util.js'
import { toast } from '../js/ui.js'

function secCard(sec) {
  const tags = (sec.features || [])
    .map(id => getFeature(id))
    .filter(Boolean)
    .map(f => `<span class="section-card-tag">${escapeHTML(f.label)}</span>`)
    .join('')

  return `
    <div class="section-card" data-sec="${sec.id}" style="background-image:${sec.gradient}">
      <div class="section-card-top">
        <div class="section-card-icon" style="background:${hexToRgba('#ffffff', 0.22)}">
          <i class="fas ${sec.icon}"></i>
        </div>
        <span class="section-card-arrow">›</span>
      </div>
      <div class="section-card-inner">
        <div class="section-card-title">${escapeHTML(sec.title)}</div>
        <div class="section-card-sub">${escapeHTML(sec.subtitle)}</div>
        <div class="section-card-tags">${tags}</div>
      </div>
    </div>
  `
}

function gridMode() {
  return SECTIONS.map(sec => {
    const tiles = (sec.features || [])
      .map(id => getFeature(id))
      .filter(Boolean)
      .map(f => `
        <div class="grid-tile" data-path="${f.path}">
          <div class="grid-tile-icon" style="background:${f.color}"><i class="fas ${f.icon}"></i></div>
          <span class="grid-tile-label">${escapeHTML(f.label)}</span>
        </div>
      `).join('')
    return `
      <div class="grid-section">
        <div class="grid-section-title"><i class="fas ${sec.icon}"></i><span>${escapeHTML(sec.title)}</span></div>
        <div class="grid-panel">${tiles}</div>
      </div>
    `
  }).join('')
}

function customMode() {
  const cards = getSettings().customCards || []
  if (!cards.length) {
    return `<div class="empty-state">
      <i class="fas fa-palette empty-icon"></i>
      <div class="empty-text">还没有自定义卡片</div>
      <button class="btn" data-goto="custom-editor"><i class="fas fa-plus"></i> 去创建</button>
    </div>`
  }
  return `<div class="custom-cards">${cards.map(card => {
    const style = card.bgImage
      ? `background-image:url('${escapeHTML(card.bgImage)}')`
      : `background:${hexToRgba(card.color || '#007aff', 0.62)}`
    const tags = (card.features || [])
      .map(id => getFeature(id))
      .filter(Boolean)
      .map(f => `<span class="custom-card-tag">${escapeHTML(f.label)}</span>`)
      .join('')
    return `
      <div class="custom-card" data-card="${escapeHTML(card.id)}" style="${style}">
        <div class="custom-card-title">${escapeHTML(card.title || '未命名卡片')}</div>
        <div class="custom-card-tags">${tags || '<span class="custom-card-tag">空卡片</span>'}</div>
      </div>
    `
  }).join('')}</div>`
}

function render(host) {
  const s = getSettings()
  const layout = s.homeLayout || 'card'
  const recent = getRecentTrains(8)

  let body = ''
  if (layout === 'grid') body = gridMode()
  else if (layout === 'custom') body = customMode()
  else body = `<div class="section-cards">${SECTIONS.map(secCard).join('')}</div>`

  const layoutLabel = { card: '分区卡片', grid: '宫格', custom: '自定义' }[layout] || '分区卡片'

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:linear-gradient(135deg,var(--theme),var(--theme-strong))">
          <i class="fas fa-train"></i>
        </div>
        <div>
          <div class="page-title">铁路万花筒</div>
          <div class="page-subtitle">RailKale: Next 桌面版 · 当前布局：${layoutLabel}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" data-goto="custom-editor"><i class="fas fa-palette"></i> 自定义主页</button>
        <button class="btn btn-ghost btn-sm" data-goto="settings"><i class="fas fa-sliders-h"></i> 设置</button>
      </div>
    </div>

    <div class="card" style="padding:14px 16px">
      <div style="display:flex;align-items:center;gap:10px">
        <i class="fas fa-search" style="color:var(--secondary);font-size:15px"></i>
        <input class="input" id="hero-train" placeholder="输入车次直接查看车次详情，如 G1"
               style="border:none;background:transparent;font-size:15px;padding-left:0" />
        <button class="btn btn-sm" id="hero-go" style="flex-shrink:0"><i class="fas fa-arrow-right"></i> 查看</button>
      </div>
      ${recent.length ? `<div style="display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:12px;padding-top:12px;border-top:0.5px solid var(--separator)">
        <span style="font-size:12px;color:var(--secondary)">最近</span>
        ${recent.map(t => `<button class="tag-pill blue" data-recent="${escapeHTML(t)}" style="cursor:pointer;border:none">${escapeHTML(t)}</button>`).join('')}
      </div>` : ''}
    </div>

    ${body}

    <div class="card" style="margin-top:24px;display:flex;align-items:center;gap:14px">
      <img src="assets/icons/logo.png" style="width:38px;height:38px;border-radius:10px" alt="logo" />
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">铁路万花筒 · RailKale: Next</div>
        <div style="font-size:12px;color:var(--secondary)">数据接口：自有 / RailGo · 地图：高德 · 检票口官方：12306</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-goto="mine">关于</button>
    </div>
  `

  const input = host.querySelector('#hero-train')

  function goTrain(no) {
    const v = String(no || '').trim().toUpperCase()
    if (!v) { toast('请输入车次号'); return }
    addSearchHistory(v)
    navigate('train-detail', { train: v })
  }

  host.querySelector('#hero-go').addEventListener('click', () => goTrain(input.value))
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') goTrain(input.value) })
  host.querySelectorAll('[data-recent]').forEach(b => {
    b.addEventListener('click', () => goTrain(b.dataset.recent))
  })

  // 事件
  host.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.goto))
  })
  host.querySelectorAll('.section-card').forEach(el => {
    el.addEventListener('click', () => navigate('section-detail', { id: el.dataset.sec }))
  })
  host.querySelectorAll('.grid-tile').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.path))
  })
  host.querySelectorAll('.custom-card').forEach(el => {
    el.addEventListener('click', () => navigate('section-detail', { id: 'custom-' + el.dataset.card }))
  })
}

registerView('home', {
  title: '首页',
  icon: 'fa-home',
  render
})
