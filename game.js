const canvas = document.getElementById('game')
const context = canvas.getContext('2d')
const width = 600
const height = 800

const audioctx = new (window.AudioContext || window.webkitAudioContext)()

function playsound(freq, duration, type, volume) {
  try {
    const osc = audioctx.createOscillator()
    const gain = audioctx.createGain()
    osc.connect(gain)
    gain.connect(audioctx.destination)
    osc.type = type || 'square'
    osc.frequency.setValueAtTime(freq, audioctx.currentTime)
    gain.gain.setValueAtTime(volume || 0.08, audioctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioctx.currentTime + (duration || 0.1))
    osc.start()
    osc.stop(audioctx.currentTime + (duration || 0.1))
  } catch (e) {}
}

function playshootsound() { playsound(660, 0.08, 'square') }
function playexplodesound() { playsound(220, 0.2, 'sawtooth', 0.12); playsound(110, 0.3, 'sawtooth', 0.08) }
function playpowerupsound() { playsound(440, 0.1, 'sine', 0.1); setTimeout(() => playsound(660, 0.1, 'sine', 0.1), 80) }
function playgameoversound() { playsound(330, 0.3, 'sawtooth', 0.1); setTimeout(() => playsound(220, 0.4, 'sawtooth', 0.08), 250) }
function playbosssound() { playsound(150, 0.4, 'sawtooth', 0.1) }

let gamestate = 'menu'
let ispaused = false
let bosscount = 0
let bossbullets = []
let playerscore = 0
let bestscore = parseInt(localStorage.getItem('spacebest') || '0')
let playerlives = 3
let gamelevel = 1
let combocount = 0
let combotimer = 0

const player = {
  posx: width / 2,
  posy: height - 60,
  size: 16,
  speed: 5,
  shield: false,
  shieldtimer: 0,
  rapidfire: false,
  rapidfiretimer: 0,
  spread: false,
  spreadtimer: 0
}

let bullets = []
let enemies = []
let particles = []
let powerups = []
let stars = []
let nebulae = []
const keys = {}
let shoottimer = 0
let spawntimer = 0
let framecount = 0
let shake = 0
let flash = 0
let touchmove = null
let touchfire = false

function initstars() {
  stars = []
  for (let i = 0; i < 120; i++) {
    stars.push({
      posx: Math.random() * width,
      posy: Math.random() * height,
      size: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 2 + 0.3,
      bright: Math.random() * 0.5 + 0.5
    })
  }
  nebulae = []
  for (let i = 0; i < 6; i++) {
    nebulae.push({
      posx: Math.random() * width,
      posy: Math.random() * height,
      radius: Math.random() * 120 + 60,
      color: ['#e9456010', '#6c63ff10', '#4488ff10', '#ff00ff10', '#ff880010', '#44ff4410'][i],
      speed: Math.random() * 0.15 + 0.05
    })
  }
}

function spawnenemy() {
  const roll = Math.random()
  let enemy
  if (roll < 0.5) {
    enemy = { posx: Math.random() * (width - 50) + 25, posy: -30, width: 30, height: 30, health: 1, maxhealth: 1, speed: 1 + gamelevel * 0.2, color: '#e94560', type: 'basic', score: 10 }
  } else if (roll < 0.7) {
    enemy = { posx: Math.random() * (width - 40) + 20, posy: -25, width: 22, height: 22, health: 1, maxhealth: 1, speed: 2.5 + gamelevel * 0.3, color: '#ffd700', type: 'fast', score: 15 }
  } else if (roll < 0.85) {
    enemy = { posx: Math.random() * (width - 60) + 30, posy: -40, width: 40, height: 40, health: 3, maxhealth: 3, speed: 0.7 + gamelevel * 0.15, color: '#6c63ff', type: 'tank', score: 30 }
  } else if (roll < 0.93) {
    enemy = { posx: Math.random() * (width - 40) + 20, posy: -20, width: 20, height: 20, health: 1, maxhealth: 1, speed: 1.5, color: '#ff4444', type: 'diver', score: 20, diverdir: 0 }
  } else {
    enemy = { posx: Math.random() * (width - 50) + 25, posy: -25, width: 26, height: 26, health: 2, maxhealth: 2, speed: 0.4, color: '#ffaa44', type: 'turret', score: 25, turrettimer: Math.floor(Math.random() * 40) }
  }
  enemies.push(enemy)
}

