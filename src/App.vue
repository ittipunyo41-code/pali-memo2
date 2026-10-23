<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { buildExportHtml } from './exportHtml'

interface WordItem {
  id: number
  text: string
  isHidden: boolean
  isRevealed: boolean
  lineIndex: number
  pos: number // ลำดับของคำในบรรทัด (ใช้จับคู่คำเดิมเมื่อแก้ข้อความ)
}

interface SavedPassage {
  id: string
  title: string
  text: string
  hidden: string // บิต 0/1 ต่อคำ: 1 = ซ่อน
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type ThemeMode = 'light' | 'sepia' | 'dark'
type AppMode = 'edit' | 'practice'

const presets = [
  {
    title: 'อิติปิโส (พุทธคุณ)',
    text: 'อิติปิ โส ภะคะวา อะระหัง สัมมาสัมพุทโธ วิชชาจะระณะสัมปันโน สุคะโต โลกะวิทู อะนุตตะโร ปุริสะทัมมะสาระถิ สัตถา เทวะมะนุสสานัง พุทโธ ภะคะวาติ'
  },
  {
    title: 'พาหุง (ท่อนแรก)',
    text: 'พาหุง สะหัสสะมะภินิมมิตะสาวุธันตัง\nครีเมขะลัง อุทิตะโฆระสะเสนะมารัง\nทานาทิธัมมะวิธินา ชิตะวา มุนินโท\nตันเตชะสา ภะวะตุ เต ชะยะมังคะลานิ'
  },
  {
    title: 'ชินบัญชร (ย่อ)',
    text: 'ชินะปัญชะระปะริตตัง\nมัง รักขะตุ สัพพะทา'
  }
]

const MIN_FONT = 1.1
const MAX_FONT = 2.5

// ============ บันทึกค่าลงเครื่อง (ใช้ได้ออฟไลน์) ============
const STORAGE_KEY = 'pali-memorize:v1'

interface StoredState {
  text: string
  hidden: string
  ratio: number
  fontSize: number
  theme: ThemeMode
  mode: AppMode
  custom: SavedPassage[]
}

const loadStored = (): Partial<StoredState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const isTheme = (v: unknown): v is ThemeMode => v === 'light' || v === 'sepia' || v === 'dark'
const isSavedPassage = (v: unknown): v is SavedPassage => {
  const p = v as SavedPassage
  return !!p && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.text === 'string' && typeof p.hidden === 'string'
}

// ============ แยกข้อความเป็นคำ ============
const parseText = (text: string, previous: WordItem[] = []): WordItem[] => {
  const keyOf = (line: number, pos: number, word: string) => `${line}:${pos}:${word}`
  const prevHidden = new Map<string, boolean>()
  previous.forEach(w => prevHidden.set(keyOf(w.lineIndex, w.pos, w.text), w.isHidden))

  const items: WordItem[] = []
  text.split(/\r?\n/).forEach((line, lineIndex) => {
    line
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 0)
      .forEach((word, pos) => {
        items.push({
          id: items.length,
          text: word,
          isHidden: prevHidden.get(keyOf(lineIndex, pos, word)) ?? false,
          isRevealed: false,
          lineIndex,
          pos
        })
      })
  })
  return items
}

// ============ State ============
const stored = loadStored()
const initialPreset = presets[0] ?? { title: '', text: '' }
const hasStoredText = typeof stored.text === 'string' && stored.text.trim().length > 0

const inputText = ref<string>(hasStoredText ? (stored.text as string) : initialPreset.text)
const processedWords = ref<WordItem[]>(parseText(inputText.value))
let parsedText = inputText.value

const currentRatio = ref<number>(
  typeof stored.ratio === 'number' && stored.ratio > 0 && stored.ratio <= 1 ? stored.ratio : 0.5
)
const fontSize = ref<number>(
  typeof stored.fontSize === 'number' && stored.fontSize >= MIN_FONT && stored.fontSize <= MAX_FONT
    ? stored.fontSize
    : 1.5
)
const themeMode = ref<ThemeMode>(
  isTheme(stored.theme)
    ? stored.theme
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
)
const mode = ref<AppMode>(stored.mode === 'edit' ? 'edit' : 'practice')
const activeHiddenIndex = ref<number>(-1)
const linkSame = ref<boolean>(false) // เลือก/ยกเลิกคำที่ซ้ำกันพร้อมกัน
const customPassages = ref<SavedPassage[]>(
  Array.isArray(stored.custom) ? stored.custom.filter(isSavedPassage) : []
)
const showSaveForm = ref<boolean>(false)
const saveName = ref<string>('')

const isOnline = ref<boolean>(navigator.onLine)
const installEvent = ref<BeforeInstallPromptEvent | null>(null)

const hiddenWords = computed(() => processedWords.value.filter(w => w.isHidden))
const hiddenBits = computed(() => processedWords.value.map(w => (w.isHidden ? '1' : '0')).join(''))
const totalCount = computed(() => processedWords.value.length)
const hiddenCount = computed(() => hiddenWords.value.length)
const revealedCount = computed(() => hiddenWords.value.filter(w => w.isRevealed).length)

