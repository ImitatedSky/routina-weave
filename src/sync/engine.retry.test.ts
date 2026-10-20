import { describe, expect, it } from 'vitest'
import { fromMarkdown, toMarkdown } from '@/notes/markdown'
import type { Note } from '@/notes/types'
import { syncOnce } from './engine'
import { FakeDrive } from './fakeDrive'
import type { LocalStore, SyncState } from './types'

/** 最簡單的記憶體本機，只測「存好副本後下一步失敗」的重試 */
class Device implements LocalStore {
  data: Record<string, Note> = {}
  state: SyncState = { notes: {}, attachments: {} }
  notes() {
    return this.data
  }
  async upsert(notes: Note[]) {
    this.data = { ...this.data, ...Object.fromEntries(notes.map((n) => [n.id, n])) }
  }
  async remove(ids: string[]) {
    this.data = { ...this.data }
    for (const id of ids) delete this.data[id]
  }
  async allAttachments() {
    return []
  }
  async getAttachment() {
    return undefined
  }
  async putAttachment() {}
  async loadState() {
    return JSON.parse(JSON.stringify(this.state)) as SyncState
  }
  async saveState(state: SyncState) {
    this.state = JSON.parse(JSON.stringify(state)) as SyncState
  }
}

let clock = Date.parse('2026-03-01T00:00:00Z')
const stamp = () => new Date((clock += 1000)).toISOString()
const netError = () => Object.assign(new Error('net'), { name: 'NetworkError' })

async function bothEdited() {
  const drive = new FakeDrive()
  const device = new Device()
  const t = stamp()
  await device.upsert([{ id: 'n1', title: 'n1', body: 'v0', parent: null, order: 0, tags: [], props: {}, created: t, updated: t }])
  await syncOnce(drive, device)
  const file = drive.findNote('n1')!
  const remote = fromMarkdown(await drive.textOf(file.id))!
  return { drive, device, file, remote }
}

const copiesOf = (device: Device) => Object.values(device.data).filter((n) => n.title.includes('衝突副本'))

describe('存好衝突副本後下一步失敗', () => {
  it('本機較新、上傳一直失敗：重試時不會再多存副本', async () => {
    const { drive, device, file, remote } = await bothEdited()
    drive.editExternal(file.id, toMarkdown({ ...remote, body: 'remote', updated: stamp() }))
    await device.upsert([{ ...device.data.n1, body: 'local', updated: stamp() }])
    for (let i = 0; i < 3; i++) {
      drive.failOn('update', netError())
      await syncOnce(drive, device).catch(() => {})
    }
    await syncOnce(drive, device)
    expect(copiesOf(device).map((n) => n.body)).toEqual(['remote'])
    expect(fromMarkdown(await drive.textOf(file.id))!.body).toBe('local')
  })
})
