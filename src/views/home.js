/**
 * RailKale: Next PC - 首页
 * 三种布局：分区卡片 / 宫格 / 自定义卡片
 */

import { SECTIONS, getFeature } from '../js/features.js'
import { registerView, navigate } from '../js/router.js'
import { getSettings, hexToRgba } from '../js/settings.js'
import { escapeHTML } from '../js/util.js'

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

  let body = ''
  if (layout === 'grid') body = gridMode()
  else if (layout === 'custom') body = customMode()
  else body = `<div class="section-cards">${SECTIONS.map(secCard).join('')}</div>`

  const layoutLabel = { card: '分区卡片', grid: '宫格', custom: '自定义' }[layout] || '分区卡片'

  host.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <div class="page-head-icon" style="background:linear-gradient(135deg,#007aff,#5ac8fa)">
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

    <div class="hero-search" data-goto="train-query">
      <i class="fas fa-search"></i>
      <span class="hero-search-text">查车次、查车站、查时刻…</span>
      <span class="hero-search-kbd">车次查询</span>
    </div>

    ${body}

    <div class="card" style="margin-top:24px;display:flex;align-items:center;gap:14px">
      <img src="assets/icons/logo.png" style="width:38px;height:38px;border-radius:10px" alt="logo" />
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">铁路万花筒 · RailKale: Next</div>
        <div style="font-size:12px;color:var(--secondary)">数据接口：自有 / RailGo · 动车组配属：rail.re · 地图：高德</div>
      </div>
      <button class="btn btn-ghost btn-sm" data-goto="mine">关于</button>
    </div>
  `

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
