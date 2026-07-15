/**
 * HBase Scan 流式扫描 — 步骤生成器
 *
 * 动画展示 Scan 的流式扫描机制：
 *   - Scan 指定 startRow/stopRow 区间
 *   - RegionServer 打开 RegionScanner，服务端扫描 MemStore + HFile
 *   - 按 RowKey 顺序流式返回 KeyValue（ResultScanner 迭代器模式）
 *   - 跨 region 边界自动切换到下一个 region
 *   - KeyValueHeap 归并多个 StoreScanner（region 内 + 跨 region）
 *   - caching 控制每次 RPC 返回行数，减少 RPC 往返
 */
import type { Step, VisualElement, VariableState } from '../types'

/** Scan 流式扫描伪代码 */
export const TEMPLATE_CODE = `// HBase Scan：流式扫描 + 跨 Region 切换
Scan scan = new Scan();
scan.withStartRow("row010");      // 起始行(含)
scan.withStopRow("row020");      // 停止行(不含)
scan.setCaching(100);             // 每次 RPC 返回行数

// 客户端迭代器
ResultScanner scanner = table.getScanner(scan);
for (Result r : scanner) {        // 流式拉取
    consume(r);
}

// 服务端：RegionScanner 扫 MemStore + HFile，按 rowKey 有序
// 跨 Region 边界时由 KeyValueHeap 归并切换
KeyValueHeap heap = new KeyValueHeap(scanners);
while (heap.peek() != null) {
    KeyValue kv = heap.next();   // 归并出最小 rowKey
    if (kv.getRow() >= stopRow) break;
}`

// 画布布局常量
const LAYOUT = {
  client: { x: 40, y: 220, w: 130, h: 70, label: 'Client' },
  rs: { x: 220, y: 210, w: 170, h: 90, label: 'RegionServer' },
  heap: { x: 220, y: 70, w: 170, h: 60, label: 'KeyValueHeap' },
  region1: { x: 440, y: 100, w: 180, h: 70, label: 'Region-1 [row000-row010]' },
  region2: { x: 440, y: 190, w: 180, h: 70, label: 'Region-2 [row010-row020]' },
  region3: { x: 440, y: 280, w: 180, h: 70, label: 'Region-3 [row020-row030]' },
  scanner: { x: 680, y: 190, w: 160, h: 70, label: 'ResultScanner' },
  kv: { x: 870, y: 190, w: 120, h: 70, label: 'KeyValue 流' },
}

function makeElements(highlight?: string): VisualElement[] {
  const mk = (
    key: keyof typeof LAYOUT,
    type: string,
    state: string
  ): VisualElement => {
    const l = LAYOUT[key]
    return {
      id: key,
      type,
      label: l.label,
      x: l.x,
      y: l.y,
      width: l.w,
      height: l.h,
      state: key === highlight ? 'active' : state,
    }
  }
  return [
    mk('client', 'client', 'idle'),
    mk('rs', 'rs', 'idle'),
    mk('heap', 'heap', 'idle'),
    mk('region1', 'region', 'idle'),
    mk('region2', 'region', 'idle'),
    mk('region3', 'region', 'idle'),
    mk('scanner', 'scanner', 'idle'),
    mk('kv', 'kv', 'idle'),
  ]
}