const groupedLines = computed(() => {
  const map = new Map<number, WordItem[]>()
  processedWords.value.forEach(w => {
    if (!map.has(w.lineIndex)) map.set(w.lineIndex, [])
    map.get(w.lineIndex)!.push(w)
  })
  let prev = -1
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lineIndex, words]) => {
      const gap = prev !== -1 && lineIndex - prev > 1 // มีบรรทัดว่างคั่น = ขึ้นย่อหน้าใหม่
      prev = lineIndex
      return { lineIndex, words, gap }
    })
})

// ============ ธีม / ขนาดอักษร ============
const cycleTheme = () => {
  const order: ThemeMode[] = ['light', 'sepia', 'dark']
  const idx = order.indexOf(themeMode.value)
  themeMode.value = order[(idx + 1) % order.length] ?? 'light'
}

const themeLabel = computed(() => {
  if (themeMode.value === 'sepia') return '📜 สบายตา'
  if (themeMode.value === 'dark') return '🌙 โหมดมืด'
  return '☀️ สว่าง'
})

const changeFontSize = (delta: number) => {
  const newSize = fontSize.value + delta
  if (newSize >= MIN_FONT - 1e-9 && newSize <= MAX_FONT + 1e-9) {
    fontSize.value = Number(newSize.toFixed(1))
  }
}

// ============ ประวัติการเลือกคำ (เลิกทำ) ============
const history = ref<string[]>([])
const canUndo = computed(() => history.value.length > 0)

const pushHistory = () => {
  history.value.push(hiddenBits.value)
  if (history.value.length > 50) history.value.shift()
}

const applyBits = (bits: string) => {
  if (bits.length !== processedWords.value.length) return false
  processedWords.value.forEach((w, i) => {
    w.isHidden = bits[i] === '1'
    w.isRevealed = false
  })
  activeHiddenIndex.value = -1
  return true
}

const undoSelection = () => {
  const bits = history.value.pop()
  if (bits !== undefined) applyBits(bits)
}

// ============ เลือกคำที่จะซ่อน (โหมดแก้ไข) ============
const setHidden = (word: WordItem, value: boolean) => {
  if (linkSame.value) {
    processedWords.value.forEach(w => {
      if (w.text === word.text) w.isHidden = value
    })
  } else {
    word.isHidden = value
  }
}

const toggleChip = (word: WordItem) => {
  pushHistory()
  setHidden(word, !word.isHidden)
}

// ลากเมาส์/นิ้วผ่านหลายคำเพื่อเลือกต่อเนื่อง (ทำตามค่าของคำแรกที่แตะ)
let paintValue: boolean | null = null
let lastPaintedId = -1

const onChipPointerDown = (event: PointerEvent, word: WordItem) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  pushHistory()
  paintValue = !word.isHidden
  lastPaintedId = word.id
  setHidden(word, paintValue)
}

const onPointerMove = (event: PointerEvent) => {
  if (paintValue === null) return
  const el = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-word-id]')
  if (!el) return
  const id = Number(el.dataset.wordId)
  if (Number.isNaN(id) || id === lastPaintedId) return
  lastPaintedId = id
  const word = processedWords.value[id]
  if (word) setHidden(word, paintValue)
}

const endPaint = () => {
  paintValue = null
  lastPaintedId = -1
}

const toggleLine = (words: WordItem[]) => {
  pushHistory()
  const allHidden = words.every(w => w.isHidden)
  words.forEach(w => (w.isHidden = !allHidden))
}

const hideAllWords = () => {
  if (!totalCount.value) return
  pushHistory()
  processedWords.value.forEach(w => (w.isHidden = true))
}

const clearHidden = () => {
  if (!hiddenCount.value) return
  pushHistory()
  processedWords.value.forEach(w => (w.isHidden = false))
}

const invertHidden = () => {
  if (!totalCount.value) return
  pushHistory()
  processedWords.value.forEach(w => (w.isHidden = !w.isHidden))
}

// สุ่มซ่อนตามสัดส่วน (ได้จำนวนตรงตามเปอร์เซ็นต์)
const applyRandom = (ratio: number) => {
  currentRatio.value = ratio
  const words = processedWords.value
  if (!words.length) return
  pushHistory()
  const idx = words.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j]!, idx[i]!]
  }
  const count = Math.min(words.length, Math.max(1, Math.round(words.length * ratio)))
  words.forEach(w => {
    w.isHidden = false
    w.isRevealed = false
  })
  idx.slice(0, count).forEach(i => (words[i]!.isHidden = true))
  activeHiddenIndex.value = -1
}

// ============ โหมดฝึกท่อง ============
const resetPractice = () => {
  processedWords.value.forEach(w => (w.isRevealed = false))
  activeHiddenIndex.value = -1
}

// โหมดขยายเต็มจอ: ซ่อน header/footer ให้ช่องข้อความและพื้นที่เลือกคำใช้พื้นที่เต็ม
const isExpanded = ref(false)

