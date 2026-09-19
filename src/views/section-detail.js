/**
 * RailKale: Next PC - 分区详情 / 自定义卡片详情
 */

import { registerView, navigate } from '../js/router.js'
import { SECTIONS, getFeature, getFeaturesByIds } from '../js/features.js'
import { getSettings } from '../js/settings.js'
import { escapeHTML } from '../js/util.js'

function esc(s) { return escapeHTML(s) }

function resolveCard(id) {
  if (typeof id === 'string' && id.indexOf('custom-') === 0) {
    const cardId = id.slice(7)
    const card = (getSettings().customCards || []).find(c => c.id === cardId)
    if (!card) return null
    return {
      title: card.title || '我的卡片',
      subtitle: '自定义卡片',
      icon: 'fa-th-large',
      color: card.color || '#007aff',
      bgImage: card.bgImage || '',
      gradient: `linear-gradient(135deg, ${card.color || '#007aff'} 0%, rgba(0,0,0,.35) 140%)`,
      features: getFeaturesByIds(card.features)
    }
  }
  const sec = SECTIONS.find(s => s.id === id)
  if (!sec) return null
  return {
    title: sec.title,
    subtitle: sec.subtitle,
    icon: sec.icon,
    color: sec.badgeColor,
    bgImage: '',
    gradient: sec.gradient,
    features: getFeaturesByIds(sec.features)
  }
}

let currentId = 'travel'

function render(host, params) {
  if (params && params.id) currentId = params.id
  const sec = resolveCard(currentId)

  if (!sec) {
    host.innerHTML = `<div class="empty-state">
      <i class="fas fa-question empty-icon"></i>
      <div class="empty-text">未找到该分区</div>
      <button class="btn" id="btn-home">返回首页</button>
    </div>`
    host.querySelector('#btn-home').addEventListener('click', () => navigate('home'))
    return
  }

  const bgStyle = sec.bgImage
    ? `background-image:url('${esc(sec.bgImage)}');background-size:cover;background-position:center`
    : `background:${sec.gradient}`

  host.innerHTML = `
    <div style="position:relative;height:200px;border-radius:var(--radius-lg);overflow:hidden;margin-bottom:22px;${bgStyle}">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.08),rgba(0,0,0,.6));
                  display:flex;flex-direction:column;justify-content:flex-end;padding:24px 26px;color:#fff">
        <div style="width:46px;height:46px;border-radius:12px;background:${hexA(sec.color, 0.9)};
                    display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px">
          <i class="fas ${sec.icon}"></i>
        </div>
        <div style="font-size:26px;font-weight:700;letter-spacing:-.5px">${esc(sec.title)}</div>
        <div style="font-size:13.5px;color:rgba(255,255,255,.85);margin-top:3px">${esc(sec.subtitle)}</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;color:var(--secondary);text-transform:uppercase;letter-spacing:.5px">
        包含 ${sec.features.length} 个功能
      </div>
      <button class="btn btn-ghost btn-sm" id="btn-back"><i class="fas fa-arrow-left"></i> 返回首页</button>
    </div>

    <div class="grid-panel">
      ${sec.features.map(f => `
        <div class="grid-tile" data-path="${esc(f.path)}">
          <div class="grid-tile-icon" style="background:${esc(f.color)}"><i class="fas ${esc(f.icon)}"></i></div>
          <span class="grid-tile-label">${esc(f.label)}</span>
        </div>
      `).join('')}
    </div>
  `

  host.querySelectorAll('.grid-tile').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.path))
  })
  host.querySelector('#btn-back').addEventListener('click', () => navigate('home'))
}

function hexA(hex, alpha) {
  let c = String(hex || '#007aff').replace('#', '')
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  const n = parseInt(c, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

registerView('section-detail', {
  title: '分区详情',
  hidden: true,
  render
})
