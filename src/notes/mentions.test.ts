import { describe, expect, it } from 'vitest'
import { findLinkMention, findUnlinkedMention, linkMention, snippetAt } from './mentions'

function textAt(body: string, m: { index: number; length: number } | null) {
  return m ? body.slice(m.index, m.index + m.length) : null
}

describe('findLinkMention', () => {
  it('找到第一個指向標題的連結，含別名、不分大小寫', () => {
    const body = '先看 [[其他]]，再看 [[weave|這個 App]] 和 [[Weave]]'
    expect(textAt(body, findLinkMention(body, 'Weave'))).toBe('[[weave|這個 App]]')
  })

  it('略過程式碼裡的連結', () => {
    const body = '`[[Weave]]`\n```\n[[Weave]]\n```\n真的 [[Weave]]'
    const m = findLinkMention(body, 'Weave')
    expect(m?.index).toBe(body.lastIndexOf('[[Weave]]'))
  })

  it('沒有就回傳 null', () => {
    expect(findLinkMention('[[Other]]', 'Weave')).toBeNull()
  })
})

describe('findUnlinkedMention', () => {
  it('找到沒加 [[ ]] 的提及，已經是連結的不算', () => {
    const body = '[[讀書筆記]] 之後整理成讀書筆記'
    const m = findUnlinkedMention(body, '讀書筆記')
    expect(m?.index).toBe(body.lastIndexOf('讀書筆記'))
  })

  it('中文直接比對子字串', () => {
    expect(findUnlinkedMention('我喜歡寫作的感覺', '寫作')).toEqual({ index: 3, length: 2 })
  })

  it('英文要整個字相符，不分大小寫', () => {
    expect(findUnlinkedMention('category', 'cat')).toBeNull()
    expect(textAt('My Cat sleeps', findUnlinkedMention('My Cat sleeps', 'cat'))).toBe('Cat')
    expect(findUnlinkedMention('看 Weave的介紹', 'weave')).not.toBeNull()
  })

  it('標題少於 2 個字不找', () => {
    expect(findUnlinkedMention('我我我', '我')).toBeNull()
    expect(findUnlinkedMention('a b', ' a ')).toBeNull()
  })

  it('略過程式碼、網址、標籤與連結別名', () => {
    const body = '`Weave` https://weave.app [網站](https://x.com/weave) #weave [[其他|weave]]'
    expect(findUnlinkedMention(body, 'weave')).toBeNull()
  })

  it('markdown 連結的文字部分算提及', () => {
    const body = '[Weave 官網](https://x.com)'
    expect(findUnlinkedMention(body, 'Weave')).toEqual({ index: 1, length: 5 })
  })
})

describe('linkMention', () => {
  it('只改第一個提及', () => {
    expect(linkMention('寫作很好，寫作很難', '寫作')).toBe('[[寫作]]很好，寫作很難')
  })

  it('大小寫不同時保留原文當別名', () => {
    expect(linkMention('i use weave daily', 'Weave')).toBe('i use [[Weave|weave]] daily')
  })

  it('找不到時回傳原字串', () => {
    const body = '已經是 [[寫作]]'
    expect(linkMention(body, '寫作')).toBe(body)
  })
})

describe('snippetAt', () => {
  it('取提及所在的那一行', () => {
    const body = '第一行\n  - 這裡提到 [[A]] 了  \n第三行'
    const s = snippetAt(body, findLinkMention(body, 'A')!)
    expect(s).toEqual({ before: '- 這裡提到 ', match: '[[A]]', after: ' 了' })
  })

  it('開頭就是提及', () => {
    expect(snippetAt('[[A]]', { index: 0, length: 5 })).toEqual({ before: '', match: '[[A]]', after: '' })
  })

  it('太長時前後截掉', () => {
    const body = `${'前'.repeat(40)}[[A]]${'後'.repeat(80)}`
    const s = snippetAt(body, findLinkMention(body, 'A')!)
    expect(s.before).toBe('…' + '前'.repeat(30))
    expect(s.after).toBe('後'.repeat(60) + '…')
  })
})
