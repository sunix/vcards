import './style.css'
import { Html5Qrcode } from 'html5-qrcode'
import zipcelx from 'zipcelx'
import { CONTACT_COLUMNS, parseVCard } from './vcard'

const STORAGE_KEY = 'vcards.contacts.v1'

const state = {
  contacts: [],
  pendingContact: null,
  scanner: null,
  scanning: false,
}

const app = document.querySelector('#app')
app.innerHTML = `
  <main class="container">
    <h1>Scan vCard QR</h1>
    <p class="privacy">Les contacts sont stockés localement dans ce navigateur. Aucune donnée n’est envoyée à un serveur.</p>

    <section class="card controls">
      <button id="scan-toggle" type="button">Lancer le scan</button>
      <p id="scan-status" class="status" role="status">Prêt à scanner.</p>
      <div id="reader" class="reader" aria-live="polite"></div>
    </section>

    <section class="card">
      <h2>Dernier scan</h2>
      <div id="last-scan" class="empty">Aucun contact scanné.</div>
      <button id="add-contact" type="button" disabled>Ajouter le contact</button>
    </section>

    <section class="card">
      <div class="actions">
        <h2>Contacts (<span id="contact-count">0</span>)</h2>
        <div class="buttons-inline">
          <button id="export-csv" type="button">Exporter CSV</button>
          <button id="export-xlsx" type="button">Exporter Excel</button>
          <button id="clear-all" type="button" class="danger">Vider la liste</button>
        </div>
      </div>
      <ul id="contact-list" class="contact-list"></ul>
    </section>
  </main>
`

const scanStatus = document.querySelector('#scan-status')
const scanToggle = document.querySelector('#scan-toggle')
const addContactButton = document.querySelector('#add-contact')
const lastScan = document.querySelector('#last-scan')
const contactList = document.querySelector('#contact-list')
const contactCount = document.querySelector('#contact-count')
const exportCsvButton = document.querySelector('#export-csv')
const exportXlsxButton = document.querySelector('#export-xlsx')
const clearAllButton = document.querySelector('#clear-all')

function updateStatus(message, isError = false) {
  scanStatus.textContent = message
  scanStatus.classList.toggle('error', isError)
}

function loadContacts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveContacts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.contacts))
}

