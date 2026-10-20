import { describe, expect, it } from 'vitest'
import type { Note } from '@/notes/types'
import {
  attachmentFilename,
  attachmentType,
  attachmentsUsedBy,
  conflictCopy,
  planAttachments,
  planNotes,
  resolveMerge,
  sameContent,
} from './plan'
import type { DriveFile, SyncState } from './types'

function note(id: string, fields: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    body: '',
    parent: null,
    order: 0,
    tags: [],
    props: {},
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...fields,
  }
}

function file(id: string, weaveId: string, modifiedTime = 'm1', kind = 'note'): DriveFile {
  return { id, name: `${weaveId}.md`, modifiedTime, appProperties: { weaveKind: kind, weaveId } }
}

function state(notes: SyncState['notes'] = {}): SyncState {
  return { notes, attachments: {} }
}

const T1 = '2026-01-01T00:00:00.000Z'
const T2 = '2026-01-02T00:00:00.000Z'

describe('planNotes', () => {
  it('沒有紀錄：只有本機的建立、只有雲端的下載、兩邊都有的要比內容', () => {
    const { actions } = planNotes(
      { a: note('a'), c: note('c') },
      [file('f-b', 'b'), file('f-c', 'c')],
      state(),
    )
    expect(actions).toEqual([
      { kind: 'create', id: 'a' },
      { kind: 'merge', id: 'c', file: file('f-c', 'c') },
      { kind: 'download', id: 'b', file: file('f-b', 'b') },
    ])
  })

  it('三方比對：誰改過就往另一邊送，兩邊都改是 merge，都沒改不用動', () => {
    const synced = (fileId: string) => ({ fileId, remoteModified: 'm1', localUpdated: T1 })
    const { actions } = planNotes(
      {
        same: note('same'),
        local: note('local', { updated: T2 }),
        remote: note('remote'),
        both: note('both', { updated: T2 }),
      },
      [file('f1', 'same'), file('f2', 'local'), file('f3', 'remote', 'm2'), file('f4', 'both', 'm2')],
      state({ same: synced('f1'), local: synced('f2'), remote: synced('f3'), both: synced('f4') }),
    )
    expect(actions.map((a) => [a.kind, a.id])).toEqual([
      ['upload', 'local'],
      ['download', 'remote'],
      ['merge', 'both'],
    ])
  })

  it('紀錄裡的檔不見、換成同 weaveId 的別的檔：算雲端改過，就算 modifiedTime 剛好一樣', () => {
    const synced = { fileId: 'old', remoteModified: 'm1', localUpdated: T1 }
    const { actions } = planNotes({ a: note('a') }, [file('new', 'a', 'm1')], state({ a: synced }))
    expect(actions).toEqual([{ kind: 'download', id: 'a', file: file('new', 'a', 'm1') }])
  })

  it('本機刪除：雲端沒改就丟垃圾桶，雲端改過就救回來', () => {
    const synced = (fileId: string) => ({ fileId, remoteModified: 'm1', localUpdated: T1 })
    const { actions } = planNotes({}, [file('f1', 'a'), file('f2', 'b', 'm2')], state({ a: synced('f1'), b: synced('f2') }))
    expect(actions.map((a) => [a.kind, a.id])).toEqual([
      ['trashRemote', 'a'],
      ['download', 'b'],
    ])
  })

  it('雲端刪除：本機沒改就刪本機，本機改過就重新建立；兩邊都沒了只清紀錄', () => {
    const synced = { fileId: 'f', remoteModified: 'm1', localUpdated: T1 }
    const { actions } = planNotes(
      { a: note('a'), b: note('b', { updated: T2 }) },
      [],
      state({ a: synced, b: synced, c: synced }),
    )
    expect(actions.map((a) => [a.kind, a.id])).toEqual([
      ['removeLocal', 'a'],
      ['create', 'b'],
      ['forget', 'c'],
    ])
  })

  it('沒有 weaveId 的 .md 列為 untracked，其他檔案（資料夾、圖片）不理', () => {
    const plain: DriveFile = { id: 'x', name: '自己丟的.md', modifiedTime: 'm1' }
    const folder: DriveFile = { id: 'y', name: '_attachments', modifiedTime: 'm1', appProperties: { weaveKind: 'attachments' } }
    const image: DriveFile = { id: 'z', name: 'a.jpg', modifiedTime: 'm1' }
    const plan = planNotes({}, [plain, folder, image], state())
    expect(plan.actions).toEqual([])
    expect(plan.untracked).toEqual([plain])
  })

  it('同一個 weaveId 有兩個檔時用紀錄裡那個，多的那個不當成雲端改過', () => {
    const synced = { fileId: 'f1', remoteModified: 'm1', localUpdated: T1 }
    const { actions } = planNotes({ a: note('a') }, [file('f2', 'a', 'm9'), file('f1', 'a')], state({ a: synced }))
    expect(actions).toEqual([{ kind: 'duplicate', id: 'a', file: file('f2', 'a', 'm9'), canonical: file('f1', 'a') }])
  })

  it('沒有紀錄時最新的當正本，其他的是重複檔', () => {
    const { actions } = planNotes({}, [file('f1', 'a', 'm1'), file('f3', 'a', 'm3'), file('f2', 'a', 'm2')], state())
    expect(actions).toEqual([
      { kind: 'download', id: 'a', file: file('f3', 'a', 'm3') },
      { kind: 'duplicate', id: 'a', file: file('f2', 'a', 'm2'), canonical: file('f3', 'a', 'm3') },
      { kind: 'duplicate', id: 'a', file: file('f1', 'a', 'm1'), canonical: file('f3', 'a', 'm3') },
    ])
  })

  it('本機刪了：正本和重複檔都丟垃圾桶，重複檔較新也不會把筆記救回來', () => {
    const synced = { fileId: 'f1', remoteModified: 'm1', localUpdated: T1 }
    const { actions } = planNotes({}, [file('f1', 'a'), file('f2', 'a', 'm9')], state({ a: synced }))
    expect(actions).toEqual([{ kind: 'trashRemote', id: 'a', file: file('f1', 'a'), duplicates: [file('f2', 'a', 'm9')] }])
  })
})

