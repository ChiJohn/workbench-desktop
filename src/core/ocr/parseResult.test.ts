import { describe, expect, it } from 'vitest'
import { parseOcrResult } from './parseResult'

describe('parseOcrResult', () => {
  it('reads the last JSON object in the body', () => {
    expect(parseOcrResult('boot\n{"text":"你好","meaning":"","error":""}\n')).toEqual({
      text: '你好',
      meaning: '',
      error: undefined
    })
  })

  it('keeps a non-empty error string', () => {
    expect(parseOcrResult('{"text":"","meaning":"","error":"文字识别失败：x"}')).toEqual({
      text: '',
      meaning: '',
      error: '文字识别失败：x'
    })
  })
})
