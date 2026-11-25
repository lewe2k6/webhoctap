import type { StudyApi } from './api'
import { localAttempts } from './localAttempts'
import type { Material, Pack, Question } from './types'

export const demoUser = 'local-demo'
const materials: Material[] = [
  { id: 'demo-pdf-micro', title: 'Minh họa đọc PDF — Vi mô 1', kind: 'lecture', handle: 'demo/micro', url: 'https://dlib.tmu.edu.vn/', pageCount: 2, documentId: 'demo-micro' },
  { id: 'demo-pdf-macro', title: 'Minh họa đọc PDF — Vĩ mô 1', kind: 'outline', handle: 'demo/macro', url: 'https://dlib.tmu.edu.vn/', pageCount: 2, documentId: 'demo-macro' },
]
const courses = [
  { id: 'miec0111', name: 'Kinh tế vi mô 1', codes: ['MIEC0111'], language: 'vi' as const, hasPdf: true, sources: [materials[0]] },
  { id: 'maec0111', name: 'Kinh tế vĩ mô 1', codes: ['MAEC0111'], language: 'vi' as const, hasPdf: true, sources: [materials[1]] },
  { id: 'dau-thau', name: 'Đấu thầu', codes: ['TECO3011'], language: 'vi' as const, hasPdf: false, sources: [
    { id: 'demo-link', title: 'Danh mục thư viện TMU', kind: 'syllabus' as const, handle: 'demo/link', url: 'https://dlib.tmu.edu.vn/' },
  ] },
]

function samplePack(courseId: string): Pack | null {
  const course = courses.find((item) => item.id === courseId)
  if (!course?.hasPdf) return null
  const micro = courseId === 'miec0111'
  const source = { sourceId: course.sources[0].id, documentId: micro ? 'demo-micro' : 'demo-macro', page: 2 }
  const questions: Question[] = []
  for (let index = 1; index <= 15; index++) {
    const base = 20 + index
    const change = 2 + index
    questions.push({
      id: `${courseId}-demo-mcq-${index}`,
      topicId: index < 8 ? 'basics' : 'practice',
      type: 'mcq',
      prompt: micro
        ? `Khi giá một hàng hóa tăng từ ${base} lên ${base + change} nghìn đồng, mức tăng tuyệt đối là bao nhiêu?`
        : `Một nền kinh tế giả định có tiêu dùng ${base} và đầu tư ${change}. Nếu các thành phần chi tiêu còn lại bằng 0, tổng chi tiêu là bao nhiêu?`,
      options: micro
        ? [`${change + 1} nghìn đồng`, `${change} nghìn đồng`, `${change + 2} nghìn đồng`, `${base} nghìn đồng`]
        : [`${base}`, `${base - change}`, `${base + change}`, `${change}`],
      answer: micro ? 1 : 2,
      explanation: micro ? `Lấy giá mới trừ giá cũ, được ${change} nghìn đồng.` : `Cộng tiêu dùng và đầu tư, được ${base + change}.`,
      rubric: [],
      source,
    })
  }
  const essayTopics = micro
    ? ['chi phí cơ hội', 'đường cầu', 'cạnh tranh', 'chi phí cận biên', 'mức giá cân bằng']
    : ['GDP danh nghĩa', 'lạm phát', 'thất nghiệp', 'tăng trưởng kinh tế', 'tiêu dùng hộ gia đình']
  essayTopics.forEach((topic, index) => {
    questions.push({
      id: `${courseId}-demo-essay-${index}`, type: 'essay', topicId: 'practice',
      prompt: `Giải thích khái niệm ${topic} và nêu một ví dụ mà bạn tự xây dựng.`,
      options: [], answer: null,
      explanation: 'Nêu định nghĩa trước, sau đó dùng ví dụ để minh họa và liên hệ lại với định nghĩa.',
      rubric: ['Định nghĩa đúng trọng tâm.', 'Ví dụ phù hợp và có giải thích.'],
      source,
    })
  })
  return { courseId, topics: [{ id: 'basics', title: 'Khái niệm' }, { id: 'practice', title: 'Vận dụng' }], questions }
}

let demoPdfUrl: string | undefined
function samplePdf() {
  if (demoPdfUrl) return demoPdfUrl
  const cover = 'BT /F1 28 Tf 60 740 Td (TMU - Local Preview) Tj 0 -45 Td /F1 14 Tf (Synthetic document for PDF reader testing.) Tj ET'
  const page = 'BT /F1 24 Tf 60 740 Td (Page 2 - Source reference) Tj 0 -45 Td /F1 14 Tf (This is a sample page, not TMU course material.) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${cover.length} >>\nstream\n${cover}\nendstream`,
    `<< /Length ${page.length} >>\nstream\n${page}\nendstream`,
  ]
  let content = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((value, index) => {
    offsets.push(content.length)
    content += `${index + 1} 0 obj\n${value}\nendobj\n`
  })
  const xref = content.length
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  content += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  content += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF`
  demoPdfUrl = URL.createObjectURL(new Blob([content], { type: 'application/pdf' }))
  return demoPdfUrl
}

export const demoApi: StudyApi = {
  async catalog() { return { catalog: { courses }, available: materials.map((item) => item.documentId!) } },
  async pack(courseId) { return samplePack(courseId) },
  ...localAttempts(),
  async pdf() { return { url: samplePdf(), expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() } },
  async tutor() {
    return { summary: 'Góp ý minh họa cho bản thử.', strengths: ['Bạn đã gửi câu trả lời.'], improvements: ['Đối chiếu lời giải rồi thử áp dụng vào một ví dụ khác.'] }
  },
}
