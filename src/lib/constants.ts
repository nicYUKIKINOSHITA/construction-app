export const WORKFLOW_STEPS = [
  { number: 1, label: '受注・見積確認' },
  { number: 2, label: '図面・数量確認' },
  { number: 3, label: '作図資料受領' },
  { number: 4, label: '作図依頼' },
  { number: 5, label: '色見本提出' },
  { number: 6, label: '図面送付（→ゼネコン）' },
  { number: 7, label: 'チェックバック受領' },
  { number: 8, label: '修正依頼（→業者）' },
  { number: 9, label: '修正確認・図面送付' },
  { number: 10, label: '承認・製作依頼' },
  { number: 11, label: '施工打合せ' },
  { number: 12, label: '現場確認' },
] as const;

export const SUB_STEPS_12 = [
  { subStep: 1, label: '前工程完了' },
  { subStep: 2, label: '搬入経路確認' },
  { subStep: 3, label: 'クレーン・EV段取り' },
  { subStep: 4, label: '資材置場確認' },
  { subStep: 5, label: '干渉物確認' },
  { subStep: 6, label: '足場確認' },
] as const;

export const STOP_REASONS = [
  'ゼネコン返答待ち',
  '業者返答待ち',
  '資料不足',
  '前工程未完了',
  '施主確認待ち',
  '社内確認中',
] as const;

// Total checks per item: steps 1-11 + step 12 sub-steps
export const CHECKS_PER_ITEM = (WORKFLOW_STEPS.length - 1) + SUB_STEPS_12.length;