describe('resolveMerge', () => {
  const now = new Date(2026, 9, 21, 14, 5)

  it('只有 updated 不同時不算衝突', () => {
    expect(sameContent(note('a', { updated: T1 }), note('a', { updated: T2 }))).toBe(true)
    expect(resolveMerge(note('a', { updated: T1 }), note('a', { updated: T2 }), now)).toEqual({ kind: 'same' })
  })

  it('updated 較新的當正本，另一份另存衝突副本（新 id、同 parent）', () => {
    const local = note('a', { title: '日記', body: '本機', parent: 'p', updated: T2 })
    const remote = note('a', { title: '日記', body: '雲端', parent: 'p', updated: T1 })
    const result = resolveMerge(local, remote, now)
    expect(result.kind).toBe('keepLocal')
    const copy = (result as { copy: Note }).copy
    expect(copy.id).not.toBe('a')
    expect(copy.body).toBe('雲端')
    expect(copy.parent).toBe('p')
    expect(copy.title).toBe('日記（衝突副本 2026-10-21 14:05）')

    expect(resolveMerge({ ...local, updated: T1 }, { ...remote, updated: T2 }, now)).toMatchObject({
      kind: 'keepRemote',
      copy: { body: '本機' },
    })
  })

  it('衝突副本不帶釘選', () => {
    expect(conflictCopy(note('a', { pinned: true }), null, now).pinned).toBeUndefined()
  })
})

describe('附件', () => {
  it('attachmentsUsedBy 包含縮圖、封面、內文圖片與連結卡片縮圖', () => {
    const n = note('a', {
      image: 'img',
      cover: 'cov',
      body: '![](_attachments/body1.jpg)\n\n```cardlink\nurl: https://a.com\nthumbnail: card1\n```',
    })
    expect(attachmentsUsedBy(n).sort()).toEqual(['body1', 'card1', 'cov', 'img'])
    expect(attachmentsUsedBy(note('b', { cover: 'preset:ocean' }))).toEqual([])
  })

  it('只處理有筆記在用的：本機有雲端沒有的上傳、雲端有本機沒有的下載', () => {
    const notes = { a: note('a', { image: 'up', cover: 'down', body: '![](_attachments/both.jpg)' }) }
    const files = [file('r1', 'down', 'm1', 'attachment'), file('r2', 'both', 'm1', 'attachment'), file('r3', 'unused', 'm1', 'attachment')]
    const plan = planAttachments(notes, new Set(['up', 'both', 'orphan']), files, state())
    expect(plan.upload).toEqual(['up'])
    expect(plan.download.map((f) => f.id)).toEqual(['r1'])
    expect(plan.known).toEqual({ both: 'r2' })
  })

  it('檔名與型別', () => {
    expect(attachmentFilename('abc', 'image/jpeg')).toBe('abc.jpg')
    expect(attachmentFilename('abc', 'application/x-weird')).toBe('abc.bin')
    expect(attachmentType({ id: '1', name: 'abc.png', modifiedTime: '' })).toBe('image/png')
    expect(attachmentType({ id: '1', name: 'abc.JPEG', modifiedTime: '' })).toBe('image/jpeg')
    expect(attachmentType({ id: '1', name: 'abc.bin', modifiedTime: '', mimeType: 'image/svg+xml' })).toBe('application/octet-stream')
  })
})
