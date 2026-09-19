/**
 * RailKale: Next PC - 路由与视图注册表
 *
 * 单独成模块，避免 views/* 与 app.js 形成循环依赖。
 * views 只依赖本模块，app.js 依赖本模块的 registry。
 */

const registry = new Map()

// 自身改写 hash 时记录写入值，避免 hashchange 监听器再次触发同一次导航
let selfWrittenHash = null

let currentView = null
let currentParams = {}
let contentEl = null
let onNavigate = null

/** 注册视图 */
export function registerView(path, def) {
  if (!def || typeof def.render !== 'function') {
    throw new Error(`registerView: ${path} 缺少 render 函数`)
  }
  registry.set(path, def)
}

export function getView(path) {
  return registry.get(path)
}

export function hasView(path) {
  return registry.has(path)
}

export function allViews() {
  return [...registry.entries()]
}

/** 由 app.js 注入内容容器与导航回调 */
export function bindRouter({ content, onNavigate: cb }) {
  contentEl = content
  onNavigate = cb
}

export function currentPath() { return currentView }

/**
 * 判断某次 hashchange 是否由 navigate() 自身写入引起
 * 用「当前 hash 是否等于自己刚写入的值」判定，比布尔标记更抗干扰
 * （布尔标记在快速连续导航时可能被错误消费）。
 * @param {string} hash 当前 location.hash
 * @returns {boolean} true 表示应忽略本次 hashchange
 */
export function isSelfWrittenHash(hash) {
  if (selfWrittenHash && selfWrittenHash === hash) {
    selfWrittenHash = null
    return true
  }
  return false
}

/**
 * 跳转到指定视图
 * @param {string} path
 * @param {object} params
 */
export function navigate(path, params = {}) {
  const def = registry.get(path)
  if (!def) {
    throw new Error('页面不存在：' + path)
  }

  // 销毁上一个视图
  if (currentView && currentView !== path) {
    const prev = registry.get(currentView)
    if (prev && prev.destroy) {
      try { prev.destroy() } catch (e) { console.error('[router] destroy 失败', e) }
    }
  }

  currentView = path
  currentParams = params || {}

  if (def.onEnter) {
    try { def.onEnter(currentParams) } catch (e) { console.error('[router] onEnter 失败', e) }
  }

  // 同步 URL hash（file:// 下 replaceState 可能受限，失败则忽略）
  // 注意：赋值 hash 会异步派发 hashchange，必须置位抑制标记，
  // 否则 app.js 的监听器会用「无参数」再导航一次，把带参渲染的结果冲掉。
  try {
    const target = '#/' + path
    if (window.location.hash !== target) {
      selfWrittenHash = target
      window.location.hash = target
    }
  } catch (e) { /* ignore */ }

  if (contentEl) {
    contentEl.innerHTML = ''
    contentEl.scrollTop = 0
  }

  const host = document.createElement('div')
  host.className = 'view'
  if (contentEl) contentEl.appendChild(host)

  try {
    def.render(host, currentParams)
  } catch (e) {
    console.error('[router] 渲染失败', path, e)
    host.innerHTML = `<div class="empty-state">
      <i class="fas fa-bug empty-icon"></i>
      <div class="empty-text">页面渲染失败：${escapeHtml(e.message || e)}</div>
    </div>`
  }

  if (onNavigate) onNavigate(path)
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