// ขนาดตัวอักษรของช่องข้อความ (ปรับได้ แยกจากขนาดตัวอักษรของพื้นที่อ่าน)
const EDIT_FONT_KEY = 'pali-edit-font'
const loadEditFont = (): number => {
  try {
    const v = Number(localStorage.getItem(EDIT_FONT_KEY))
    return v >= 0.9 && v <= 3 ? v : 1.25
  } catch {
    return 1.25
  }
}
const editFontSize = ref<number>(loadEditFont())
const changeEditFont = (delta: number) => {
  const next = Math.round((editFontSize.value + delta) * 100) / 100
  if (next < 0.9 || next > 3) return
  editFontSize.value = next
  try {
    localStorage.setItem(EDIT_FONT_KEY, String(next))
  } catch {
    // ข้ามได้ ไม่กระทบการใช้งาน
  }
}

const toggleExpand = async () => {
  isExpanded.value = !isExpanded.value
  // Fullscreen จริงของเบราว์เซอร์ใช้เฉพาะเดสก์ท็อป (เมาส์) — บนมือถือคีย์บอร์ดทำให้หลุด fullscreen
  // จึงใช้การขยายด้วย CSS อย่างเดียว และสถานะขยายไม่ผูกกับ fullscreen อีกต่อไป
  try {
    const isDesktop = window.matchMedia('(pointer: fine)').matches
    if (isExpanded.value && isDesktop && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.()
    } else if (!isExpanded.value && document.fullscreenElement) {
      await document.exitFullscreen()
    }
  } catch {
    // ไม่รองรับ Fullscreen API — ยังขยายเต็มหน้าต่างด้วย CSS ได้
  }
}

const setMode = (next: AppMode) => {
  if (next === mode.value) return
  mode.value = next
  showSaveForm.value = false
  if (next === 'practice') resetPractice()
}

const toggleWord = (wordObj: WordItem) => {
  if (!wordObj.isHidden) return
  wordObj.isRevealed = !wordObj.isRevealed
  const idx = hiddenWords.value.findIndex(w => w.id === wordObj.id)
  if (idx !== -1) activeHiddenIndex.value = idx
}

const toggleAll = (reveal: boolean) => {
  processedWords.value.forEach(w => {
    if (w.isHidden) w.isRevealed = reveal
  })
}

const undoReveal = () => {
  for (let i = hiddenWords.value.length - 1; i >= 0; i--) {
    const word = hiddenWords.value[i]
    if (word?.isRevealed) {
      word.isRevealed = false
      activeHiddenIndex.value = i
      return
    }
  }
}

const moveFocusAndAutoReveal = (newIndex: number) => {
  if (newIndex >= 0 && newIndex < hiddenWords.value.length) {
    activeHiddenIndex.value = newIndex
    const nextWord = hiddenWords.value[newIndex]
    if (nextWord) nextWord.isRevealed = true
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null
  if (event.key === 'Escape' && isExpanded.value) {
    isExpanded.value = false
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    return
  }
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return

  if (mode.value === 'edit') {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault()
      undoSelection()
    }
    return
  }

  if (hiddenWords.value.length === 0) return

  if (event.shiftKey && (event.key === 'C' || event.key === 'c' || event.key === 'ฉ')) {
    event.preventDefault()
    const allRevealed = hiddenWords.value.every(w => w.isRevealed)
    toggleAll(!allRevealed)
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    undoReveal()
    return
  }

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocusAndAutoReveal(activeHiddenIndex.value + 1)
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocusAndAutoReveal(activeHiddenIndex.value - 1)
    return
  }
}

// ============ ข้อความ / บทสวด ============
// แก้ข้อความในช่อง: แยกคำใหม่ แต่คงคำที่เลือกซ่อนไว้เดิมถ้าตำแหน่งและคำเหมือนเดิม
let parseTimer: ReturnType<typeof setTimeout> | undefined
watch(inputText, text => {
  if (text === parsedText) return
  clearTimeout(parseTimer)
  parseTimer = setTimeout(() => {
    parsedText = text
    processedWords.value = parseText(text, processedWords.value)
    history.value = []
    activeHiddenIndex.value = -1
  }, 200)
})

const loadPassage = (text: string, bits?: string) => {
  clearTimeout(parseTimer)
  inputText.value = text
  parsedText = text
  processedWords.value = parseText(text)
  activeHiddenIndex.value = -1
  if (!(bits && applyBits(bits)) && mode.value === 'practice') {
    applyRandom(currentRatio.value) // โหมดฝึก: สุ่มให้เลย / โหมดเลือกคำ: เริ่มจากยังไม่ซ่อนอะไร
  }
  history.value = []
}

const selectPreset = (text: string) => loadPassage(text)

const loadCustom = (p: SavedPassage) => loadPassage(p.text, p.hidden)

const openSaveForm = () => {
  if (!totalCount.value) return
  saveName.value = ''
  showSaveForm.value = true
}

const saveCurrent = () => {
  if (!totalCount.value) return
  const title = saveName.value.trim() || `บทของฉัน ${customPassages.value.length + 1}`
  const entry: SavedPassage = {
    id: Date.now().toString(36),
    title,
    text: inputText.value,
    hidden: hiddenBits.value
  }
  const existing = customPassages.value.findIndex(p => p.title === title)
  if (existing !== -1) customPassages.value.splice(existing, 1, entry)
  else customPassages.value.push(entry)
  showSaveForm.value = false
}

