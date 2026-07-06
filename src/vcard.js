const VCARD_REQUIRED = ['BEGIN:VCARD', 'END:VCARD']
const VCARD_VERSION = ['VERSION:3.0', 'VERSION:4.0']

function unfoldVCard(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

function unescapeVCard(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function parseAddress(rawAddress) {
  const parts = rawAddress
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
  return parts.join(', ')
}

function parseName(rawName) {
  const parts = rawName.split(';')
  return {
    lastName: (parts[0] || '').trim(),
    firstName: (parts[1] || '').trim(),
  }
}

export function parseVCard(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('QR code vide ou invalide.')
  }

  const normalizedText = unfoldVCard(rawText).trim()
  const upperText = normalizedText.toUpperCase()

  if (!VCARD_REQUIRED.every((token) => upperText.includes(token))) {
    throw new Error('Le QR code ne contient pas une vCard valide.')
  }

  if (!VCARD_VERSION.some((version) => upperText.includes(version))) {
    throw new Error('Version vCard non supportée (3.0 ou 4.0 attendue).')
  }

  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean)
  const fields = {
    firstName: '',
    lastName: '',
    fullName: '',
    organization: '',
    title: '',
    email: [],
    phone: [],
    address: [],
    url: [],
    note: [],
  }

  for (const line of lines) {
    const separator = line.indexOf(':')
    if (separator <= 0) {
      continue
    }

    const keyWithMeta = line.slice(0, separator)
    const value = unescapeVCard(line.slice(separator + 1))
    const key = keyWithMeta.split(';')[0].toUpperCase()

    if (!value) {
      continue
    }

    switch (key) {
      case 'FN':
        fields.fullName = value
        break
      case 'N': {
        const parsedName = parseName(value)
        if (!fields.firstName) fields.firstName = parsedName.firstName
        if (!fields.lastName) fields.lastName = parsedName.lastName
        break
      }
      case 'ORG':
        fields.organization = value.replace(/;/g, ' ').trim()
        break
      case 'TITLE':
        fields.title = value
        break
      case 'EMAIL':
        fields.email.push(value)
        break
      case 'TEL':
        fields.phone.push(value)
        break
      case 'ADR': {
        const address = parseAddress(value)
        if (address) fields.address.push(address)
        break
      }
      case 'URL':
        fields.url.push(value)
        break
      case 'NOTE':
        fields.note.push(value)
        break
      default:
        break
    }
  }

  if (!fields.fullName) {
    fields.fullName = [fields.firstName, fields.lastName].filter(Boolean).join(' ').trim()
  }

  if (!fields.fullName && !fields.email.length && !fields.phone.length) {
    throw new Error('vCard invalide : aucun champ contact exploitable trouvé.')
  }

  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    fullName: fields.fullName,
    organization: fields.organization,
    title: fields.title,
    email: fields.email.join(' | '),
    phone: fields.phone.join(' | '),
    address: fields.address.join(' | '),
    url: fields.url.join(' | '),
    note: fields.note.join(' | '),
  }
}

export const CONTACT_COLUMNS = [
  'firstName',
  'lastName',
  'fullName',
  'organization',
  'title',
  'email',
  'phone',
  'address',
  'url',
  'note',
]