function spawnpowerup(posx, posy) {
  const types = ['shield', 'rapidfire', 'spread']
  const type = types[Math.floor(Math.random() * types.length)]
  powerups.push({ posx, posy, type, vely: 1.5, size: 14, timer: 0 })
}

function shoot() {
  playshootsound()
  if (player.spread) {
    bullets.push({ posx: player.posx, posy: player.posy - player.size, velx: 0, vely: -8, size: 3 })
    bullets.push({ posx: player.posx - 12, posy: player.posy - player.size + 8, velx: -1.5, vely: -6.5, size: 2 })
    bullets.push({ posx: player.posx + 12, posy: player.posy - player.size + 8, velx: 1.5, vely: -6.5, size: 2 })
  } else {
    bullets.push({ posx: player.posx, posy: player.posy - player.size, velx: 0, vely: -8, size: 3 })
  }
}

function explode(posx, posy, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 4 + 1
    particles.push({
      posx, posy,
      velx: Math.cos(angle) * speed,
      vely: Math.sin(angle) * speed,
      life: Math.random() * 25 + 15,
      maxlife: 40,
      color: color || '#ff6600',
      size: Math.random() * 3 + 2
    })
  }
}

function resetpowerups() {
  player.shield = false
  player.shieldtimer = 0
  player.rapidfire = false
  player.rapidfiretimer = 0
  player.spread = false
  player.spreadtimer = 0
}