const deleteCustom = (p: SavedPassage) => {
  if (window.confirm(`ลบบท "${p.title}" ?`)) {
    customPassages.value = customPassages.value.filter(x => x.id !== p.id)
  }
}

// ============ Export เป็นไฟล์ HTML แบบออฟไลน์ ============
const exportHTML = () => {
  if (processedWords.value.length === 0) return
  const html = buildExportHtml(processedWords.value, fontSize.value, themeMode.value)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bali-practice-${Date.now()}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============ PWA: ติดตั้งแอป / สถานะออนไลน์ ============
const onBeforeInstall = (e: Event) => {
  e.preventDefault()
  installEvent.value = e as BeforeInstallPromptEvent
}
const onInstalled = () => {
  installEvent.value = null
}
const installApp = async () => {
  const ev = installEvent.value
  if (!ev) return
  installEvent.value = null
  await ev.prompt()
  await ev.userChoice.catch(() => undefined)
}
const onOnline = () => (isOnline.value = true)
const onOffline = () => (isOnline.value = false)

// ============ บันทึกอัตโนมัติ ============
watch(
  [inputText, hiddenBits, themeMode, fontSize, currentRatio, mode, customPassages],
  () => {
    try {
      const state: StoredState = {
        text: inputText.value,
        hidden: hiddenBits.value,
        ratio: currentRatio.value,
        fontSize: fontSize.value,
        theme: themeMode.value,
        mode: mode.value,
        custom: customPassages.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // พื้นที่เต็ม หรือเบราว์เซอร์ปิดการเก็บข้อมูล — ข้ามไป ไม่กระทบการใช้งาน
    }
  },
  { deep: true }
)

onMounted(() => {
  // ใช้ค่าที่บันทึกไว้ ถ้าจำนวนคำตรงกัน ไม่เช่นนั้นสุ่มให้ตามค่าเริ่มต้น
  if (typeof stored.hidden !== 'string' || !hasStoredText || !applyBits(stored.hidden)) {
    applyRandom(currentRatio.value)
    history.value = []
  }
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endPaint)
  window.addEventListener('pointercancel', endPaint)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('beforeinstallprompt', onBeforeInstall)
  window.addEventListener('appinstalled', onInstalled)
})

onUnmounted(() => {
  clearTimeout(parseTimer)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endPaint)
  window.removeEventListener('pointercancel', endPaint)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  window.removeEventListener('appinstalled', onInstalled)
})
</script>

