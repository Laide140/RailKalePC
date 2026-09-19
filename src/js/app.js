/**
 * RailKale: Next PC - 应用外壳
 * 侧边栏导航 + 顶部标题栏 + 内容区路由
 */

import { SECTIONS, getFeature } from './features.js'
import { initSettings, applyTheme, onSettingsChange, getSettings } from './settings.js'
import { registerView, navigate, bindRouter, hasView, allViews, isSelfWrittenHash } from './router.js'
import { toast, toastError } from './ui.js'
import { escapeHTML } from './util.js'

export { registerView, navigate, toast, toastError }

// ---------------------------------------------------------------------------
// 侧边栏
// ---------------------------------------------------------------------------

function buildSidebar() {
  const el = document.getElementById('sidebar')
  el.innerHTML = `
    <div class="sidebar-brand">
      <img class="sidebar-brand-logo" src="assets/icons/logo.png" alt="logo" />
      <div class="sidebar-brand-text">
        <div class="sidebar-brand-name">铁路万花筒</div>
        <div class="sidebar-brand-en">RailKale: Next</div>
      </div>
    </div>
    <div class="nav-group">
      <div class="nav-group-title">概览</div>
      <div class="nav-item" data-path="home">
        <i class="fas fa-home nav-icon"></i><span class="nav-label">首页</span>
      </div>
    </div>
    <div id="nav-sections"></div>
    <div class="nav-group">
      <div class="nav-group-title">系统</div>
      <div class="nav-item" data-path="settings">
        <i class="fas fa-sliders-h nav-icon"></i><span class="nav-label">设置</span>
      </div>
      <div class="nav-item" data-path="mine">
        <i class="fas fa-user nav-icon"></i><span class="nav-label">关于</span>
      </div>
    </div>
    <div class="sidebar-footer">
      <div>数据仅供参考</div>
      <div>请以铁路12306为准</div>
    </div>
  `

  // 分区导航：每个分区内放该分区功能；隐藏视图（详情页/编辑器）不进导航
  const secHost = el.querySelector('#nav-sections')
  for (const sec of SECTIONS) {
    const group = document.createElement('div')
    group.className = 'nav-group'
    group.innerHTML = `<div class="nav-group-title">${escapeHTML(sec.title)}</div>`
    for (const fid of sec.features) {
      const f = getFeature(fid)
      if (!f) continue
      const def = hasView(f.path) ? allViews().find(([p]) => p === f.path)?.[1] : null
      if (def && def.hidden) continue
      const item = document.createElement('div')
      item.className = 'nav-item'
      item.dataset.path = f.path
      item.innerHTML = `<i class="fas ${f.icon} nav-icon" style="color:${f.color}"></i><span class="nav-label">${escapeHTML(f.label)}</span>`
      group.appendChild(item)
    }
    secHost.appendChild(group)
  }

  el.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.path))
  })
}

function updateNavHighlight(path) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === path)
  })
  const entry = allViews().find(([p]) => p === path)
  const titleEl = document.getElementById('page-title-text')
  if (titleEl && entry) titleEl.textContent = entry[1].title || '铁路万花筒'
}

// ---------------------------------------------------------------------------
// 顶部标题栏
// ---------------------------------------------------------------------------

function buildTitlebar() {
  const el = document.getElementById('titlebar')
  el.innerHTML = `
    <div class="titlebar-brand">
      <img class="titlebar-logo" src="assets/icons/logo.png" alt="logo" />
      <span class="titlebar-title" id="page-title-text">铁路万花筒</span>
      <span class="titlebar-sub" id="api-source-badge">新 API</span>
    </div>
    <div class="titlebar-spacer"></div>
    <div class="titlebar-actions">
      <button class="tb-btn" id="tb-refresh" title="刷新当前页面"><i class="fas fa-sync-alt"></i></button>
      <button class="tb-btn" id="tb-home" title="回到首页"><i class="fas fa-home"></i></button>
      <button class="tb-btn" id="tb-settings" title="设置"><i class="fas fa-sliders-h"></i></button>
    </div>
  `

  el.querySelector('#tb-refresh').addEventListener('click', () => {
    const cur = window.location.hash.replace(/^#\/?/, '') || 'home'
    navigate(cur)
  })
  el.querySelector('#tb-home').addEventListener('click', () => navigate('home'))
  el.querySelector('#tb-settings').addEventListener('click', () => navigate('settings'))

  if (window.native && window.native.platform === 'darwin') {
    document.body.classList.add('is-mac')
  }
}

function updateApiBadge() {
  const badge = document.getElementById('api-source-badge')
  if (!badge) return
  const src = getSettings().apiSource || 'next'
  badge.textContent = { next: '新 API', old: '旧 API', railgo: 'RailGo' }[src] || '新 API'
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

let currentHashView = null

export async function startApp() {
  buildSidebar()
  buildTitlebar()

  bindRouter({
    content: document.getElementById('content'),
    onNavigate: (path) => {
      currentHashView = path
      updateNavHighlight(path)
    }
  })

  await initSettings()

  applyTheme(getSettings().themeColor)
  updateApiBadge()
  onSettingsChange((state) => {
    applyTheme(state.themeColor)
    updateApiBadge()
  })

  // 初始路由：优先 hash，其次首页
  const hash = (window.location.hash || '').replace(/^#\/?/, '')
  currentHashView = hash && hasView(hash) ? hash : 'home'
  navigate(currentHashView)

  window.addEventListener('hashchange', () => {
    // 忽略由 navigate() 自身写 hash 触发的事件，避免重复导航（会丢掉路由参数）
    if (isSelfWrittenHash(window.location.hash)) return
    const h = (window.location.hash || '').replace(/^#\/?/, '')
    if (h && hasView(h) && h !== currentHashView) navigate(h)
  })

  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled]', e.reason)
  })
}
