<script lang="ts">
  /**
   * 時間軸單列。純呈現元件:輸入 task + now + settings + 分類色,自行算出
   * 長度比例 / 列模式 / 檢查點狀態(呼叫 core/timeline.ts 的純函式),不碰 store。
   * 規格見 docs/PLANNING.md §2。
   *
   * 視覺:整列是一顆膠囊(文字的底,任何背景上都讀得清);膠囊裡的空間就是整段「時間視窗」,
   * 彩色條是還剩下的部分 —— 條越短、膠囊越空,不需要另外畫刻度。
   */
  import type { Task, Settings } from '../core/types';
  import {
    barRatio,
    checkpointOffsetRatio,
    checkpointState,
    rowMode as computeRowMode,
    overdueDays as computeOverdueDays,
    formatCountdown,
    isoToMs,
    type CheckpointState,
  } from '../core/timeline';
  import { secondNow } from '../stores/secondNow';

  /** 即使剩餘時間趨近於 0,也保留一小截可見殘條 (PLANNING.md §2.1)。 */
  const MIN_BAR_WIDTH_PX = 6;

  /** 檢查點刻線寬度(px):到期的加粗,位置不變。 */
  const TICK_WIDTH_PX: Record<CheckpointState, number> = { upcoming: 2, due: 3, acked: 2 };

  interface Props {
    task: Task;
    /** 目前時間 epoch ms(分鐘級,由 Timeline 的 now store 提供) */
    now: number;
    settings: Settings;
    /** 該任務所屬分類的顯示色(未分類已由呼叫端解析為 UNCATEGORIZED_COLOR) */
    categoryColor: string;
    /** 是否為「下一件」(剩餘時間最短且未逾期),以琥珀色外框標出 */
    isNext?: boolean;
    /** 點擊整列 → 通知呼叫端開啟編輯 popover(PLANNING.md §2.5) */
    onOpen?: (task: Task, rowEl: HTMLElement) => void;
  }

  const { task, now, settings, categoryColor, isNext = false, onOpen }: Props = $props();

  let trackWidth = $state(0);
  /** tail 模式的標籤寬度(含內距),用來判斷標籤放不放得進條尾端之後。 */
  let tailLabelWidth = $state(0);
  let rowEl: HTMLDivElement | undefined = $state();

  const deadlineMs = $derived(isoToMs(task.deadline));
  const mode = $derived(computeRowMode(deadlineMs, now, settings.countdownThresholdHours));

  /**
   * 秒級 tick(CLAUDE.md 硬規則 6):只有在 mode === 'countdown' 時才訂閱 secondNow,
   * 離開倒數模式(或元件卸載)立刻取消訂閱 —— 這是「只有 countdown 列才跑秒級 tick」的實際落點。
   */
  let secondTick = $state<number | null>(null);
  $effect(() => {
    if (mode !== 'countdown') {
      secondTick = null;
      return;
    }
    const unsubscribe = secondNow.subscribe((v) => {
      secondTick = v;
    });
    return () => unsubscribe();
  });

  /** 倒數列用秒級時間計算長度與標籤;其餘列維持分鐘級 now(省電)。 */
  const effectiveNow = $derived(mode === 'countdown' && secondTick != null ? secondTick : now);

  const ratio = $derived(barRatio(deadlineMs, effectiveNow, settings.windowDays));
  const barWidthPx = $derived(Math.max(ratio * trackWidth, MIN_BAR_WIDTH_PX));
  const overdueDaysVal = $derived(mode === 'overdue' ? computeOverdueDays(deadlineMs, now) : 0);
  const isBlinking = $derived(mode === 'countdown' && settings.blinkEnabled);

  function handleRowClick(): void {
    if (rowEl) onOpen?.(task, rowEl);
  }

  function handleRowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick();
    }
  }

  const anchorSide = $derived(settings.dockSide === 'left' ? 'left' : 'right');
  /**
   * 標籤是否為外側(固定於停靠側標籤欄)的 grid 兄弟元素;true = edge 模式。
   * 列本身是 subgrid,貼齊 Timeline 容器定義的共用欄位(標籤欄 = 所有列最寬標籤),
   * 因此所有 track 等寬 → 同 ratio 的條像素等寬且起點切齊 (PLANNING §2.1)。
   */
  const labelIsEdgeSibling = $derived(settings.labelPosition === 'edge');
  /** edge 模式下,標籤應排在 track 之前(dockSide=left)或之後(dockSide=right)。 */
  const edgeLabelBeforeTrack = $derived(settings.labelPosition === 'edge' && settings.dockSide === 'left');
  const edgeLabelAfterTrack = $derived(settings.labelPosition === 'edge' && settings.dockSide === 'right');

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  function formatMD(ms: number): string {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatMDHm(ms: number): string {
    const d = new Date(ms);
    return `${formatMD(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /**
   * tail 模式:標籤放得下就貼在條尾端;放不下(長條)就貼著軌道的另一端,
   * 並自帶底色蓋在條上,不會被擠出視窗。
   */
  const tailLabelOverlaps = $derived(barWidthPx + tailLabelWidth > trackWidth);
  const tailLabelOffsetPx = $derived(
    tailLabelOverlaps ? Math.max(0, trackWidth - tailLabelWidth) : barWidthPx,
  );

  /** 整列的 hover 提示:完整截止時間(標籤只顯示 M/D,年份與時分藏在這裡)。 */
  const rowTitle = $derived(`${task.title} · ${new Date(deadlineMs).getFullYear()}/${formatMDHm(deadlineMs)} 截止`);

  /** 標籤前段(日期 / 倒數 / 逾期天數)與後段(標題)分開渲染:前者等寬字、依模式換色。 */
  const whenText = $derived(
    mode === 'overdue'
      ? `已逾期 ${overdueDaysVal} 天`
      : mode === 'countdown'
        ? formatCountdown(deadlineMs - effectiveNow)
        : formatMD(deadlineMs),
  );

  /** 條色:逾期依設定用「逾期色」或灰;其餘用分類色。以 CSS 變數 --c 傳給樣式。 */
  const barColor = $derived(
    mode === 'overdue' ? (settings.overdueStyle === 'gray' ? 'var(--muted)' : 'var(--strike)') : categoryColor,
  );

  interface CheckpointVisual {
    id: string;
    offsetPx: number;
    state: CheckpointState;
    widthPx: number;
    title: string;
  }

  const checkpointVisuals = $derived.by((): CheckpointVisual[] => {
    const result: CheckpointVisual[] = [];
    for (const cp of task.checkpoints) {
      const cpMs = isoToMs(cp.at);
      const offset = checkpointOffsetRatio(deadlineMs, cpMs, settings.windowDays);
      if (offset == null) continue;
      const state = checkpointState(cp, now);
      const widthPx = TICK_WIDTH_PX[state];
      result.push({
        id: cp.id,
        offsetPx: offset * trackWidth - widthPx / 2,
        state,
        widthPx,
        title: `${cp.label} ${formatMDHm(cpMs)}`,
      });
    }
    return result;
  });
</script>

{#snippet label(tail: boolean)}
  <span
    class="label"
    class:label-tail={tail}
    class:overlap={tail && tailLabelOverlaps}
    bind:clientWidth={tailLabelWidth}
    style:left={tail && anchorSide === 'left' ? `${tailLabelOffsetPx}px` : undefined}
    style:right={tail && anchorSide === 'right' ? `${tailLabelOffsetPx}px` : undefined}
  >
    <span class="when" class:accent={mode === 'countdown'} class:strike={mode === 'overdue'}>{whenText}</span>
    <span class="title">{task.title}</span>
  </span>
{/snippet}

<div
  class="row"
  class:next={isNext}
  class:blink={isBlinking}
  class:edge={labelIsEdgeSibling}
  class:dock-left={settings.dockSide === 'left'}
  class:dock-right={settings.dockSide === 'right'}
  role="button"
  tabindex="0"
  title={rowTitle}
  bind:this={rowEl}
  style:font-size="{settings.fontSizePx}px"
  style:--bar-h="{settings.barHeightPx}px"
  style:--c={barColor}
  onclick={handleRowClick}
  onkeydown={handleRowKeydown}
>
  {#if edgeLabelBeforeTrack}
    {@render label(false)}
  {/if}

  <div class="track" bind:clientWidth={trackWidth}>
    <div class="bar" style="{anchorSide}: 0px; width: {barWidthPx}px;"></div>

    {#each checkpointVisuals as cp (cp.id)}
      <div
        class="tick {cp.state}"
        title={cp.title}
        style="{anchorSide}: {cp.offsetPx}px; width: {cp.widthPx}px;"
      ></div>
    {/each}

    {#if !labelIsEdgeSibling}
      {@render label(true)}
    {/if}
  </div>

  {#if edgeLabelAfterTrack}
    {@render label(false)}
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
    align-items: center;
    min-width: 0;
    min-height: calc(var(--bar-h) + 8px);
    border-radius: 999px;
    background: var(--capsule-bg);
    box-shadow:
      var(--capsule-ring),
      var(--capsule-shadow);
    cursor: pointer;
    animation: cl-rise 0.2s var(--ease-out);
    transition: background-color 0.12s;
  }

  .row:hover {
    background: color-mix(in srgb, var(--capsule-bg) 88%, var(--text));
  }

  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* 下一件:琥珀色細外框 + 淡琥珀底 */
  .row.next {
    background: color-mix(in srgb, var(--accent-fill) 13%, var(--capsule-bg));
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--accent-fill) 50%, transparent),
      var(--capsule-shadow);
  }

  .row.next:hover {
    background: color-mix(in srgb, var(--accent-fill) 19%, var(--capsule-bg));
  }

  .row.next .title {
    font-weight: 600;
  }

  /* 「閃爍效果」:琥珀色內縮環明滅(只有倒數列、且使用者開啟才會動) */
  .row.blink {
    box-shadow:
      inset 0 0 0 1.5px var(--accent-fill),
      var(--capsule-shadow);
    animation:
      cl-rise 0.2s var(--ease-out),
      cl-turn 1.2s ease-in-out 0.2s infinite;
  }

  .track {
    position: relative;
    min-width: 0;
    height: var(--bar-h);
    margin: 0 4px;
  }

  .bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--c) 84%, #fff), var(--c));
    box-shadow:
      inset 0 -2px 0 rgb(0 0 0 / 0.22),
      0 1px 2px rgb(0 0 0 / 0.28);
  }

  /* 檢查點刻線:白色 + 細黑邊,在任何分類色與膠囊底上都看得見 */
  .tick {
    position: absolute;
    top: -3px;
    height: calc(100% + 6px);
    border-radius: 1px;
    background: #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.45);
  }

  .tick.acked {
    opacity: 0.35;
  }

  .tick.due {
    --glow: var(--strike);
    background: var(--strike);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.85);
    animation: cl-glow 1.2s ease-out;
  }

  .label {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    white-space: nowrap;
  }

  .row.edge.dock-right .label {
    padding: 0 12px 0 8px;
  }

  .row.edge.dock-left .label {
    padding: 0 8px 0 12px;
  }

  /* 標籤跟在條尾端:直接坐在膠囊(軌道)上 */
  .label-tail {
    position: absolute;
    top: 50%;
    width: max-content;
    padding: 0 8px;
    transform: translateY(-50%);
  }

  /* 長條放不下標籤時,標籤蓋在條上:自帶實色底,不靠條色撐對比 */
  .label-tail.overlap {
    height: calc(100% - 4px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--panel) 94%, transparent);
    box-shadow:
      0 0 0 1px var(--border),
      var(--capsule-shadow);
  }

  .when {
    flex: 0 0 auto;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 0.92em;
  }

  .when.accent {
    color: var(--accent);
    font-weight: 600;
  }

  .when.strike {
    color: var(--strike);
  }

  .title {
    min-width: 0;
    max-width: 13em;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