<template>
  <div
    class="gemini-app font-sarabun"
    :class="{ 'is-expanded': isExpanded, 'in-edit': mode === 'edit' }"
    :data-theme="themeMode"
  >
    <header class="app-header">
      <div class="brand">
        <span class="sparkle-icon">✨</span>
        <h1 class="title">บาลีฝึกท่องจำ</h1>
        <span v-if="!isOnline" class="status-pill" title="ไม่มีอินเทอร์เน็ต แต่ยังใช้งานได้ตามปกติ">📴 ออฟไลน์</span>
      </div>

      <div class="header-right">
        <button v-if="installEvent" @click="installApp" class="btn-theme" title="ติดตั้งเป็นแอปบนเครื่อง">
          📲 ติดตั้งแอป
        </button>

        <button
          @click="exportHTML"
          class="btn-export"
          :disabled="totalCount === 0"
          title="ดาวน์โหลดไฟล์ HTML สำหรับฝึกออฟไลน์"
        >
          ⬇️ Export HTML
        </button>

        <button @click="cycleTheme" class="btn-theme" :title="`ธีมปัจจุบัน: ${themeLabel} (คลิกเพื่อเปลี่ยน)`">
          {{ themeLabel }}
        </button>

        <div class="font-controls">
          <span class="tool-label">ขนาดอักษร:</span>
          <button @click="changeFontSize(-0.1)" class="btn-tool" title="ลดขนาด">A-</button>
          <span class="font-indicator">{{ Math.round((fontSize / 1.5) * 100) }}%</span>
          <button @click="changeFontSize(0.1)" class="btn-tool" title="เพิ่มขนาด">A+</button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <section class="control-card">
        <div class="mode-row">
          <div class="mode-tabs" role="tablist">
            <button
              role="tab"
              :aria-selected="mode === 'edit'"
              class="mode-tab"
              :class="{ active: mode === 'edit' }"
              @click="setMode('edit')"
            >
              ✏️ เลือกคำที่ซ่อน
            </button>
            <button
              role="tab"
              :aria-selected="mode === 'practice'"
              class="mode-tab"
              :class="{ active: mode === 'practice' }"
              @click="setMode('practice')"
            >
              🎯 ฝึกท่อง
            </button>
          </div>
          <button
            class="btn-ghost btn-expand"
            :title="isExpanded ? 'ย่อกลับ (Esc)' : 'ขยายพื้นที่ทำงานเต็มจอ'"
            :aria-pressed="isExpanded"
            @click="toggleExpand"
          >
            {{ isExpanded ? '🗗 ย่อกลับ' : '⛶ ขยายเต็มจอ' }}
          </button>
          <span class="count-pill">
            <template v-if="mode === 'edit'">ซ่อน {{ hiddenCount }} / {{ totalCount }} คำ</template>
            <template v-else>เปิดแล้ว {{ revealedCount }} / {{ hiddenCount }} คำ</template>
          </span>
        </div>

        <div class="preset-row">
          <span class="label">บทสวด:</span>
          <div class="preset-pills">
            <button v-for="p in presets" :key="p.title" @click="selectPreset(p.text)" class="pill-btn">
              {{ p.title }}
            </button>
            <span v-for="p in customPassages" :key="p.id" class="pill-group">
              <button @click="loadCustom(p)" class="pill-btn is-custom" title="บทที่บันทึกไว้ (พร้อมคำที่เลือกซ่อน)">
                ⭐ {{ p.title }}
              </button>
              <button
                v-if="mode === 'edit'"
                @click="deleteCustom(p)"
                class="pill-del"
                :title="`ลบ ${p.title}`"
                :aria-label="`ลบ ${p.title}`"
              >
                ×
              </button>
            </span>
          </div>
        </div>

        <!-- ===== โหมดเลือกคำที่ซ่อน ===== -->
        <template v-if="mode === 'edit'">
          <div class="edit-font-row">
            <span class="tool-label">ขนาดข้อความในช่อง:</span>
            <button @click="changeEditFont(-0.15)" class="btn-tool" title="ลดขนาดข้อความในช่อง">A-</button>
            <span class="font-indicator">{{ Math.round((editFontSize / 1.25) * 100) }}%</span>
            <button @click="changeEditFont(0.15)" class="btn-tool" title="เพิ่มขนาดข้อความในช่อง">A+</button>
          </div>
          <textarea
            v-model="inputText"
            rows="3"
            :style="{ fontSize: `${editFontSize}rem` }"
            class="notion-input"
            placeholder="พิมพ์หรือวางบทสวดบาลี... (ขึ้นบรรทัดใหม่ได้ตามต้องการ)"
          ></textarea>

          <div class="action-row">
            <div class="toggle-group">
              <button @click="undoSelection" class="btn-ghost" :disabled="!canUndo" title="เลิกทำการเลือกล่าสุด (Ctrl+Z)">
                ↩ เลิกทำ
              </button>
              <button @click="hideAllWords" class="btn-ghost">ซ่อนทุกคำ</button>
              <button @click="clearHidden" class="btn-ghost">ล้างที่เลือก</button>
              <button @click="invertHidden" class="btn-ghost">สลับ</button>
              <label class="check" title="เลือกหรือยกเลิกคำที่เหมือนกันทั้งบทพร้อมกัน">
                <input type="checkbox" v-model="linkSame" /> ทำกับคำที่ซ้ำทั้งหมด
              </label>
            </div>

            <div class="diff-group">
              <span class="label">สุ่มซ่อน:</span>
              <button @click="applyRandom(0.25)" class="btn-diff">25%</button>
              <button @click="applyRandom(0.5)" class="btn-diff">50%</button>
              <button @click="applyRandom(0.75)" class="btn-diff">75%</button>
              <button @click="applyRandom(1)" class="btn-diff dark">100%</button>
            </div>
          </div>

          <div class="action-row">
            <div class="toggle-group">
              <button v-if="!showSaveForm" @click="openSaveForm" class="btn-ghost" :disabled="!totalCount">
                💾 บันทึกเป็นบทของฉัน
              </button>
              <form v-else class="save-form" @submit.prevent="saveCurrent">
                <input v-model="saveName" class="save-input" placeholder="ตั้งชื่อบท" maxlength="40" autofocus />
                <button type="submit" class="btn-diff dark">บันทึก</button>
                <button type="button" class="btn-ghost" @click="showSaveForm = false">ยกเลิก</button>
              </form>
            </div>
            <button @click="setMode('practice')" class="btn-export" :disabled="!hiddenCount">▶ เริ่มฝึกท่อง</button>
          </div>
        </template>

        <!-- ===== โหมดฝึกท่อง ===== -->
        <div v-else class="action-row">
          <div class="diff-group">
            <span class="label">สุ่มซ่อนใหม่:</span>
            <button @click="applyRandom(0.25)" class="btn-diff">25%</button>
            <button @click="applyRandom(0.5)" class="btn-diff">50%</button>
            <button @click="applyRandom(0.75)" class="btn-diff">75%</button>
            <button @click="applyRandom(1)" class="btn-diff dark">100%</button>
          </div>

          <div class="toggle-group">
            <button @click="toggleAll(true)" class="btn-ghost">👁️ เฉลยหมด</button>
            <button @click="toggleAll(false)" class="btn-ghost">🙈 ซ่อนหมด</button>
            <button @click="undoReveal" class="btn-ghost" title="ปิดคำที่เปิดไว้ล่าสุด (ถอยหลังทีละคำ)">⌫ ปิดคำล่าสุด</button>
          </div>
        </div>
      </section>

      <article class="reader-canvas">
        <template v-if="groupedLines.length > 0">
          <p v-if="mode === 'edit'" class="edit-hint">
            แตะหรือคลิกคำเพื่อเลือกซ่อน · ลากผ่านหลายคำเพื่อเลือกต่อเนื่อง · ปุ่ม ◐ หน้าบรรทัดเพื่อสลับทั้งบรรทัด
          </p>
          <p v-else-if="hiddenCount === 0" class="notice">
            ยังไม่มีคำที่ซ่อน — กดสุ่มซ่อน หรือสลับไปแท็บ “เลือกคำที่ซ่อน” เพื่อเลือกเอง
          </p>

          <div
            class="reading-content"
            :class="{ 'is-editing': mode === 'edit' }"
            :style="{ fontSize: `${fontSize}rem` }"
          >
            <div
              v-for="line in groupedLines"
              :key="line.lineIndex"
              class="reading-line"
              :class="{ 'para-gap': line.gap }"
            >
              <button
                v-if="mode === 'edit'"
                class="line-toggle"
                title="สลับซ่อน/ไม่ซ่อนทั้งบรรทัด"
                aria-label="สลับซ่อนทั้งบรรทัด"
                @click="toggleLine(line.words)"
              >
                ◐
              </button>

              <span v-for="item in line.words" :key="item.id" class="word-wrap">
                <!-- โหมดเลือกคำ: ทุกคำแตะได้ คำที่จะซ่อนมีไฮไลต์ -->
                <span
                  v-if="mode === 'edit'"
                  class="edit-chip"
                  :class="{ 'is-marked': item.isHidden }"
                  :data-word-id="item.id"
                  role="checkbox"
                  :aria-checked="item.isHidden"
                  tabindex="0"
                  @pointerdown.prevent="onChipPointerDown($event, item)"
                  @keydown.enter.prevent="toggleChip(item)"
                  @keydown.space.prevent="toggleChip(item)"
                >{{ item.text }}</span>

                <!-- โหมดฝึก -->
                <span
                  v-else-if="item.isHidden"
                  @click="toggleWord(item)"
                  @keydown.enter.prevent="toggleWord(item)"
                  @keydown.space.prevent="toggleWord(item)"
                  class="hidden-slot"
                  role="button"
                  tabindex="0"
                  :aria-pressed="item.isRevealed"
                  :class="{
                    'is-revealed': item.isRevealed,
                    'is-active': hiddenWords[activeHiddenIndex]?.id === item.id
                  }"
                >
                  <span class="slot-text">{{ item.text }}</span>
                </span>
                <span v-else class="plain-word">{{ item.text }}</span>
              </span>
            </div>
          </div>
        </template>

        <div v-else class="empty-state">
          <p>เลือกบทสวดมนต์ด้านบน หรือพิมพ์ข้อความในแท็บ “เลือกคำที่ซ่อน”</p>
        </div>
      </article>
    </main>

    <footer class="app-footer">
      <span v-if="mode === 'edit'">
        💡 <b>เลือกคำ:</b> คลิก/แตะ หรือลากผ่านคำ | <kbd>Tab</kbd> + <kbd>Space</kbd> เลือกด้วยคีย์บอร์ด |
        <kbd>Ctrl</kbd>+<kbd>Z</kbd> เลิกทำ
      </span>
      <span v-else>
        💡 <b>คีย์บอร์ด:</b>
        <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> เลื่อน + Auto เปิดเฉลย |
        <kbd>Delete</kbd>/<kbd>Backspace</kbd> ปิดคำล่าสุดถอยหลังทีละคำ |
        <kbd>Shift</kbd>+<kbd>C</kbd> สลับเปิด/ปิดทั้งหมด
      </span>
    </footer>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=TH+Sarabun+New:ital,wght@0,400;0,700;1,400;1,700&display=swap');

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#app {
  width: 100%;
  height: 100%;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  display: block !important;
}

