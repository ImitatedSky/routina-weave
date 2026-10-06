import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/react'

// 整套測試平行跑時 IndexedDB 的來回比較慢，findBy / waitFor 預設 1 秒不夠
configure({ asyncUtilTimeout: 4000 })