export function generateSteps(): Step[] {
  const steps: Step[] = []
  let idx = 0

  const push = (
    desc: string,
    line: number,
    vars: VariableState[],
    elements: VisualElement[],
    arrows: { from: string; to: string; label?: string }[] = [],
    actionLabel?: string,
    statusText?: string
  ) => {
    steps.push({
      index: idx++,
      description: desc,
      currentLine: line,
      variables: vars,
      elements,
      connections: arrows.map((a, i) => ({
        id: `arrow-${i}`,
        fromId: a.from,
        toId: a.to,
        kind: 'arrow' as const,
        label: a.label,
      })),
      annotations: [],
      actionLabel,
      statusText: statusText ?? desc,
    })
  }

  // 步骤 0：Scan 总览
  push(
    'Scan 流式扫描：startRow/stopRow 区间 → RegionScanner 扫 MemStore+HFile → KeyValueHeap 归并 → 跨 region 切换 → caching 控制 RPC',
    0,
    [],
    makeElements(),
    [
      { from: 'client', to: 'rs', label: 'Scan' },
      { from: 'rs', to: 'heap', label: '归并' },
      { from: 'heap', to: 'region2', label: '扫描' },
      { from: 'scanner', to: 'kv', label: '流式返回' },
    ],
    'SCAN',
    'Scan 总览'
  )

  // 步骤 1：构造 Scan 指定区间
  push(
    '构造 Scan：withStartRow("row010")，withStopRow("row020")，setCaching(100)',
    3,
    [
      { name: 'startRow', value: 'row010', line: 3, type: 'byte[]' },
      { name: 'stopRow', value: 'row020', line: 4, type: 'byte[]' },
      { name: 'caching', value: '100', line: 5, type: 'int' },
    ],
    makeElements('client'),
    [],
    'BUILD_SCAN',
    '构造 Scan (区间+caching)'
  )

  // 步骤 2：打开 ResultScanner
  push(
    'Client 调用 table.getScanner(scan) 打开 ResultScanner，准备流式迭代',
    8,
    [
      { name: 'scanner', value: 'ResultScanner (opened)', line: 8, type: 'ResultScanner' },
      { name: 'caching', value: '100', line: 5, type: 'int' },
    ],
    makeElements('scanner').map((e) =>
      e.id === 'scanner' ? { ...e, state: 'active' } : e
    ),
    [{ from: 'client', to: 'rs', label: '1.getScanner' }],
    'OPEN',
    '打开 ResultScanner'
  )

  // 步骤 3：定位起始 region，RegionScanner 扫 MemStore+HFile
  push(
    'RegionServer 定位 startRow 所属 Region-2，打开 RegionScanner 扫描 MemStore + HFile',
    13,
    [
      { name: 'regionsScanned', value: '1', line: 13, type: 'int' },
      { name: 'currentRegion', value: 'Region-2', line: 13 },
    ],
    makeElements('region2').map((e) =>
      e.id === 'region2' ? { ...e, state: 'active' } : e
    ),
    [{ from: 'rs', to: 'region2', label: '2.定位 Region-2' }],
    'SCAN_REGION2',
    '扫描 Region-2 (MemStore+HFile)'
  )

  // 步骤 4：KeyValueHeap 归并多个 StoreScanner
  push(
    'KeyValueHeap 归并 region 内各 StoreScanner（MemStore scanner + HFile scanner），按 rowKey 有序出队',
    15,
    [
      { name: 'heapSize', value: '3', line: 15, type: 'int' },
      { name: 'heap.peek', value: 'row011', line: 16, type: 'KeyValue' },
    ],
    makeElements('heap').map((e) =>
      e.id === 'heap' ? { ...e, state: 'active' } : e
    ),
    [{ from: 'heap', to: 'region2', label: '3.heap.next()' }],
    'HEAP_MERGE',
    'KeyValueHeap 归并出最小 rowKey'
  )

  // 步骤 5：流式返回 row011~row019
  push(
    '流式返回：heap.next() 依次出 row011, row012, ..., row019（均在 Region-2 内，row<stopRow）',
    16,
    [
      { name: 'kv', value: '[row011..row019]', line: 16, type: 'KeyValue[]' },
      { name: 'caching', value: '100 (RPC 批)', line: 5, type: 'int' },
    ],
    makeElements('kv').map((e) =>
      e.id === 'kv' ? { ...e, state: 'writing' } : e
    ),
    [{ from: 'scanner', to: 'kv', label: '4.流式 row011-019' }],
    'STREAM',
    '流式返回 row011-019'
  )

  // 步骤 6：跨 region 边界切换
  push(
    '到达 Region-2 边界(row020=stopRow 不含)，但 Scan 跨界：切换到 Region-3 继续扫描',
    13,
    [
      { name: 'regionsScanned', value: '2', line: 13, type: 'int' },
      { name: 'currentRegion', value: 'Region-3', line: 13 },
    ],
    makeElements('region3').map((e) => {
      if (e.id === 'region3') return { ...e, state: 'active' }
      if (e.id === 'region2') return { ...e, state: 'done' }
      return e
    }),
    [{ from: 'heap', to: 'region3', label: '5.切换 Region-3' }],
    'SWITCH',
    '跨 Region 边界切换到 Region-3'
  )

  // 步骤 7：到达 stopRow 终止
  push(
    'Region-3 首行 row020 == stopRow（不含），Scan 到达停止行，scanner 迭代结束',
    18,
    [
      { name: 'regionsScanned', value: '3', line: 13, type: 'int' },
      { name: 'kv.getRow', value: 'row020 >= stopRow', line: 17, type: 'KeyValue' },
    ],
    makeElements('region3').map((e) =>
      e.id === 'region3' ? { ...e, state: 'done' } : e
    ),
    [],
    'STOP',
    '到达 stopRow, Scan 结束'
  )

  // 步骤 8：完成
  push(
    'Scan 完成：caching=100 减少 RPC 往返，共扫描 3 个 region，KeyValueHeap 归并保证全局 rowKey 有序',
    0,
    [
      { name: 'startRow', value: 'row010', line: 3, type: 'byte[]' },
      { name: 'stopRow', value: 'row020', line: 4, type: 'byte[]' },
      { name: 'caching', value: '100', line: 5, type: 'int' },
      { name: 'regionsScanned', value: '3', line: 13, type: 'int' },
      { name: 'heapSize', value: '3', line: 15, type: 'int' },
    ],
    makeElements('client').map((e) =>
      e.id === 'client' ? { ...e, state: 'done' } : e
    ),
    [{ from: 'scanner', to: 'client', label: '6.迭代结束' }],
    'DONE',
    'Scan 流式扫描完成'
  )

  return steps
}
