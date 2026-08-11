import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const sourcePath = join(directory, 'standalone-src.dc.html')
const outputPath = join(directory, '星際冒險學院 背景整合版.html')
const assets = [
  'assets/star-academy-lobby.png',
  'assets/floating-crystal-planet.png',
  'assets/starship-observatory.png',
]

for (const asset of assets) {
  if (!existsSync(join(directory, asset))) throw new Error(`缺少背景素材：${asset}`)
}

const source = readFileSync(sourcePath, 'utf8')
const requiredLabels = ['登入', '冒險大廳', 'Boss星戰', '討伐任務', '指揮中心']
for (const label of requiredLabels) {
  if (!source.includes(`data-screen-label="${label}"`)) throw new Error(`找不到畫面標記：${label}`)
}

const marker = '</style></helmet>'
if (!source.includes(marker)) throw new Error('找不到樣式插入位置。')

const backgrounds = `
/* 背景整合版：保留深色遮罩，讓文字與按鈕在不同畫面都清晰易讀。 */
[data-screen-label]{background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;border-radius:24px;padding:24px;box-shadow:inset 0 0 0 1px rgba(190,220,255,.12)}
[data-screen-label="登入"],[data-screen-label="冒險大廳"]{background-image:linear-gradient(90deg,rgba(12,9,42,.78),rgba(12,9,42,.42),rgba(12,9,42,.78)),url("assets/star-academy-lobby.png")!important}
[data-screen-label="Boss星戰"]{background-image:linear-gradient(180deg,rgba(8,9,35,.28),rgba(8,9,35,.74)),url("assets/floating-crystal-planet.png")!important;min-height:calc(100vh - 160px)}
[data-screen-label="討伐任務"],[data-screen-label="指揮中心"],[data-screen-label="家長報告"],[data-screen-label="星際夥伴"],[data-screen-label="排行榜"],[data-screen-label="任務設定"]{background-image:linear-gradient(90deg,rgba(18,18,62,.74),rgba(18,18,62,.38),rgba(18,18,62,.74)),url("assets/starship-observatory.png")!important;min-height:calc(100vh - 160px)}
@media(max-width:700px){[data-screen-label]{border-radius:16px;padding:16px;background-position:center center!important}[data-screen-label="Boss星戰"],[data-screen-label="討伐任務"],[data-screen-label="指揮中心"],[data-screen-label="家長報告"],[data-screen-label="星際夥伴"],[data-screen-label="排行榜"],[data-screen-label="任務設定"]{min-height:calc(100vh - 120px)}}
`

const output = source.replace(marker, `${backgrounds}\n${marker}`)
writeFileSync(outputPath, output, 'utf8')

if (!readFileSync(outputPath, 'utf8').includes('assets/floating-crystal-planet.png')) {
  throw new Error('背景規則寫入失敗。')
}

console.log(`已建立：${outputPath}`)
