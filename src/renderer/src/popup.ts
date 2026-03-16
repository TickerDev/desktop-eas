import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './popup-styles.css'

interface TtsSettings {
  enabled: boolean
  voice: string
  rate: number
  pitch: number
  volume: number
}

declare global {
  interface Window {
    popupAPI: {
      getData: () => Promise<{ alert: any; volume: number; tts: TtsSettings }>
      dismiss: () => void
      finished: () => void
      resize: (height: number) => void
      showCaption: () => Promise<void>
      sendCaptionText: (text: string) => void
      clearCaption: () => void
      closeCaption: () => void
      getAlertSoundUrl: () => string
    }
  }
}

interface AlertArea {
  type: string
  value: any
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch {
    return iso
  }
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'Extreme': return '#dc2626'
    case 'Severe': return '#ea580c'
    case 'Moderate': return '#ca8a04'
    case 'Minor': return '#2563eb'
    default: return '#6b7280'
  }
}

function getTextByType(texts: any[], type: string, lang = 'English'): string | null {
  const t = texts.find((t: any) => t.type === type && t.language === lang)
  return t ? t.value : null
}

function getAreaDescription(areas: AlertArea[]): string {
  const desc = areas.find((a) => a.type === 'area_description')
  return desc ? String(desc.value) : 'Unknown area'
}

// Circle parser (same as alert-detail.ts)
function parseCircle(value: any): { center: [number, number]; radiusMeters: number } | null {
  if (typeof value === 'string') {
    const m = value.match(/^\s*([-\d.]+)\s*,\s*([-\d.]+)\s+([-\d.]+)\s*$/)
    if (m) {
      const lat = parseFloat(m[1]), lng = parseFloat(m[2]), r = parseFloat(m[3])
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(r)) return { center: [lat, lng], radiusMeters: r * 1000 }
    }
    const s = value.match(/^\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*$/)
    if (s) {
      const lat = parseFloat(s[1]), lng = parseFloat(s[2]), r = parseFloat(s[3])
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(r)) return { center: [lat, lng], radiusMeters: r * 1000 }
    }
  }
  if (Array.isArray(value) && value.length === 3 && value.every((v: any) => typeof v === 'number')) {
    return { center: [value[0], value[1]], radiusMeters: value[2] * 1000 }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.center && typeof value.center === 'object') {
      const lat = value.center.lat ?? value.center.latitude
      const lng = value.center.lng ?? value.center.lon ?? value.center.longitude
      const r = value.radius ?? value.radius_km
      if (typeof lat === 'number' && typeof lng === 'number' && typeof r === 'number')
        return { center: [lat, lng], radiusMeters: r * 1000 }
    }
    const lat = value.lat ?? value.latitude
    const lng = value.lng ?? value.lon ?? value.longitude
    const r = value.radius ?? value.radius_km
    if (typeof lat === 'number' && typeof lng === 'number' && typeof r === 'number')
      return { center: [lat, lng], radiusMeters: r * 1000 }
  }
  return null
}