.font-sarabun {
  font-family: 'TH Sarabun New', 'Sarabun', 'Leelawadee UI', 'Tahoma', sans-serif;
}

/* ================= Theme Variables ================= */
.gemini-app {
  --bg: #f8f9fa;
  --surface: #ffffff;
  --border: #e3e3e3;
  --text: #1f1f1f;
  --text-soft: #5f6368;
  --text-mute: #70757a;
  --accent: #0b57d0;
  --accent-hover: #0842a0;
  --btn-bg: #f1f3f4;
  --btn-hover: #e2e7eb;
  --label-color: #444746;
  --pill-bg: #f1f3f4;
  --pill-text: #3c4043;
  --pill-hover: #e8eaed;
  --input-bg: #f8f9fa;
  --slot-dash: #9aa4b2;
  --slot-revealed: #8ab4f8;
  --slot-active: #1f5fe8;
  --slot-text: #0d4bbf;
  --shadow: rgba(0,0,0,0.02);
  --on-accent: #ffffff;
  --mark-bg: #dce8ff;

  width: 100vw;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: max(1rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-right)) max(0.75rem, env(safe-area-inset-bottom)) max(1.5rem, env(safe-area-inset-left));
  background-color: var(--bg);
  color: var(--text);
  transition: background-color 0.3s, color 0.3s;
}

