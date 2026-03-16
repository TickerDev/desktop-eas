interface UserLocation {
  name: string
  lat: number
  lng: number
  stateFips?: string
}

// US state name/abbrev to FIPS code
const STATE_FIPS: Record<string, string> = {
  'alabama': '01', 'al': '01', 'alaska': '02', 'ak': '02', 'arizona': '04', 'az': '04',
  'arkansas': '05', 'ar': '05', 'california': '06', 'ca': '06', 'colorado': '08', 'co': '08',
  'connecticut': '09', 'ct': '09', 'delaware': '10', 'de': '10', 'florida': '12', 'fl': '12',
  'georgia': '13', 'ga': '13', 'hawaii': '15', 'hi': '15', 'idaho': '16', 'id': '16',
  'illinois': '17', 'il': '17', 'indiana': '18', 'in': '18', 'iowa': '19', 'ia': '19',
  'kansas': '20', 'ks': '20', 'kentucky': '21', 'ky': '21', 'louisiana': '22', 'la': '22',
  'maine': '23', 'me': '23', 'maryland': '24', 'md': '24', 'massachusetts': '25', 'ma': '25',
  'michigan': '26', 'mi': '26', 'minnesota': '27', 'mn': '27', 'mississippi': '28', 'ms': '28',
  'missouri': '29', 'mo': '29', 'montana': '30', 'mt': '30', 'nebraska': '31', 'ne': '31',
  'nevada': '32', 'nv': '32', 'new hampshire': '33', 'nh': '33', 'new jersey': '34', 'nj': '34',
  'new mexico': '35', 'nm': '35', 'new york': '36', 'ny': '36', 'north carolina': '37', 'nc': '37',
  'north dakota': '38', 'nd': '38', 'ohio': '39', 'oh': '39', 'oklahoma': '40', 'ok': '40',
  'oregon': '41', 'or': '41', 'pennsylvania': '42', 'pa': '42', 'rhode island': '44', 'ri': '44',
  'south carolina': '45', 'sc': '45', 'south dakota': '46', 'sd': '46', 'tennessee': '47', 'tn': '47',
  'texas': '48', 'tx': '48', 'utah': '49', 'ut': '49', 'vermont': '50', 'vt': '50',
  'virginia': '51', 'va': '51', 'washington': '53', 'wa': '53', 'west virginia': '54', 'wv': '54',
  'wisconsin': '55', 'wi': '55', 'wyoming': '56', 'wy': '56',
  'district of columbia': '11', 'dc': '11', 'puerto rico': '72', 'pr': '72',
  'guam': '66', 'gu': '66', 'american samoa': '60', 'as': '60',
  'u.s. virgin islands': '78', 'vi': '78',
}

export function stateToFips(state: string): string | undefined {
  return STATE_FIPS[state.toLowerCase()]
}

interface TtsSettings {
  enabled: boolean
  voice: string
  rate: number
  pitch: number
  volume: number
}

interface AppSettings {
  alertsEnabled: boolean
  alertVolume: number
  location: UserLocation | null
  tts: TtsSettings
}

const TTS_DEFAULTS: TtsSettings = { enabled: true, voice: '', rate: 1.0, pitch: 1.0, volume: 80 }

let currentSettings: AppSettings = {
  alertsEnabled: true, alertVolume: 75, location: null, tts: { ...TTS_DEFAULTS }
}
let searchTimeout: ReturnType<typeof setTimeout> | null = null
let onSettingsChanged: (() => void) | null = null

export function setOnSettingsChanged(cb: () => void): void {
  onSettingsChanged = cb
}

export function getLocalSettings(): AppSettings {
  return currentSettings
}

export async function initSettings(): Promise<void> {
  currentSettings = await window.easAPI.getSettings()
  renderSettings()
}