async function geocodeDescription(description: string): Promise<[number, number] | null> {
  try {
    const q = encodeURIComponent(description.split(';')[0].trim())
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=us`,
      { headers: { 'User-Agent': 'EASViewer/1.0' } }
    )
    const results = await resp.json()
    if (results.length > 0) return [parseFloat(results[0].lat), parseFloat(results[0].lon)]
  } catch { /* ignore */ }
  return null
}

function renderAlert(alert: any): void {
  const severity = alert.severity || 'Unknown'
  const color = getSeverityColor(severity)
  const areas: AlertArea[] = alert.areas || []
  const texts = alert.texts || []

  // Header
  const badge = document.getElementById('popup-severity-badge')!
  badge.textContent = severity
  badge.style.background = color

  document.getElementById('popup-event')!.textContent = alert.event || 'Emergency Alert'

  // Area
  document.getElementById('popup-area')!.innerHTML =
    `<span class="popup-label">AREA</span> ${escapeHtml(getAreaDescription(areas))}`

  // Meta row
  const meta = document.getElementById('popup-meta')!
  meta.innerHTML = `
    <div class="popup-meta-item">
      <span class="popup-label">SENDER</span>
      <span>${escapeHtml(alert.sender || 'Unknown')}</span>
    </div>
    <div class="popup-meta-item">
      <span class="popup-label">URGENCY</span>
      <span>${escapeHtml(alert.urgency || 'Unknown')}</span>
    </div>
    <div class="popup-meta-item">
      <span class="popup-label">EXPIRES</span>
      <span>${formatTime(alert.expires)}</span>
    </div>
  `

  // Instruction
  const instruction = getTextByType(texts, 'cmac_short_text') ||
    getTextByType(texts, 'cap_instruction')
  const instrEl = document.getElementById('popup-instruction')!
  if (instruction) {
    instrEl.textContent = instruction
    instrEl.style.display = 'block'
  } else {
    instrEl.style.display = 'none'
  }

  // Map
  initMap(areas, color)
}

async function initMap(areas: AlertArea[], color: string): Promise<void> {
  const mapEl = document.getElementById('popup-map')!

  const map = L.map('popup-map', {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(map)

  const allBounds: L.LatLngBounds[] = []

  // Draw polygons
  for (const area of areas) {
    if (area.type === 'polygon' && Array.isArray(area.value)) {
      const latLngs: L.LatLngTuple[] = area.value.map(
        ([lat, lng]: [number, number]) => [lat, lng] as L.LatLngTuple
      )
      const polygon = L.polygon(latLngs, {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.3
      }).addTo(map)
      allBounds.push(polygon.getBounds())
    } else if (area.type === 'circle') {
      const circle = parseCircle(area.value)
      if (circle) {
        const circleBounds = L.latLng(circle.center).toBounds(circle.radiusMeters * 2)
        allBounds.push(circleBounds)
        L.circle(circle.center, {
          radius: circle.radiusMeters,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.3
        }).addTo(map)
      }
    }
  }

  if (allBounds.length > 0) {
    let combined = allBounds[0]
    for (let i = 1; i < allBounds.length; i++) {
      combined = combined.extend(allBounds[i])
    }
    map.fitBounds(combined, { padding: [20, 20] })
  } else {
    // Geocode fallback
    const desc = getAreaDescription(areas)
    const coords = await geocodeDescription(desc)
    if (coords) {
      map.setView(coords, 9)
      L.circleMarker(coords, {
        radius: 8, color, fillColor: color, fillOpacity: 0.5, weight: 2
      }).addTo(map)
    } else {
      map.setView([39.8, -98.5], 4)
    }
  }

  setTimeout(() => map.invalidateSize(), 50)
}

function playAlertSound(volume: number): Promise<void> {
  return new Promise((resolve) => {
    if (volume <= 0) { resolve(); return }
    const url = window.popupAPI.getAlertSoundUrl()
    const audio = new Audio(url)
    audio.volume = volume / 100
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  })
}

function cleanTextForTts(raw: string): string {
  return raw
    // Remove the short code at the start (e.g. "TORPAH", "TORILX") — all-caps word on its own line
    .replace(/^[A-Z]{4,}\s*/m, '')
    // Remove bullet markers
    .replace(/^\s*\*\s*/gm, '')
    // Expand common time patterns: "815 PM CDT" -> "8:15 PM CDT"
    .replace(/\b(\d{1,2})(\d{2})\s*(AM|PM)\b/gi, '$1:$2 $3')
    // Expand common abbreviations that TTS stumbles on
    .replace(/\bNWS\b/g, 'National Weather Service')
    .replace(/\bCDT\b/g, 'Central Daylight Time')
    .replace(/\bCST\b/g, 'Central Standard Time')
    .replace(/\bEDT\b/g, 'Eastern Daylight Time')
    .replace(/\bEST\b/g, 'Eastern Standard Time')
    .replace(/\bMDT\b/g, 'Mountain Daylight Time')
    .replace(/\bMST\b/g, 'Mountain Standard Time')
    .replace(/\bPDT\b/g, 'Pacific Daylight Time')
    .replace(/\bPST\b/g, 'Pacific Standard Time')
    .replace(/\bmph\b/gi, 'miles per hour')
    // "Mile Markers 6 and 16" is fine, but "Mile Marker" alone is ok
    // Expand state abbreviations in context like "County in western KY"
    .replace(/\bAL\b(?=[\s,.])/g, 'Alabama').replace(/\bAK\b(?=[\s,.])/g, 'Alaska')
    .replace(/\bAZ\b(?=[\s,.])/g, 'Arizona').replace(/\bAR\b(?=[\s,.])/g, 'Arkansas')
    .replace(/\bCA\b(?=[\s,.])/g, 'California').replace(/\bCO\b(?=[\s,.])/g, 'Colorado')
    .replace(/\bCT\b(?=[\s,.])/g, 'Connecticut').replace(/\bDE\b(?=[\s,.])/g, 'Delaware')
    .replace(/\bFL\b(?=[\s,.])/g, 'Florida').replace(/\bGA\b(?=[\s,.])/g, 'Georgia')
    .replace(/\bHI\b(?=[\s,.])/g, 'Hawaii').replace(/\bID\b(?=[\s,.])/g, 'Idaho')
    .replace(/\bIL\b(?=[\s,.])/g, 'Illinois').replace(/\bIN\b(?=[\s,.])/g, 'Indiana')
    .replace(/\bIA\b(?=[\s,.])/g, 'Iowa').replace(/\bKS\b(?=[\s,.])/g, 'Kansas')
    .replace(/\bKY\b(?=[\s,.])/g, 'Kentucky').replace(/\bLA\b(?=[\s,.])/g, 'Louisiana')
    .replace(/\bME\b(?=[\s,.])/g, 'Maine').replace(/\bMD\b(?=[\s,.])/g, 'Maryland')
    .replace(/\bMA\b(?=[\s,.])/g, 'Massachusetts').replace(/\bMI\b(?=[\s,.])/g, 'Michigan')
    .replace(/\bMN\b(?=[\s,.])/g, 'Minnesota').replace(/\bMS\b(?=[\s,.])/g, 'Mississippi')
    .replace(/\bMO\b(?=[\s,.])/g, 'Missouri').replace(/\bMT\b(?=[\s,.])/g, 'Montana')
    .replace(/\bNE\b(?=[\s,.])/g, 'Nebraska').replace(/\bNV\b(?=[\s,.])/g, 'Nevada')
    .replace(/\bNH\b(?=[\s,.])/g, 'New Hampshire').replace(/\bNJ\b(?=[\s,.])/g, 'New Jersey')
    .replace(/\bNM\b(?=[\s,.])/g, 'New Mexico').replace(/\bNY\b(?=[\s,.])/g, 'New York')
    .replace(/\bNC\b(?=[\s,.])/g, 'North Carolina').replace(/\bND\b(?=[\s,.])/g, 'North Dakota')
    .replace(/\bOH\b(?=[\s,.])/g, 'Ohio').replace(/\bOK\b(?=[\s,.])/g, 'Oklahoma')
    .replace(/\bOR\b(?=[\s,.])/g, 'Oregon').replace(/\bPA\b(?=[\s,.])/g, 'Pennsylvania')
    .replace(/\bRI\b(?=[\s,.])/g, 'Rhode Island').replace(/\bSC\b(?=[\s,.])/g, 'South Carolina')
    .replace(/\bSD\b(?=[\s,.])/g, 'South Dakota').replace(/\bTN\b(?=[\s,.])/g, 'Tennessee')
    .replace(/\bTX\b(?=[\s,.])/g, 'Texas').replace(/\bUT\b(?=[\s,.])/g, 'Utah')
    .replace(/\bVT\b(?=[\s,.])/g, 'Vermont').replace(/\bVA\b(?=[\s,.])/g, 'Virginia')
    .replace(/\bWA\b(?=[\s,.])/g, 'Washington').replace(/\bWV\b(?=[\s,.])/g, 'West Virginia')
    .replace(/\bWI\b(?=[\s,.])/g, 'Wisconsin').replace(/\bWY\b(?=[\s,.])/g, 'Wyoming')
    // Replace ellipsis dots with comma pause
    .replace(/\.{2,}/g, ',')
    // Remove standalone dashes/underscores used as separators
    .replace(/^[\s\-_=]+$/gm, '')
    // Collapse multiple newlines into a single pause
    .replace(/\n{2,}/g, '. ')
    // Replace single newlines with space
    .replace(/\n/g, ' ')
    // Remove any remaining special chars that aren't punctuation or alphanumeric
    .replace(/[^\w\s.,;:!?'"\-()/%°]/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function getVoicesReady(): Promise<SpeechSynthesisVoice[]> {
  const voices = speechSynthesis.getVoices()
  if (voices.length > 0) return Promise.resolve(voices)
  return new Promise((resolve) => {
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices())
    // Fallback if event never fires
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000)
  })
}

async function speakDescription(alert: any, tts: TtsSettings): Promise<void> {
  if (!tts?.enabled) return

  const texts = alert.texts || []
  const desc = getTextByType(texts, 'cap_description')
  if (!desc) return

  const cleaned = cleanTextForTts(desc)
  if (!cleaned) return

  // Show caption window before speaking
  await window.popupAPI.showCaption()

  const utter = new SpeechSynthesisUtterance(cleaned)
  utter.rate = tts.rate ?? 1.0
  utter.pitch = tts.pitch ?? 1.0
  utter.volume = (tts.volume ?? 80) / 100

  if (tts.voice) {
    const voices = await getVoicesReady()
    const v = voices.find((v) => v.name === tts.voice)
    if (v) utter.voice = v
  }

  // Pre-split text into caption lines (~60 chars max, break at word boundaries)
  const MAX_LINE = 60
  const allWords = cleaned.split(/\s+/)
  const lines: { text: string; startChar: number }[] = []
  let line = ''
  let lineStart = 0
  let charPos = 0

  for (const word of allWords) {
    const wordStart = cleaned.indexOf(word, charPos)
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > MAX_LINE && line) {
      lines.push({ text: line, startChar: lineStart })
      line = word
      lineStart = wordStart
    } else {
      if (!line) lineStart = wordStart
      line = candidate
    }
    charPos = wordStart + word.length
  }
  if (line) lines.push({ text: line, startChar: lineStart })

  let currentLineIdx = 0
  if (lines.length > 0) {
    window.popupAPI.sendCaptionText(lines[0].text)
  }

  utter.onboundary = (e) => {
    if (e.name === 'word' || e.name === 'sentence') {
      // Advance to the next line when TTS passes its start position
      for (let i = currentLineIdx + 1; i < lines.length; i++) {
        if (e.charIndex >= lines[i].startChar) {
          currentLineIdx = i
          window.popupAPI.sendCaptionText(lines[i].text)
        } else {
          break
        }
      }
    }
  }

  utter.onend = () => {
    window.popupAPI.clearCaption()
    setTimeout(() => window.popupAPI.closeCaption(), 500)
    window.popupAPI.finished()
  }

  utter.onerror = () => {
    window.popupAPI.clearCaption()
    window.popupAPI.closeCaption()
    window.popupAPI.finished()
  }

  speechSynthesis.speak(utter)
}

// Dismiss button — also stop TTS and captions
document.getElementById('popup-dismiss')!.addEventListener('click', () => {
  speechSynthesis.cancel()
  window.popupAPI.closeCaption()
  window.popupAPI.dismiss()
})

// Pull alert data from main process when ready
async function initPopup(): Promise<void> {
  const data = await window.popupAPI.getData()
  if (!data) return
  renderAlert(data.alert)

  // Resize window to fit all content
  requestAnimationFrame(() => {
    const height = document.getElementById('popup')!.scrollHeight
    window.popupAPI.resize(height)
  })

  await playAlertSound(data.volume)

  // speakDescription signals finished via onend/onerror
  // If TTS is disabled, signal finished immediately after sound
  if (!data.tts?.enabled) {
    window.popupAPI.finished()
  } else {
    speakDescription(data.alert, data.tts)
  }
}

initPopup()