/* โหมดสบายตา (Sepia) */
.gemini-app[data-theme="sepia"] {
  --bg: #f4ecd8;
  --surface: #fbf6e9;
  --border: #d9cdb0;
  --text: #3b2f1e;
  --text-soft: #6b5a3e;
  --text-mute: #8a795a;
  --accent: #8b5e34;
  --accent-hover: #6f4a26;
  --btn-bg: #ede0c8;
  --btn-hover: #e0d0b0;
  --label-color: #6b5a3e;
  --pill-bg: #ede0c8;
  --pill-text: #5a4425;
  --pill-hover: #e0d0b0;
  --input-bg: #fbf6e9;
  --slot-dash: #b8a782;
  --slot-revealed: #d4b483;
  --slot-active: #8b5e34;
  --slot-text: #6f4a26;
  --shadow: rgba(80,60,30,0.08);
  --on-accent: #ffffff;
  --mark-bg: #ecd9b0;
}

/* โหมดมืด (Dark) */
.gemini-app[data-theme="dark"] {
  --bg: #121212;
  --surface: #1e1e1e;
  --border: #333333;
  --text: #e8eaed;
  --text-soft: #b8bcc2;
  --text-mute: #8a8f96;
  --accent: #8ab4f8;
  --accent-hover: #aecbfa;
  --btn-bg: #2a2a2a;
  --btn-hover: #3a3a3a;
  --label-color: #b8bcc2;
  --pill-bg: #2a2a2a;
  --pill-text: #d7dbe0;
  --pill-hover: #3a3a3a;
  --input-bg: #2a2a2a;
  --slot-dash: #5f6368;
  --slot-revealed: #8ab4f8;
  --slot-active: #aecbfa;
  --slot-text: #aecbfa;
  --shadow: rgba(0,0,0,0.4);
  --on-accent: #10243f;
  --mark-bg: #2b3a55;
}

/* ================= Header ================= */
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.75rem;
  gap: 1rem;
  flex-wrap: wrap;
  transition: border-color 0.3s;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sparkle-icon { font-size: 1.5rem; }

.title {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text);
  transition: color 0.3s;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.btn-export {
  background: var(--accent);
  color: var(--on-accent);
  border: none;
  padding: 0.4rem 0.9rem;
  border-radius: 20px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s;
}

.btn-export:hover { background: var(--accent-hover); }

.btn-theme {
  background: var(--btn-bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 0.4rem 0.9rem;
  border-radius: 20px;
  font-size: 1.05rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.btn-theme:hover { background: var(--btn-hover); }

.font-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--surface);
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  border: 1px solid var(--border);
  font-size: 1.1rem;
  transition: background 0.3s, border-color 0.3s;
}

.tool-label { color: var(--text-soft); }

.btn-tool {
  background: var(--btn-bg);
  color: var(--text);
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.btn-tool:hover { background: var(--btn-hover); }

.font-indicator {
  font-size: 1.1rem;
  font-weight: 600;
  min-width: 40px;
  text-align: center;
  color: var(--text);
}

/* ================= Main ================= */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.control-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 1px 3px var(--shadow);
  transition: background 0.3s, border-color 0.3s;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.label {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--label-color);
  transition: color 0.3s;
}

.preset-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.pill-btn {
  background: var(--pill-bg);
  border: none;
  color: var(--pill-text);
  padding: 0.2rem 0.65rem;
  border-radius: 16px;
  font-size: 1.15rem;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}

.pill-btn:hover {
  background: var(--pill-hover);
  color: var(--text);
}

.notion-input {
  width: 100%;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 1.25rem;
  font-family: inherit;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  resize: vertical;
  min-height: 3.5rem;
  transition: background 0.3s, border-color 0.3s, color 0.3s;
}

.notion-input:focus {
  border-color: var(--accent);
  background: var(--surface);
}

.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.diff-group, .toggle-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn-diff {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--label-color);
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 1.1rem;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.btn-diff:hover, .btn-diff.dark {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
}

.btn-ghost {
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 1.15rem;
  cursor: pointer;
  padding: 0 0.25rem;
  font-family: inherit;
  transition: color 0.3s;
}

.btn-ghost:hover { text-decoration: underline; }

/* ================= Reader ================= */
.reader-canvas {
  flex: 1 0 14rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem 2rem;
  overflow-y: auto;
  box-shadow: 0 2px 6px var(--shadow);
  transition: background 0.3s, border-color 0.3s;
}

.reading-content {
  line-height: 2.2;
  color: var(--text);
  transition: font-size 0.2s ease, color 0.3s;
}

.reading-line {
  display: block;
  margin-bottom: 0.25rem;
}

.word-wrap {
  display: inline-block;
  margin-right: 0.6rem;
}

.plain-word { color: var(--text); }

.hidden-slot {
  display: inline;
  position: relative;
  padding: 0;
  margin: 0 0.08rem;
  border-bottom: 2px dashed var(--slot-dash);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.18s ease;
}

.hidden-slot .slot-text {
  opacity: 0;
  visibility: hidden;
  color: var(--slot-text);
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  transition: opacity 0.18s ease;
}

@media (hover: hover) {
  .hidden-slot:hover {
    border-color: var(--slot-active);
    border-bottom-style: solid;
  }

  .hidden-slot:hover .slot-text {
    opacity: 1;
    visibility: visible;
  }
}

.hidden-slot.is-revealed {
  border-color: var(--slot-revealed);
  border-bottom-style: solid;
}

.hidden-slot.is-revealed .slot-text {
  opacity: 1;
  visibility: visible;
}

.hidden-slot.is-active {
  border-color: var(--slot-active);
  border-bottom-style: solid;
}