function renderSettings(): void {
  const container = document.getElementById('settings-view')!
  const tts = currentSettings.tts || TTS_DEFAULTS
  container.innerHTML = `
    <div class="settings-content">
      <h2 class="settings-title">Settings</h2>

      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-text">
            <label class="settings-label">Enable Alerts</label>
            <p class="settings-desc">Receive and display emergency alerts from PBS WARN</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="toggle-alerts" ${currentSettings.alertsEnabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-text">
            <label class="settings-label">Alert Volume</label>
            <p class="settings-desc">Volume for the alert notification sound</p>
          </div>
          <span class="volume-value" id="volume-value">${currentSettings.alertVolume}%</span>
        </div>
        <div class="volume-slider-wrap">
          <input
            type="range"
            id="volume-slider"
            class="volume-slider"
            min="0"
            max="100"
            step="1"
            value="${currentSettings.alertVolume}"
          />
        </div>
        <button class="volume-test-btn" id="volume-test-btn">
          <span class="volume-test-icon" id="volume-test-icon">&#9654;</span>
          Test Sound
        </button>
      </div>

      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-text">
            <label class="settings-label">Alert Popup</label>
            <p class="settings-desc">Preview the popup notification that appears for new alerts</p>
          </div>
          <button class="volume-test-btn" id="demo-popup-btn">Demo Popup</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-text">
            <label class="settings-label">Text-to-Speech</label>
            <p class="settings-desc">Read alert descriptions aloud when a new alert arrives</p>
          </div>
          <label class="toggle">
            <input type="checkbox" id="toggle-tts" ${tts.enabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div id="tts-options" class="${tts.enabled ? '' : 'hidden'}">
          <div class="settings-row" style="margin-top:14px">
            <div class="settings-row-text">
              <label class="settings-label">Voice</label>
            </div>
            <select id="tts-voice" class="settings-select">
              <option value="">System Default</option>
            </select>
          </div>

          <div class="settings-row" style="margin-top:14px">
            <div class="settings-row-text">
              <label class="settings-label">Speed</label>
            </div>
            <span class="volume-value" id="tts-rate-value">${tts.rate.toFixed(1)}x</span>
          </div>
          <div class="volume-slider-wrap">
            <input type="range" id="tts-rate" class="volume-slider" min="0.5" max="2.0" step="0.1" value="${tts.rate}" />
          </div>

          <div class="settings-row" style="margin-top:14px">
            <div class="settings-row-text">
              <label class="settings-label">Pitch</label>
            </div>
            <span class="volume-value" id="tts-pitch-value">${tts.pitch.toFixed(1)}</span>
          </div>
          <div class="volume-slider-wrap">
            <input type="range" id="tts-pitch" class="volume-slider" min="0" max="2" step="0.1" value="${tts.pitch}" />
          </div>

          <div class="settings-row" style="margin-top:14px">
            <div class="settings-row-text">
              <label class="settings-label">TTS Volume</label>
            </div>
            <span class="volume-value" id="tts-vol-value">${tts.volume}%</span>
          </div>
          <div class="volume-slider-wrap">
            <input type="range" id="tts-volume" class="volume-slider" min="0" max="100" step="1" value="${tts.volume}" />
          </div>

          <button class="volume-test-btn" id="tts-test-btn">
            <span class="volume-test-icon" id="tts-test-icon">&#9654;</span>
            Test TTS
          </button>
        </div>
      </div>

      <div class="settings-section">
        <label class="settings-label">Location</label>
        <p class="settings-desc">Set your location to filter alerts relevant to your area</p>

        <div class="location-search-wrap">
          <input
            type="text"
            id="location-input"
            class="settings-input"
            placeholder="Search city, county, or state..."
            value="${currentSettings.location ? escapeAttr(currentSettings.location.name) : ''}"
            autocomplete="off"
          />
          <div id="location-results" class="location-results hidden"></div>
        </div>

        ${
          currentSettings.location
            ? `<div class="location-current">
                <span class="location-pin">&#9679;</span>
                <span class="location-name">${escapeHtml(currentSettings.location.name)}</span>
                <span class="location-coords">${currentSettings.location.lat.toFixed(4)}, ${currentSettings.location.lng.toFixed(4)}</span>
                <button id="location-clear" class="location-clear">&times;</button>
              </div>`
            : ''
        }
      </div>
    </div>
  `

  // Toggle handler
  document.getElementById('toggle-alerts')!.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked
    currentSettings = await window.easAPI.saveSettings({ alertsEnabled: checked })
    onSettingsChanged?.()
  })

  // Volume slider
  const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement
  const volumeValue = document.getElementById('volume-value')!

  volumeSlider.addEventListener('input', () => {
    volumeValue.textContent = `${volumeSlider.value}%`
  })

  volumeSlider.addEventListener('change', async () => {
    const vol = parseInt(volumeSlider.value, 10)
    currentSettings = await window.easAPI.saveSettings({ alertVolume: vol })
    onSettingsChanged?.()
  })

  const testBtn = document.getElementById('volume-test-btn')!
  const testIcon = document.getElementById('volume-test-icon')!
  testBtn.addEventListener('click', () => {
    if (alertAudio && !alertAudio.paused) {
      stopAlertSound()
      testBtn.classList.remove('playing')
      testIcon.textContent = '\u25B6'
    } else {
      playAlertSound(currentSettings.alertVolume, () => {
        testBtn.classList.remove('playing')
        testIcon.textContent = '\u25B6'
      })
      testBtn.classList.add('playing')
      testIcon.textContent = '\u25A0'
    }
  })

  // Demo popup with countdown
  const demoBtn = document.getElementById('demo-popup-btn')!
  demoBtn.addEventListener('click', async () => {
    demoBtn.setAttribute('disabled', '')
    const origText = demoBtn.textContent!
    for (let i = 3; i > 0; i--) {
      demoBtn.textContent = `${i}...`
      await new Promise((r) => setTimeout(r, 1000))
    }
    demoBtn.textContent = origText
    demoBtn.removeAttribute('disabled')
    window.easAPI.demoPopup()
  })

  // TTS toggle
  document.getElementById('toggle-tts')!.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked
    const newTts = { ...currentSettings.tts, enabled: checked }
    currentSettings = await window.easAPI.saveSettings({ tts: newTts })
    document.getElementById('tts-options')!.classList.toggle('hidden', !checked)
    onSettingsChanged?.()
  })

  // Populate voice dropdown
  const voiceSelect = document.getElementById('tts-voice') as HTMLSelectElement
  function populateVoices(): void {
    const voices = speechSynthesis.getVoices()
    // Keep "System Default" option
    voiceSelect.innerHTML = '<option value="">System Default</option>'
    for (const v of voices) {
      const opt = document.createElement('option')
      opt.value = v.name
      opt.textContent = `${v.name} (${v.lang})`
      if (v.name === (currentSettings.tts?.voice || '')) opt.selected = true
      voiceSelect.appendChild(opt)
    }
  }
  populateVoices()
  speechSynthesis.onvoiceschanged = populateVoices

  voiceSelect.addEventListener('change', async () => {
    const newTts = { ...currentSettings.tts, voice: voiceSelect.value }
    currentSettings = await window.easAPI.saveSettings({ tts: newTts })
    onSettingsChanged?.()
  })

  // TTS rate slider
  const ttsRate = document.getElementById('tts-rate') as HTMLInputElement
  const ttsRateValue = document.getElementById('tts-rate-value')!
  ttsRate.addEventListener('input', () => {
    ttsRateValue.textContent = `${parseFloat(ttsRate.value).toFixed(1)}x`
  })
  ttsRate.addEventListener('change', async () => {
    const newTts = { ...currentSettings.tts, rate: parseFloat(ttsRate.value) }
    currentSettings = await window.easAPI.saveSettings({ tts: newTts })
    onSettingsChanged?.()
  })

  // TTS pitch slider
  const ttsPitch = document.getElementById('tts-pitch') as HTMLInputElement
  const ttsPitchValue = document.getElementById('tts-pitch-value')!
  ttsPitch.addEventListener('input', () => {
    ttsPitchValue.textContent = parseFloat(ttsPitch.value).toFixed(1)
  })
  ttsPitch.addEventListener('change', async () => {
    const newTts = { ...currentSettings.tts, pitch: parseFloat(ttsPitch.value) }
    currentSettings = await window.easAPI.saveSettings({ tts: newTts })
    onSettingsChanged?.()
  })

  // TTS volume slider
  const ttsVol = document.getElementById('tts-volume') as HTMLInputElement
  const ttsVolValue = document.getElementById('tts-vol-value')!
  ttsVol.addEventListener('input', () => {
    ttsVolValue.textContent = `${ttsVol.value}%`
  })
  ttsVol.addEventListener('change', async () => {
    const newTts = { ...currentSettings.tts, volume: parseInt(ttsVol.value, 10) }
    currentSettings = await window.easAPI.saveSettings({ tts: newTts })
    onSettingsChanged?.()
  })

  // TTS test button
  const ttsTestBtn = document.getElementById('tts-test-btn')!
  const ttsTestIcon = document.getElementById('tts-test-icon')!
  ttsTestBtn.addEventListener('click', () => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
      ttsTestBtn.classList.remove('playing')
      ttsTestIcon.textContent = '\u25B6'
    } else {
      const ttsConf = currentSettings.tts || TTS_DEFAULTS
      const utter = new SpeechSynthesisUtterance(
        'The National Weather Service has issued a Tornado Warning for your area. Take shelter now.'
      )
      utter.rate = ttsConf.rate
      utter.pitch = ttsConf.pitch
      utter.volume = ttsConf.volume / 100
      if (ttsConf.voice) {
        const v = speechSynthesis.getVoices().find((v) => v.name === ttsConf.voice)
        if (v) utter.voice = v
      }
      utter.onend = () => {
        ttsTestBtn.classList.remove('playing')
        ttsTestIcon.textContent = '\u25B6'
      }
      speechSynthesis.speak(utter)
      ttsTestBtn.classList.add('playing')
      ttsTestIcon.textContent = '\u25A0'
    }
  })

  // Location search
  const input = document.getElementById('location-input') as HTMLInputElement
  input.addEventListener('input', () => {
    if (searchTimeout) clearTimeout(searchTimeout)
    const query = input.value.trim()
    if (query.length < 2) {
      hideResults()
      return
    }
    searchTimeout = setTimeout(() => searchLocation(query), 350)
  })

  input.addEventListener('focus', () => {
    const query = input.value.trim()
    if (query.length >= 2) {
      searchLocation(query)
    }
  })

  // Clear location
  const clearBtn = document.getElementById('location-clear')
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      currentSettings = await window.easAPI.saveSettings({ location: null })
      onSettingsChanged?.()
      renderSettings()
    })
  }
}

