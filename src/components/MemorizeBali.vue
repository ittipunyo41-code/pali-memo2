<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

// อินเทอร์เฟซสำหรับข้อมูลคำ
interface WordItem {
  id: number
  text: string
  cleanText: string // สำหรับเปรียบเทียบตรวจคำตอบ
  isHidden: boolean
  isRevealed: boolean
  userInput: string
  isCorrect?: boolean
}

// คลังบทสวดมนต์ตัวอย่าง
const presets = [
  {
    title: 'บทสรรเสริญพระพุทธคุณ (อิติปิโส)',
    text: 'อิติปิ โส ภะคะวา อะระหัง สัมมาสัมพุทโธ วิชชาจะระณะสัมปันโน สุคะโต โลกะวิทู อะนุตตะโร ปุริสะทัมมะสาระถิ สัตถา เทวะมะนุสสานัง พุทโธ ภะคะวาติ'
  },
  {
    title: 'บทพุทธชัยมงคลคาถา (พาหุง - ท่อนแรก)',
    text: 'พาหุง สะหัสสะมะภินิมมิตะสาวุธันตัง ครีเมขะลัง อุทิตะโฆระสะเสนะมารัง ทานาทิธัมมะวิธินา ชิตะวา มุนินโท ตันเตชะสา ภะวะตุ เต ชะยะมังคะลานิ'
  },
  {
    title: 'พระคาถาชินบัญชร (ย่อ)',
    text: 'ชินะปัญชะระปะริตตัง มัง รักขะตุ สัพพะทา'
  }
]

// State หลัก
const initialPreset = presets[0] ?? { title: '', text: '' }
const inputText = ref<string>(initialPreset.text)
const processedWords = ref<WordItem[]>([])
const isAllRevealed = ref<boolean>(false)
const lastRatio = ref<number>(0.5)

// ระบบโหมดการใช้งาน (interactive = พิมพ์ตอบ, click = คลิกดูเฉลย)
const practiceMode = ref<'click' | 'input'>('click')

// ระบบจับเวลา
const timerSeconds = ref<number>(0)
let timerInterval: any = null
const isTimerRunning = ref<boolean>(false)

// ลบเครื่องหมายวรรคตอนเพื่อเอาไว้เช็กคำตอบ
const cleanWord = (str: string) => str.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim()

// สุ่มซ่อนคำ
const generateTest = (hideRatio: number): void => {
  if (!inputText.value.trim()) return
  lastRatio.value = hideRatio

  const words = inputText.value.trim().split(/\s+/)
  let hiddenCounter = 0

  processedWords.value = words.map((word, index) => {
    const shouldHide = Math.random() < hideRatio
    if (shouldHide) hiddenCounter++

    return {
      id: index,
      text: word,
      cleanText: cleanWord(word),
      isHidden: shouldHide,
      isRevealed: false,
      userInput: '',
      isCorrect: undefined
    }
  })

  isAllRevealed.value = false
  resetTimer()
  startTimer()
}

// สลับคำซ่อนใหม่ด้วย Ratio เดิม
const reroll = () => generateTest(lastRatio.value)

// คลิกเปิด/ปิดคำ
const toggleWord = (wordObj: WordItem): void => {
  if (wordObj.isHidden && practiceMode.value === 'click') {
    wordObj.isRevealed = !wordObj.isRevealed
  }
}

// เปิด/ปิด เฉลยทั้งหมด
const toggleAll = (): void => {
  isAllRevealed.value = !isAllRevealed.value
  processedWords.value.forEach((w) => {
    if (w.isHidden) {
      w.isRevealed = isAllRevealed.value
    }
  })
}

// ตรวจคำตอบทั้งหมด (สำหรับโหมดพิมพ์ตอบ)
const checkAnswers = () => {
  stopTimer()
  processedWords.value.forEach((w) => {
    if (w.isHidden) {
      w.isCorrect = cleanWord(w.userInput) === w.cleanText
      w.isRevealed = true
    }
  })
}

// คำนวณสถิติ
const stats = computed(() => {
  const total = processedWords.value.length
  const hidden = processedWords.value.filter((w) => w.isHidden).length
  const answered = processedWords.value.filter((w) => w.isHidden && w.userInput.trim() !== '').length
  const correct = processedWords.value.filter((w) => w.isHidden && w.isCorrect === true).length

  return { total, hidden, answered, correct }
})