function normalizeEmail(value) {
  return value
    .split('|')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function normalizePhone(value) {
  return value
    .split('|')
    .map((part) => part.replace(/[^\d+]/g, ''))
    .filter(Boolean)
}

function isDuplicate(contact) {
  const contactEmails = normalizeEmail(contact.email || '')
  const contactPhones = normalizePhone(contact.phone || '')
  const fullName = (contact.fullName || '').trim().toLowerCase()

  return state.contacts.some((existing) => {
    const sameEmail = contactEmails.some((email) => normalizeEmail(existing.email || '').includes(email))
    const samePhone = contactPhones.some((phone) => normalizePhone(existing.phone || '').includes(phone))
    const sameName = fullName && fullName === (existing.fullName || '').trim().toLowerCase()
    return sameEmail || samePhone || sameName
  })
}

function escapeCsv(value) {
  const safe = String(value ?? '')
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

function downloadBlob(content, mimeType, fileName) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function renderLastScan() {
  if (!state.pendingContact) {
    lastScan.className = 'empty'
    lastScan.textContent = 'Aucun contact scanné.'
    addContactButton.disabled = true
    return
  }

  lastScan.className = 'details'
  lastScan.innerHTML = CONTACT_COLUMNS.map((column) => {
    const value = state.pendingContact[column] || '—'
    return `<p><strong>${column}</strong>: ${value}</p>`
  }).join('')
  addContactButton.disabled = false
}

function renderContacts() {
  contactCount.textContent = String(state.contacts.length)

  if (!state.contacts.length) {
    contactList.innerHTML = '<li class="empty">Aucun contact enregistré.</li>'
    return
  }

  contactList.innerHTML = state.contacts
    .map(
      (contact) => `
      <li class="contact-item">
        <div class="contact-content">
          <p class="name">${contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Sans nom'}</p>
          <p>${contact.organization || '—'}</p>
          <p>${contact.email || '—'}</p>
          <p>${contact.phone || '—'}</p>
        </div>
        <button type="button" class="danger delete-contact" data-id="${contact.id}">Supprimer</button>
      </li>
    `,
    )
    .join('')
}

async function stopScanner() {
  if (!state.scanner || !state.scanning) return
  await state.scanner.stop()
  await state.scanner.clear()
  state.scanning = false
  scanToggle.textContent = 'Lancer le scan'
}

async function handleScanSuccess(decodedText) {
  try {
    const contact = parseVCard(decodedText)
    state.pendingContact = contact
    renderLastScan()
    updateStatus('vCard détectée. Vérifiez puis ajoutez le contact.')
    await stopScanner()
  } catch (error) {
    updateStatus(error.message || 'Le QR code ne contient pas une vCard valide.', true)
  }
}

function handleScanError() {
}

async function startScanner() {
  if (!('mediaDevices' in navigator) || typeof Html5Qrcode === 'undefined') {
    updateStatus('Navigateur non compatible avec le scan caméra.', true)
    return
  }

  state.scanner = new Html5Qrcode('reader')

  try {
    const cameras = await Html5Qrcode.getCameras()
    if (!cameras.length) {
      updateStatus('Aucune caméra disponible sur cet appareil.', true)
      return
    }

    await state.scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      handleScanSuccess,
      handleScanError,
    )

    state.scanning = true
    scanToggle.textContent = 'Arrêter le scan'
    updateStatus('Scan en cours…')
  } catch (error) {
    const message = String(error?.message || error)

    if (message.toLowerCase().includes('permission')) {
      updateStatus('Autorisation caméra refusée. Activez-la dans le navigateur.', true)
      return
    }

    if (message.toLowerCase().includes('https')) {
      updateStatus('Le scan caméra nécessite un contexte sécurisé (HTTPS).', true)
      return
    }

    updateStatus('Impossible de démarrer la caméra sur ce navigateur.', true)
  }
}

scanToggle.addEventListener('click', async () => {
  if (state.scanning) {
    await stopScanner()
    updateStatus('Scan arrêté.')
    return
  }

  await startScanner()
})

addContactButton.addEventListener('click', () => {
  if (!state.pendingContact) return

  if (isDuplicate(state.pendingContact)) {
    updateStatus('Ce contact semble déjà enregistré.', true)
    return
  }

  state.contacts.unshift({
    id: crypto.randomUUID(),
    ...state.pendingContact,
    createdAt: new Date().toISOString(),
  })

  saveContacts()
  state.pendingContact = null
  renderLastScan()
  renderContacts()
  updateStatus('Contact ajouté localement.')
})

contactList.addEventListener('click', (event) => {
  const button = event.target.closest('.delete-contact')
  if (!button) return

  const contactId = button.getAttribute('data-id')
  state.contacts = state.contacts.filter((contact) => contact.id !== contactId)
  saveContacts()
  renderContacts()
})

clearAllButton.addEventListener('click', () => {
  if (!state.contacts.length) return

  const confirmed = window.confirm('Supprimer tous les contacts enregistrés ?')
  if (!confirmed) return

  state.contacts = []
  saveContacts()
  renderContacts()
  updateStatus('Tous les contacts ont été supprimés.')
})

exportCsvButton.addEventListener('click', () => {
  if (!state.contacts.length) {
    updateStatus('Aucun contact à exporter.', true)
    return
  }

  const header = CONTACT_COLUMNS.join(',')
  const rows = state.contacts.map((contact) => CONTACT_COLUMNS.map((column) => escapeCsv(contact[column] || '')).join(','))
  const csvContent = [header, ...rows].join('\n')
  downloadBlob(csvContent, 'text/csv;charset=utf-8', `contacts-${new Date().toISOString().slice(0, 10)}.csv`)
})

exportXlsxButton.addEventListener('click', () => {
  if (!state.contacts.length) {
    updateStatus('Aucun contact à exporter.', true)
    return
  }

  const data = [
    CONTACT_COLUMNS.map((column) => ({ value: column, type: 'string' })),
    ...state.contacts.map((contact) => CONTACT_COLUMNS.map((column) => ({ value: contact[column] || '', type: 'string' }))),
  ]

  zipcelx({
    filename: `contacts-${new Date().toISOString().slice(0, 10)}`,
    sheet: {
      data,
    },
  })
})

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const base = import.meta.env.BASE_URL
      await navigator.serviceWorker.register(`${base}sw.js`)
    } catch {}
  })
}

state.contacts = loadContacts()
renderLastScan()
renderContacts()
registerServiceWorker()