function updategame() {
  if (gamestate !== 'playing') return
  if (ispaused) return
  framecount++

  for (const star of stars) {
    star.posy += star.speed
    if (star.posy > height) { star.posy = 0; star.posx = Math.random() * width }
  }

  if (touchmove) {
    const dx = touchmove.x - player.posx
    const dy = touchmove.y - player.posy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > 5) {
      player.posx += (dx / dist) * player.speed
      player.posy += (dy / dist) * player.speed
    }
  }
  if (keys['ArrowLeft'] || keys['KeyA']) player.posx -= player.speed
  if (keys['ArrowRight'] || keys['KeyD']) player.posx += player.speed
  if (keys['ArrowUp'] || keys['KeyW']) player.posy -= player.speed
  if (keys['ArrowDown'] || keys['KeyS']) player.posy += player.speed
  player.posx = Math.max(player.size, Math.min(width - player.size, player.posx))
  player.posy = Math.max(player.size, Math.min(height - player.size, player.posy))

  shoottimer++
  const shootrate = player.rapidfire ? 7 : 14
  if (shoottimer >= shootrate) { shoot(); shoottimer = 0 }

  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].posy += bullets[i].vely
    bullets[i].posx += (bullets[i].velx || 0)
    if (bullets[i].posy < -10) bullets.splice(i, 1)
  }

  spawntimer++
  const spawnrate = Math.max(20, 55 - gamelevel * 2)
  if (spawntimer >= spawnrate) {
    if (Math.floor(playerscore / 300) > bosscount && playerscore > 100) {
      playbosssound()
      bosscount++
      flash = 20
      const boss = { posx: width / 2, posy: -60, width: 70, height: 70, health: 8 + gamelevel, maxhealth: 8 + gamelevel, speed: 0.6, color: '#ff00ff', type: 'boss', score: 100, direction: 1, bosstimer: 0 }
      enemies.push(boss)
    } else {
      spawnenemy()
    }
    spawntimer = 0
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i]
    enemy.posy += enemy.speed
    if (enemy.type === 'fast') enemy.posx += Math.sin(enemy.posy * 0.05) * 2
    if (enemy.type === 'diver') {
      if (!enemy.diverdir || enemy.diverdir === 0) enemy.diverdir = Math.sign(player.posx - enemy.posx) * 0.8
      enemy.diverdir += Math.sign(player.posx - enemy.posx) * 0.05
      enemy.diverdir = Math.max(-2.5, Math.min(2.5, enemy.diverdir))
      enemy.posx += enemy.diverdir
      enemy.speed = Math.min(4, enemy.speed + 0.02)
    }
    if (enemy.type === 'turret') {
      enemy.turrettimer++
      enemy.posx += Math.sin(framecount * 0.03 + enemy.posx) * 0.5
      if (enemy.turrettimer % 50 === 0 && enemy.posy > 0) {
        enemies.push({ posx: enemy.posx, posy: enemy.posy + 16, width: 8, height: 8, health: 1, maxhealth: 1, speed: 3, color: '#ffaa44', type: 'tbullet', score: 0 })
        playsound(880, 0.04, 'square', 0.04)
      }
    }
    if (enemy.type === 'boss') {
      enemy.bosstimer = (enemy.bosstimer || 0) + 1
      enemy.posx += enemy.direction * 1.5
      if (enemy.posx > width - 60) enemy.direction = -1
      if (enemy.posx < 60) enemy.direction = 1
      if (enemy.posy < 80) enemy.posy += 0.3
      if (enemy.bosstimer % 30 === 0 && enemy.posy > 50) {
        const dx = player.posx - enemy.posx
        const dy = player.posy - enemy.posy
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        bossbullets.push({ posx: enemy.posx, posy: enemy.posy + 30, velx: (dx / dist) * 3, vely: (dy / dist) * 3, size: 5 })
      }
    }

    if (enemy.posy > height + 50 && enemy.type !== 'boss') { enemies.splice(i, 1); continue }
    if (enemy.type === 'boss' && (enemy.bosstimer || 0) > 900) { enemies.splice(i, 1); continue }

    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j]
      const dx = bullet.posx - enemy.posx
      const dy = bullet.posy - enemy.posy
      if (Math.abs(dx) < enemy.width / 2 && Math.abs(dy) < enemy.height / 2) {
        enemy.health--
        bullets.splice(j, 1)
        explode(bullet.posx, bullet.posy, '#ff0', 4)
        if (enemy.health <= 0) {
          playerscore += enemy.score * (1 + Math.floor(combocount / 5) * 0.5)
          combocount++
          combotimer = 90
          playexplodesound()
          if (enemy.type === 'boss') { playsound(80, 0.6, 'sawtooth', 0.15); playsound(60, 0.8, 'sawtooth', 0.1) }
          explode(enemy.posx, enemy.posy, enemy.color, 18)
          if (Math.random() < 0.15) spawnpowerup(enemy.posx, enemy.posy)
          enemies.splice(i, 1)
          gamelevel = Math.floor(playerscore / 150) + 1
        }
        break
      }
    }
  }

  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i]
    p.posy += p.vely
    p.timer++
    if (p.posy > height + 20) { powerups.splice(i, 1); continue }
    if (Math.abs(p.posx - player.posx) < 24 && Math.abs(p.posy - player.posy) < 24) {
      playpowerupsound()
      if (p.type === 'shield') { player.shield = true; player.shieldtimer = Math.min(600, player.shieldtimer + 200) }
      else if (p.type === 'rapidfire') { player.rapidfire = true; player.rapidfiretimer = Math.min(600, player.rapidfiretimer + 200) }
      else if (p.type === 'spread') { player.spread = true; player.spreadtimer = Math.min(600, player.spreadtimer + 200) }
      powerups.splice(i, 1)
      explode(p.posx, p.posy, '#fff', 8)
    }
  }

  if (player.shieldtimer > 0) { player.shieldtimer-- } else { player.shield = false }
  if (player.rapidfiretimer > 0) { player.rapidfiretimer-- } else { player.rapidfire = false }
  if (player.spreadtimer > 0) { player.spreadtimer-- } else { player.spread = false }
  if (combotimer > 0) { combotimer-- } else { combocount = 0 }

  for (let i = bossbullets.length - 1; i >= 0; i--) {
    const bb = bossbullets[i]
    bb.posx += bb.velx
    bb.posy += bb.vely
    if (bb.posy > height + 20 || bb.posx < -20 || bb.posx > width + 20) { bossbullets.splice(i, 1); continue }
    const bdx = bb.posx - player.posx
    const bdy = bb.posy - player.posy
    if (Math.sqrt(bdx * bdx + bdy * bdy) < 12) {
      if (player.shield) { player.shield = false; player.shieldtimer = 0; shake = 4; explode(player.posx, player.posy, '#4488ff', 10) }
      else { playerlives--; shake = 10; explode(player.posx, player.posy, '#ff0', 15); if (playerlives <= 0) { playgameoversound(); gamestate = 'gameover'; if (playerscore > bestscore) { bestscore = Math.floor(playerscore); localStorage.setItem('spacebest', bestscore.toString()) } } }
      bossbullets.splice(i, 1)
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i]
    const dx = enemy.posx - player.posx
    const dy = enemy.posy - player.posy
    if (Math.sqrt(dx * dx + dy * dy) < (enemy.width / 2 + player.size / 2)) {
      explode(enemy.posx, enemy.posy, '#ff0', 20)
      enemies.splice(i, 1)
      if (player.shield) {
        player.shield = false
        player.shieldtimer = 0
        shake = 4
      } else {
        playerlives--
        shake = 8
        if (playerlives <= 0) {
          playgameoversound()
          gamestate = 'gameover'
          if (playerscore > bestscore) {
            bestscore = Math.floor(playerscore)
            localStorage.setItem('spacebest', bestscore.toString())
          }
        }
      }
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.posx += p.velx
    p.posy += p.vely
    p.vely += 0.04
    p.life--
    if (p.life <= 0) particles.splice(i, 1)
  }

  if (shake > 0) shake *= 0.85
  if (shake < 0.1) shake = 0
}