.empty-state {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-mute);
  font-size: 1.4rem;
}

/* ================= Footer ================= */
.app-footer {
  text-align: center;
  padding-top: 0.5rem;
  font-size: 1.05rem;
  color: var(--text-soft);
  transition: color 0.3s;
}

kbd {
  background: var(--btn-bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  font-family: monospace;
  font-size: 0.95rem;
  color: var(--text);
  transition: background 0.3s, border-color 0.3s, color 0.3s;
}

/* ================= โหมดเลือกคำ / ฟีเจอร์เพิ่ม ================= */
.btn-export:disabled,
.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  text-decoration: none;
}

.status-pill {
  background: var(--btn-bg);
  border: 1px solid var(--border);
  color: var(--text-soft);
  border-radius: 14px;
  padding: 0.1rem 0.6rem;
  font-size: 1.05rem;
}

.mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.mode-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--btn-bg);
  border: 1px solid var(--border);
  border-radius: 22px;
}

.mode-tab {
  border: none;
  background: transparent;
  color: var(--text-soft);
  padding: 0.25rem 1rem;
  border-radius: 20px;
  font-family: inherit;
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.mode-tab.active {
  background: var(--accent);
  color: var(--on-accent);
}

.count-pill {
  font-size: 1.15rem;
  color: var(--text-soft);
}

.pill-group {
  display: inline-flex;
  align-items: center;
}

.pill-btn.is-custom { background: var(--mark-bg); }

.pill-del {
  border: none;
  background: transparent;
  color: var(--text-mute);
  font-size: 1.3rem;
  line-height: 1;
  padding: 0 0.3rem;
  cursor: pointer;
}

.pill-del:hover { color: var(--text); }

.check {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 1.1rem;
  color: var(--label-color);
  cursor: pointer;
  user-select: none;
}

.save-form {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.save-input {
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  font-family: inherit;
  font-size: 1.1rem;
  outline: none;
}

.save-input:focus { border-color: var(--accent); }

.edit-hint,
.notice {
  font-size: 1.1rem;
  color: var(--text-mute);
  margin-bottom: 0.6rem;
}

.notice {
  background: var(--mark-bg);
  color: var(--text);
  border-radius: 8px;
  padding: 0.3rem 0.7rem;
}

.reading-line.para-gap { margin-top: 1.1rem; }

.reading-content.is-editing { touch-action: pan-y; }

.edit-chip {
  display: inline;
  padding: 0 0.15rem;
  border-bottom: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: pan-y;
  outline: none;
  transition: background 0.12s ease;
}

@media (hover: hover) {
  .edit-chip:hover { background: var(--btn-hover); }
}

.edit-chip.is-marked {
  background: var(--mark-bg);
  border-bottom: 2px dashed var(--slot-active);
  color: var(--slot-text);
}

.edit-chip:focus-visible,
.hidden-slot:focus-visible,
.line-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.line-toggle {
  width: 1.5rem;
  height: 1.5rem;
  margin-right: 0.4rem;
  padding: 0;
  vertical-align: middle;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--btn-bg);
  color: var(--text-soft);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
}

.line-toggle:hover { background: var(--btn-hover); }

/* ================= โหมดขยายเต็มจอ ================= */
.gemini-app.is-expanded {
  padding-top: max(0.5rem, env(safe-area-inset-top));
  padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
}
.is-expanded .app-header,
.is-expanded .app-footer { display: none; }
.is-expanded .app-main { overflow: hidden; }
.is-expanded .reader-canvas { flex: 1 1 0; min-height: 0; }

/* โหมดเลือกคำ: ช่องข้อความ (ซ้าย) + พื้นที่เลือกคำ (ขวา) เต็มความสูงจอ */
.is-expanded.in-edit .app-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  grid-template-rows: minmax(0, 1fr);
}
.is-expanded.in-edit .control-card { min-height: 0; overflow-y: auto; }
.is-expanded.in-edit .notion-input {
  flex: 1 1 auto;
  min-height: 10rem;
  resize: none;
  line-height: 1.6;
}
.edit-font-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
@media (max-width: 900px) {
  .is-expanded.in-edit .app-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1.2fr);
  }
  /* มือถือ: ซ่อนแถวเลือกบทสวดตอนขยาย เพื่อให้ช่องข้อความสูงขึ้น */
  .is-expanded.in-edit .preset-row { display: none; }
  /* ขณะพิมพ์ (คีย์บอร์ดเปิด) ให้ช่องข้อความได้พื้นที่มากขึ้น */
  .is-expanded.in-edit .app-main:has(.notion-input:focus) {
    grid-template-rows: minmax(0, 1fr) minmax(0, 0.45fr);
  }
}

/* ================= จอเล็ก ================= */
@media (max-width: 640px) {
  .gemini-app {
    padding-left: max(0.75rem, env(safe-area-inset-left));
    padding-right: max(0.75rem, env(safe-area-inset-right));
  }
  .title { font-size: 1.5rem; }
  .tool-label { display: none; }
  .edit-font-row .tool-label { display: inline; }
  .reader-canvas { padding: 1rem; }
  .app-footer { font-size: 0.95rem; }
}
</style>