async function searchLocation(query: string): Promise<void> {
  const resultsEl = document.getElementById('location-results')!
  resultsEl.classList.remove('hidden')
  resultsEl.innerHTML = '<div class="location-result-item loading">Searching...</div>'

  try {
    const q = encodeURIComponent(query)
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&countrycodes=us&addressdetails=1`,
      { headers: { 'User-Agent': 'EASViewer/1.0' } }
    )
    const results = await resp.json()

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="location-result-item loading">No results found</div>'
      return
    }

    resultsEl.innerHTML = ''
    for (const r of results) {
      const name = r.display_name as string
      const lat = parseFloat(r.lat)
      const lng = parseFloat(r.lon)
      const stateName = r.address?.state as string | undefined
      const stateCode = r.address?.['ISO3166-2-lvl4'] as string | undefined // e.g. "US-CA"
      let stateFips: string | undefined
      if (stateName) stateFips = stateToFips(stateName)
      if (!stateFips && stateCode) stateFips = stateToFips(stateCode.replace('US-', ''))

      const item = document.createElement('div')
      item.className = 'location-result-item'
      item.textContent = name
      item.addEventListener('click', async () => {
        const location: UserLocation = { name, lat, lng, stateFips }
        currentSettings = await window.easAPI.saveSettings({ location })
        onSettingsChanged?.()
        hideResults()
        renderSettings()
      })
      resultsEl.appendChild(item)
    }
  } catch {
    resultsEl.innerHTML = '<div class="location-result-item loading">Search failed</div>'
  }
}

function hideResults(): void {
  const el = document.getElementById('location-results')
  if (el) {
    el.classList.add('hidden')
    el.innerHTML = ''
  }
}

// Close results when clicking outside
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  if (!target.closest('.location-search-wrap')) {
    hideResults()
  }
})

let alertAudio: HTMLAudioElement | null = null

export function playAlertSound(volume?: number, onEnded?: () => void): void {
  const vol = volume ?? currentSettings.alertVolume
  if (vol === 0) return

  if (!alertAudio) {
    // Use a path relative to the loaded HTML file so it resolves
    // inside the packaged app instead of the root of the drive.
    alertAudio = new Audio('alert.mp3')
  }

  alertAudio.onended = onEnded ?? null
  alertAudio.volume = vol / 100
  alertAudio.currentTime = 0
  alertAudio.play().catch(() => {})
}

export function stopAlertSound(): void {
  if (alertAudio && !alertAudio.paused) {
    alertAudio.pause()
    alertAudio.currentTime = 0
    alertAudio.onended = null
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