// ตัวจัดการจับเวลา
const startTimer = () => {
  stopTimer()
  timerSeconds.value = 0
  isTimerRunning.value = true
  timerInterval = setInterval(() => {
    timerSeconds.value++
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  isTimerRunning.value = false
}

const resetTimer = () => {
  stopTimer()
  timerSeconds.value = 0
}

const formattedTime = computed(() => {
  const m = Math.floor(timerSeconds.value / 60).toString().padStart(2, '0')
  const s = (timerSeconds.value % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const selectPreset = (text: string) => {
  inputText.value = text
  processedWords.value = []
  resetTimer()
}

onUnmounted(() => stopTimer())
</script>

<template>
  <!-- นำเข้าฟอนต์ TH Sarabun New จาก Google Fonts -->
  <component :is="'style'">
    @import url('https://fonts.googleapis.com/css2?family=TH+Sarabun+New:ital,wght@0,400;0,700;1,400;1,700&display=swap');
    
    .font-sarabun {
      font-family: 'TH Sarabun New', sans-serif;
    }
  </component>

  <!-- Container เต็มหน้าจอ Single Page -->
  <div class="min-h-screen w-full bg-amber-50 text-gray-800 font-sarabun flex flex-col justify-between p-3 md:p-6 text-xl md:text-2xl">
    
    <!-- Header Bar -->
    <header class="max-w-5xl mx-auto w-full flex flex-col md:flex-row justify-between items-center border-b border-amber-200 pb-3 mb-4 gap-2">
      <div class="flex items-center gap-2">
        <span class="text-3xl md:text-4xl">🧘‍♂️</span>
        <h1 class="text-3xl md:text-4xl font-bold text-amber-950">ระบบฝึกจดจำคาถาบาลี</h1>
      </div>
      
      <!-- Timer & Controls -->
      <div class="flex items-center gap-4 bg-amber-100/80 px-4 py-1 rounded-full text-amber-900 border border-amber-300">
        <span class="text-base md:text-lg font-bold">⏱️ เวลา: {{ formattedTime }}</span>
        <button v-if="processedWords.length > 0" @click="reroll" class="text-base text-amber-800 hover:text-amber-950 underline font-semibold">
          🔄 สุ่มคำใหม่
        </button>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="max-w-5xl mx-auto w-full flex-1 bg-white rounded-2xl shadow-lg border border-amber-200 p-4 md:p-8 flex flex-col gap-6">
      
      <!-- Section 1: เลือกบทสวด หรือ พิมพ์เอง -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="font-bold text-amber-900 text-2xl">เลือกบทสวดตัวอย่าง:</label>
          <div class="flex flex-wrap gap-2">
            <button 
              v-for="p in presets" 
              :key="p.title"
              @click="selectPreset(p.text)"
              class="text-base md:text-lg bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1 rounded-lg border border-amber-300 transition"
            >
              {{ p.title }}
            </button>
          </div>
        </div>

        <textarea
          v-model="inputText"
          rows="3"
          class="w-full p-3 border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none text-2xl leading-relaxed text-gray-800 bg-amber-50/30"
          placeholder="พิมพ์หรือวางบทสวดบาลีที่นี่..."
        ></textarea>
      </div>

      <!-- Section 2: แถบควบคุมโหมด และ ระดับความยาก -->
      <div class="flex flex-col md:flex-row justify-between items-center gap-4 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
        
        <!-- เลือกรูปแบบการเล่น -->
        <div class="flex items-center gap-2">
          <span class="font-bold text-amber-900">รูปแบบการฝึก:</span>
          <button 
            @click="practiceMode = 'click'"
            :class="practiceMode === 'click' ? 'bg-amber-700 text-white' : 'bg-white text-amber-900'"
            class="px-3 py-1 text-lg rounded-lg border border-amber-400 transition"
          >
            👆 คลิกดูเฉลย
          </button>
          <button 
            @click="practiceMode = 'input'"
            :class="practiceMode === 'input' ? 'bg-amber-700 text-white' : 'bg-white text-amber-900'"
            class="px-3 py-1 text-lg rounded-lg border border-amber-400 transition"
          >
            ✍️ พิมพ์คำตอบ
          </button>
        </div>

        <!-- ปุ่มเลือกระดับความยาก -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-bold text-amber-900">ซ่อนคำ:</span>
          <button @click="generateTest(0.25)" class="bg-amber-200 hover:bg-amber-300 text-amber-950 px-3 py-1 rounded-lg border border-amber-400 text-lg transition">25%</button>
          <button @click="generateTest(0.50)" class="bg-amber-300 hover:bg-amber-400 text-amber-950 px-3 py-1 rounded-lg border border-amber-400 text-lg transition">50%</button>
          <button @click="generateTest(0.75)" class="bg-amber-400 hover:bg-amber-500 text-amber-950 px-3 py-1 rounded-lg border border-amber-400 text-lg transition">75%</button>
          <button @click="generateTest(1.00)" class="bg-amber-700 hover:bg-amber-800 text-white px-3 py-1 rounded-lg text-lg transition">100%</button>
        </div>

      </div>

      <!-- Section 3: สถิติ และ ปุ่มควบคุมเฉลย -->
      <div v-if="processedWords.length > 0" class="flex justify-between items-center text-lg text-amber-900 border-b border-amber-100 pb-2">
        <div class="flex items-center gap-4">
          <button @click="toggleAll" class="underline hover:text-amber-700">
            {{ isAllRevealed ? '🙈 ซ่อนทั้งหมด' : '👁️ เฉลยทั้งหมด' }}
          </button>
          <button v-if="practiceMode === 'input'" @click="checkAnswers" class="bg-green-700 hover:bg-green-800 text-white px-3 py-0.5 rounded-lg font-bold">
            ✅ ส่งตรวจคำตอบ
          </button>
        </div>
        <div>
          <span>ซ่อน {{ stats.hidden }} / {{ stats.total }} คำ</span>
          <span v-if="stats.correct > 0" class="ml-3 text-green-700 font-bold">
            (ถูก {{ stats.correct }}/{{ stats.hidden }})
          </span>
        </div>
      </div>

      <!-- Section 4: แสดงผลบทสวดมนต์ (Display Area) -->
      <div class="flex-1 p-6 bg-amber-50/30 border-2 border-amber-200 rounded-2xl min-h-[200px] text-2xl md:text-3xl leading-loose">
        <template v-if="processedWords.length > 0">
          <span
            v-for="item in processedWords"
            :key="item.id"
            class="inline-block mr-3 my-1"
          >
            <!-- กรณีที่คำนี้ถูกซ่อน -->
            <template v-if="item.isHidden">
              
              <!-- โหมด 1: คลิกเปิดเฉลย -->
              <span
                v-if="practiceMode === 'click'"
                @click="toggleWord(item)"
                class="cursor-pointer select-none px-3 py-0.5 rounded-md transition-all inline-block text-center min-w-[4rem]"
                :class="
                  item.isRevealed
                    ? 'bg-amber-100 text-amber-950 border-b-2 border-dashed border-amber-600'
                    : 'bg-amber-300 text-transparent border-b-2 border-amber-600 hover:bg-amber-400'
                "
              >
                {{ item.text }}
              </span>

              <!-- โหมด 2: พิมพ์คำตอบ -->
              <span v-else class="inline-flex items-center">
                <input
                  v-model="item.userInput"
                  type="text"
                  class="w-28 md:w-36 px-2 py-0.5 text-center border-b-2 text-2xl focus:outline-none rounded"
                  :class="{
                    'border-amber-500 bg-amber-100/50': item.isCorrect === undefined,
                    'border-green-600 bg-green-100 text-green-900 font-bold': item.isCorrect === true,
                    'border-red-500 bg-red-100 text-red-900': item.isCorrect === false
                  }"
                  placeholder="???"
                />
                <span v-if="item.isRevealed && item.isCorrect === false" class="text-sm text-red-600 ml-1">
                  ({{ item.text }})
                </span>
              </span>

            </template>

            <!-- คำปกติที่ไม่ถูกซ่อน -->
            <span v-else class="text-gray-800">{{ item.text }}</span>
          </span>
        </template>

        <!-- ข้อความต้อนรับเมื่อยังไม่ได้เริ่ม -->
        <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 py-12">
          <p class="text-3xl mb-2">🙏</p>
          <p>เลือกบทสวด หรือเลือกระดับความยากซ่อนคำด้านบนเพื่อเริ่มท่องจำ</p>
        </div>
      </div>

    </main>

    <!-- Footer -->
    <footer class="max-w-5xl mx-auto w-full text-center text-amber-800/60 text-base py-2 mt-2">
      ระบบซ้อมสวดมนต์บาลี • พัฒนาด้วย Vue 3 & Tailwind CSS
    </footer>

  </div>
</template>