function drawgameobjects() {
  for (const bullet of bullets) {
    context.save()
    context.fillStyle = '#00ffff'
    context.shadowColor = '#00ffff'
    context.shadowBlur = 10
    context.fillRect(bullet.posx - bullet.size / 2, bullet.posy - bullet.size * 2, bullet.size, bullet.size * 4)
    context.restore()
  }

  for (const enemy of enemies) {
    context.save()
    context.fillStyle = enemy.color
    context.shadowColor = enemy.color
    context.shadowBlur = 6
    if (enemy.type === 'basic') {
      context.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI / 5) - Math.PI / 2
        const ex = enemy.posx + (enemy.width / 2) * Math.cos(a)
        const ey = enemy.posy + (enemy.height / 2) * Math.sin(a)
        i === 0 ? context.moveTo(ex, ey) : context.lineTo(ex, ey)
      }
      context.closePath()
      context.fill()
    } else if (enemy.type === 'fast') {
      context.beginPath()
      context.moveTo(enemy.posx, enemy.posy - enemy.height / 2)
      context.lineTo(enemy.posx - enemy.width / 2, enemy.posy + enemy.height / 2)
      context.lineTo(enemy.posx + enemy.width / 2, enemy.posy + enemy.height / 2)
      context.closePath()
      context.fill()
    } else if (enemy.type === 'diver') {
      context.beginPath()
      context.moveTo(enemy.posx, enemy.posy - enemy.height / 2)
      context.lineTo(enemy.posx - enemy.width / 2, enemy.posy + enemy.height / 2)
      context.lineTo(enemy.posx, enemy.posy + enemy.height / 4)
      context.lineTo(enemy.posx + enemy.width / 2, enemy.posy + enemy.height / 2)
      context.closePath()
      context.fill()
    } else if (enemy.type === 'turret') {
      context.fillRect(enemy.posx - enemy.width / 2, enemy.posy - enemy.height / 2, enemy.width, enemy.height)
      context.fillStyle = '#ffcc66'
      context.fillRect(enemy.posx - enemy.width / 4, enemy.posy + enemy.height / 4, enemy.width / 2, enemy.height / 3)
    } else if (enemy.type === 'tbullet') {
      context.beginPath()
      context.arc(enemy.posx, enemy.posy, 4, 0, Math.PI * 2)
      context.fill()
    } else if (enemy.type === 'boss') {
      context.beginPath()
      const sides = 6
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 - Math.PI / 2
        const r = enemy.width / 2 * (s % 2 === 0 ? 1 : 0.6)
        const ex = enemy.posx + Math.cos(a) * r
        const ey = enemy.posy + Math.sin(a) * r
        s === 0 ? context.moveTo(ex, ey) : context.lineTo(ex, ey)
      }
      context.closePath()
      context.fill()
      context.fillStyle = '#ff0066'
      context.fillRect(enemy.posx - 8, enemy.posy - 3, 16, 6)
      context.fillRect(enemy.posx - 3, enemy.posy - 8, 6, 16)
    } else {
      context.fillRect(enemy.posx - enemy.width / 2, enemy.posy - enemy.height / 2, enemy.width, enemy.height)
    }
    if (enemy.maxhealth > 1) {
      const barwidth = enemy.width
      const barheight = 3
      context.shadowBlur = 0
      context.fillStyle = '#333'
      context.fillRect(enemy.posx - barwidth / 2, enemy.posy - enemy.height / 2 - 7, barwidth, barheight)
      context.fillStyle = enemy.health / enemy.maxhealth > 0.5 ? '#0f0' : '#f00'
      context.fillRect(enemy.posx - barwidth / 2, enemy.posy - enemy.height / 2 - 7, barwidth * enemy.health / enemy.maxhealth, barheight)
    }
    context.restore()
  }

  for (const bb of bossbullets) {
    context.save()
    context.fillStyle = '#ff00ff'
    context.shadowColor = '#ff00ff'
    context.shadowBlur = 12
    context.beginPath()
    context.arc(bb.posx, bb.posy, bb.size, 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  for (const p of powerups) {
    context.save()
    const glow = Math.sin(p.timer * 0.08) * 4 + 6
    const colors = { shield: '#4488ff', rapidfire: '#ff8800', spread: '#44ff44' }
    const color = colors[p.type] || '#fff'
    context.fillStyle = color
    context.shadowColor = color
    context.shadowBlur = glow + 10
    context.beginPath()
    context.moveTo(p.posx, p.posy - p.size)
    context.lineTo(p.posx + p.size, p.posy)
    context.lineTo(p.posx, p.posy + p.size)
    context.lineTo(p.posx - p.size, p.posy)
    context.closePath()
    context.fill()
    context.restore()
    context.save()
    context.fillStyle = '#fff'
    context.font = 'bold 11px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const symbols = { shield: 'S', rapidfire: 'R', spread: 'W' }
    context.fillText(symbols[p.type] || '?', p.posx, p.posy)
    context.restore()
  }

  context.save()
  const enginelen = player.size * 1.4
  context.fillStyle = '#ff6600'
  context.shadowColor = '#ff4400'
  context.shadowBlur = 18
  context.beginPath()
  context.moveTo(player.posx - 7, player.posy + player.size * 0.7)
  const flicker = Math.sin(framecount * 0.3) * 4 + 4
  context.lineTo(player.posx, player.posy + player.size * 0.7 + enginelen * 0.5 + flicker)
  context.lineTo(player.posx + 7, player.posy + player.size * 0.7)
  context.closePath()
  context.fill()
  context.shadowBlur = 0

  context.fillStyle = '#4488ff'
  context.shadowColor = '#4488ff'
  context.shadowBlur = 6
  context.beginPath()
  context.moveTo(player.posx, player.posy - player.size)
  context.lineTo(player.posx - player.size * 0.8, player.posy + player.size * 0.5)
  context.lineTo(player.posx - 4, player.posy + player.size * 0.3)
  context.lineTo(player.posx - 4, player.posy + player.size * 0.1)
  context.lineTo(player.posx + 4, player.posy + player.size * 0.1)
  context.lineTo(player.posx + 4, player.posy + player.size * 0.3)
  context.lineTo(player.posx + player.size * 0.8, player.posy + player.size * 0.5)
  context.closePath()
  context.fill()
  context.shadowBlur = 0

  context.fillStyle = '#aaddff'
  context.beginPath()
  context.arc(player.posx, player.posy - player.size * 0.3, 3.5, 0, Math.PI * 2)
  context.fill()
  context.restore()

  if (player.shield) {
    context.save()
    context.strokeStyle = 'rgba(68, 136, 255, 0.35)'
    context.lineWidth = 2
    context.shadowColor = '#4488ff'
    context.shadowBlur = 12
    context.beginPath()
    context.arc(player.posx, player.posy, player.size + 10, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  for (const p of particles) {
    context.save()
    const alpha = p.life / p.maxlife
    context.globalAlpha = alpha
    context.fillStyle = p.color
    context.fillRect(p.posx - p.size / 2, p.posy - p.size / 2, p.size, p.size)
    context.restore()
  }
}

function drawmenu() {
  context.save()
  const pulse = Math.sin(framecount * 0.04) * 0.15 + 0.75
  const shipy = height / 2 + Math.sin(framecount * 0.02) * 20

  context.fillStyle = '#e94560'
  context.shadowColor = '#e94560'
  context.shadowBlur = 30
  context.font = 'bold 52px monospace'
  context.textAlign = 'center'
  context.fillText('SPACE', width / 2, height / 3 - 10)
  context.shadowBlur = 0
  context.fillStyle = '#6c63ff'
  context.shadowColor = '#6c63ff'
  context.shadowBlur = 20
  context.font = 'bold 36px monospace'
  context.fillText('DEFENDER', width / 2, height / 3 + 50)
  context.shadowBlur = 0

  context.fillStyle = '#4488ff'
  context.shadowColor = '#4488ff'
  context.shadowBlur = 15
  context.beginPath()
  context.moveTo(width / 2, shipy - 20)
  context.lineTo(width / 2 - 14, shipy + 6)
  context.lineTo(width / 2 - 6, shipy + 2)
  context.lineTo(width / 2 - 6, shipy - 4)
  context.lineTo(width / 2 + 6, shipy - 4)
  context.lineTo(width / 2 + 6, shipy + 2)
  context.lineTo(width / 2 + 14, shipy + 6)
  context.closePath()
  context.fill()
  context.shadowBlur = 0

  context.fillStyle = '#ff6600'
  context.beginPath()
  context.moveTo(width / 2 - 6, shipy + 6)
  context.lineTo(width / 2, shipy + 6 + 8 + Math.sin(framecount * 0.3) * 4)
  context.lineTo(width / 2 + 6, shipy + 6)
  context.closePath()
  context.fill()

  context.fillStyle = `rgba(255,255,255,${pulse})`
  context.font = '18px monospace'
  context.fillText('tap or press space to start', width / 2, height / 2 + 100)
  context.fillStyle = 'rgba(255,255,255,0.4)'
  context.font = '16px monospace'
  context.fillText(`best score: ${bestscore}`, width / 2, height / 2 + 130)

  context.fillStyle = 'rgba(255,255,255,0.15)'
  context.font = '12px monospace'
  context.fillText('\u2190\u2191\u2192\u2193 / WASD move  |  auto-fire', width / 2, height / 2 + 165)
  context.fillText('P = pause  |  collect powerups to power up', width / 2, height / 2 + 183)
  context.restore()
}

function drawgameover() {
  context.save()
  context.fillStyle = 'rgba(0,0,0,0.75)'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#e94560'
  context.shadowColor = '#e94560'
  context.shadowBlur = 20
  context.font = 'bold 44px monospace'
  context.textAlign = 'center'
  context.fillText('GAME OVER', width / 2, height / 2 - 50)
  context.shadowBlur = 0
  context.fillStyle = '#ffffff'
  context.font = '26px monospace'
  context.fillText(`score: ${Math.floor(playerscore)}`, width / 2, height / 2 + 10)
  context.fillStyle = '#ffd700'
  context.fillText(`best: ${bestscore}`, width / 2, height / 2 + 50)
  context.fillStyle = 'rgba(255,255,255,0.5)'
  context.font = '16px monospace'
  context.fillText('press space to restart', width / 2, height / 2 + 100)
  context.restore()
}

function drawui() {
  context.save()
  context.fillStyle = '#ffffff'
  context.font = '18px monospace'
  context.textAlign = 'left'
  context.fillText(`score: ${Math.floor(playerscore)}`, 15, 30)

  if (combocount >= 3) {
    context.fillStyle = '#ffd700'
    context.font = '14px monospace'
    context.fillText(`x${combocount} combo`, 15, 50)
  }

  context.textAlign = 'right'
  context.fillStyle = '#6c63ff'
  context.font = '16px monospace'
  context.fillText(`level ${gamelevel}`, width - 15, 30)

  let powery = 28
  context.textAlign = 'center'
  context.font = '13px monospace'
  if (player.shield) { context.fillStyle = '#4488ff'; context.fillText(`shield ${Math.ceil(player.shieldtimer / 60)}s`, width / 2, powery); powery += 18 }
  if (player.rapidfire) { context.fillStyle = '#ff8800'; context.fillText(`rapid ${Math.ceil(player.rapidfiretimer / 60)}s`, width / 2, powery); powery += 18 }
  if (player.spread) { context.fillStyle = '#44ff44'; context.fillText(`spread ${Math.ceil(player.spreadtimer / 60)}s`, width / 2, powery) }

  let livesstr = ''
  for (let i = 0; i < playerlives; i++) livesstr += '\u2764 '
  context.textAlign = 'left'
  context.font = '20px monospace'
  context.fillStyle = '#e94560'
  context.fillText(livesstr.trim(), 15, height - 15)
  context.restore()
}

function drawgame() {
  context.fillStyle = '#0a0a1a'
  context.fillRect(0, 0, width, height)

  for (const n of nebulae) {
    n.posy += n.speed
    if (n.posy > height + n.radius) { n.posy = -n.radius; n.posx = Math.random() * width }
    const grad = context.createRadialGradient(n.posx, n.posy, 0, n.posx, n.posy, n.radius)
    grad.addColorStop(0, n.color)
    grad.addColorStop(1, 'transparent')
    context.fillStyle = grad
    context.fillRect(0, 0, width, height)
  }

  for (const star of stars) {
    const alpha = star.bright * (0.5 + 0.5 * Math.sin(framecount * 0.015 + star.posx))
    context.fillStyle = `rgba(255,255,255,${alpha})`
    context.fillRect(star.posx, star.posy, star.size, star.size)
  }

  if (gamestate === 'menu') { drawmenu(); return }

  context.save()
  if (shake > 0.5) {
    context.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)
  }

  drawgameobjects()
  drawui()
  context.restore()

  if (gamestate === 'gameover') drawgameover()
  if (flash > 0) {
    flash--
    context.save()
    context.fillStyle = `rgba(255,255,255,${flash / 20})`
    context.fillRect(0, 0, width, height)
    context.restore()
  }
  if (ispaused && gamestate === 'playing') {
    context.save()
    context.fillStyle = 'rgba(0,0,0,0.5)'
    context.fillRect(0, 0, width, height)
    const ppulse = Math.sin(framecount * 0.05) * 0.2 + 0.6
    context.fillStyle = `rgba(255,255,255,${ppulse})`
    context.font = 'bold 36px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('PAUSED', width / 2, height / 2)
    context.restore()
  }
}

function resetgame() {
  bullets = []
  enemies = []
  particles = []
  powerups = []
  bossbullets = []
  ispaused = false
  bosscount = 0
  playerscore = 0
  playerlives = 3
  gamelevel = 1
  combocount = 0
  combotimer = 0
  shoottimer = 0
  spawntimer = 0
  shake = 0
  player.posx = width / 2
  player.posy = height - 60
  resetpowerups()
}

function startgame() {
  resetgame()
  gamestate = 'playing'
  flash = 0
}

const touchid = { move: null, fire: null }
canvas.addEventListener('touchstart', (event) => {
  event.preventDefault()
  if (audioctx.state === 'suspended') audioctx.resume()
  if (gamestate === 'menu') { startgame(); return }
  if (gamestate === 'gameover') { startgame(); return }
  for (const touch of event.changedTouches) {
    const r = canvas.getBoundingClientRect()
    const cx = (touch.clientX - r.left) / r.width * width
    if (cx < width / 2) {
      touchid.move = touch.identifier
      touchmove = { x: cx, y: (touch.clientY - r.top) / r.height * height }
    } else {
      touchid.fire = touch.identifier
      touchfire = true
    }
  }
})
canvas.addEventListener('touchmove', (event) => {
  event.preventDefault()
  for (const touch of event.changedTouches) {
    if (touch.identifier === touchid.move) {
      const r = canvas.getBoundingClientRect()
      touchmove = { x: (touch.clientX - r.left) / r.width * width, y: (touch.clientY - r.top) / r.height * height }
    }
  }
})
canvas.addEventListener('touchend', (event) => {
  event.preventDefault()
  for (const touch of event.changedTouches) {
    if (touch.identifier === touchid.move) { touchid.move = null; touchmove = null }
    if (touch.identifier === touchid.fire) { touchid.fire = null; touchfire = false }
  }
})
canvas.addEventListener('mousedown', (event) => {
  if (audioctx.state === 'suspended') audioctx.resume()
  if (gamestate === 'menu') { startgame(); return }
  if (gamestate === 'gameover') { startgame(); return }
  const r = canvas.getBoundingClientRect()
  const cx = (event.clientX - r.left) / r.width * width
  if (cx < width / 2) {
    touchmove = { x: cx, y: (event.clientY - r.top) / r.height * height }
  } else {
    touchfire = true
  }
})
canvas.addEventListener('mousemove', (event) => {
  if (touchmove && event.buttons & 1) {
    const r = canvas.getBoundingClientRect()
    touchmove = { x: (event.clientX - r.left) / r.width * width, y: (event.clientY - r.top) / r.height * height }
  }
})
canvas.addEventListener('mouseup', () => {
  touchmove = null
  touchfire = false
})

function gameloop() {
  updategame()
  drawgame()
  requestAnimationFrame(gameloop)
}

document.addEventListener('keydown', (event) => {
  keys[event.code] = true
  if (event.code === 'Space' || event.code === 'Enter') {
    if (gamestate === 'menu') { if (audioctx.state === 'suspended') audioctx.resume(); startgame() }
    else if (gamestate === 'gameover') startgame()
  }
  if (event.code === 'KeyP' && gamestate === 'playing') ispaused = !ispaused
})

document.addEventListener('keyup', (event) => {
  keys[event.code] = false
})

initstars()
drawgame()
gameloop()
