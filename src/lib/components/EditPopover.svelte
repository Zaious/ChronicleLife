<script lang="ts">
  /**
   * 列編輯 popover(PLANNING.md §2.5):貼齊被點擊的列展開。
   * 標題即時生效(change);日期/時間欄位改為 blur(focusout)才 commit,並先驗證年份範圍
   * (toLocalIsoValidated)——避免 <input type="date"> 逐字輸入年份時每敲一位數字就觸發
   * change 把任務寫成逾期數萬天,還跟使用者打字互搶焦點;不合法時 inline 顯示錯誤並還原欄位。
   * 分類即時生效;檢查點清單管理;標記完成/刪除任務。
   * Esc 或點擊 popover 外關閉;由呼叫端(Timeline)保證一次只開一個。
   */
  import { onMount, onDestroy } from 'svelte';
  import type { Task, Category } from '../core/types';
  import {
    toLocalIsoValidated,
    isoToLocalParts,
    isCheckpointTimeValid,
    isoToMs,
    todayLocalDateStr,
    MIN_VALID_YEAR,
    MAX_VALID_YEAR,
  } from '../core/timeline';
  import { updateTask, removeTask, toggleTaskDone, addCheckpoint } from '../stores/app';
  import CheckpointItem from './CheckpointItem.svelte';
  import CategoryChips from './CategoryChips.svelte';

  interface Props {
    task: Task;
    categories: Category[];
    /** 目前時間 epoch ms,用於檢查點時間合法範圍判定 */
    nowMs: number;
    /** 被點擊列的 viewport 座標(getBoundingClientRect) */
    anchorTop: number;
    anchorBottom: number;
    onClose: () => void;
  }

  const { task, categories, nowMs, anchorTop, anchorBottom, onClose }: Props = $props();

  let popoverEl: HTMLDivElement | undefined = $state();

  // ---- 標題 / 日期時間(本地緩衝,blur 才 commit 寫入 store)----
  // 日期/時間欄位刻意不用 change 就提交:Chromium 的 <input type="date"> 逐字輸入年份時
  // 每敲一個數字就會發一次 change(例如打「2026」的「2」會先變成 "0002-07-12"),
  // 若照發即寫入會把任務改成逾期數萬天,還跟使用者打字互搶焦點。改成 blur 才 commit,
  // 並在 commit 前驗證年份範圍(toLocalIsoValidated),不合法就顯示錯誤並還原,不寫入。
  let title = $state('');
  let dateStr = $state('');
  let timeStr = $state('');
  let deadlineError = $state('');

  $effect(() => {
    title = task.title;
    const parts = isoToLocalParts(task.deadline);
    dateStr = parts.date;
    timeStr = parts.time;
    deadlineError = '';
  });

  function commitTitle(): void {
    const trimmed = title.trim();
    if (!trimmed) {
      title = task.title;
      return;
    }
    if (trimmed !== task.title) updateTask(task.id, { title: trimmed });
  }

  function resetDeadlineFields(): void {
    const parts = isoToLocalParts(task.deadline);
    dateStr = parts.date;
    timeStr = parts.time;
  }

  function commitDeadline(): void {
    if (!dateStr) {
      resetDeadlineFields();
      deadlineError = '';
      return;
    }
    const iso = toLocalIsoValidated(dateStr, timeStr);
    if (!iso) {
      deadlineError = `年份需介於 ${MIN_VALID_YEAR} ~ ${MAX_VALID_YEAR} 之間`;
      resetDeadlineFields();
      return;
    }
    deadlineError = '';
    if (iso !== task.deadline) updateTask(task.id, { deadline: iso });
  }

  function handleCategoryChange(categoryId: string | null): void {
    updateTask(task.id, { categoryId });
  }

  function handleMarkDone(): void {
    toggleTaskDone(task.id);
    onClose();
  }

  function handleDelete(): void {
    removeTask(task.id);
    onClose();
  }

  // ---- 新增檢查點:日期欄預設今天,方便直接調整 ----
  // 用 Date.now()(而非 nowMs prop)取初值:只需要「開啟當下的今天」,不需要隨 nowMs 更新而重新反應。
  let newLabel = $state('');
  let newDate = $state(todayLocalDateStr(Date.now()));
  let newTime = $state('');
  let addError = $state('');

  function handleAddCheckpoint(event: SubmitEvent): void {
    event.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed || !newDate) {
      addError = '請填寫名稱與日期';
      return;
    }
    const iso = toLocalIsoValidated(newDate, newTime, '23:59');
    if (!iso) {
      addError = `年份需介於 ${MIN_VALID_YEAR} ~ ${MAX_VALID_YEAR} 之間`;
      return;
    }
    const atMs = isoToMs(iso);
    const deadlineMs = isoToMs(task.deadline);
    if (!isCheckpointTimeValid(atMs, nowMs, deadlineMs)) {
      addError = '檢查點時間須介於現在與截止日之間';
      return;
    }
    addCheckpoint(task.id, { label: trimmed, at: iso });
    newLabel = '';
    newDate = todayLocalDateStr(Date.now());
    newTime = '';
    addError = '';
  }

  // ---- 定位:貼齊列,視窗窄時左右滿版,依上下可用空間決定往上或往下展開 ----
  const GAP = 6;
  const MARGIN = 8;

  interface Placement {
    top?: number;
    bottom?: number;
    maxHeight: number;
  }

  const placement = $derived.by((): Placement => {
    const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
    const spaceBelow = winH - anchorBottom - GAP - MARGIN;
    const spaceAbove = anchorTop - GAP - MARGIN;
    if (spaceBelow >= spaceAbove) {
      return { top: anchorBottom + GAP, maxHeight: Math.max(120, spaceBelow) };
    }
    return { bottom: winH - anchorTop + GAP, maxHeight: Math.max(120, spaceAbove) };
  });

  // ---- 關閉:Esc / 點擊外部 ----
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onClose();
  }

  function handleDocumentMousedown(event: MouseEvent): void {
    if (popoverEl && !popoverEl.contains(event.target as Node)) onClose();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousedown', handleDocumentMousedown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousedown', handleDocumentMousedown);
  });
</script>

<div
  class="popover"
  bind:this={popoverEl}
  style:top={placement.top != null ? `${placement.top}px` : undefined}
  style:bottom={placement.bottom != null ? `${placement.bottom}px` : undefined}
  style:max-height="{placement.maxHeight}px"
  role="dialog"
  aria-label="編輯任務"
>
  <input class="field" type="text" bind:value={title} onchange={commitTitle} aria-label="標題" />
  <div class="line">
    <input class="field mono" type="date" bind:value={dateStr} onblur={commitDeadline} aria-label="截止日期" />
    <input class="field mono" type="time" bind:value={timeStr} onblur={commitDeadline} aria-label="截止時間" />
  </div>
  {#if deadlineError}
    <p class="error">{deadlineError}</p>
  {/if}
  <CategoryChips {categories} value={task.categoryId} onchange={handleCategoryChange} />

  <div class="checkpoints">
    <h4 class="h">檢查點</h4>
    {#each task.checkpoints as cp (cp.id)}
      <CheckpointItem taskId={task.id} checkpoint={cp} {nowMs} deadlineMs={isoToMs(task.deadline)} />
    {:else}
      <p class="empty muted">尚無檢查點</p>
    {/each}

    <form class="add-checkpoint" onsubmit={handleAddCheckpoint}>
      <input class="field name" type="text" placeholder="檢查點名稱" bind:value={newLabel} aria-label="新檢查點名稱" />
      <input class="field mono" type="date" bind:value={newDate} aria-label="新檢查點日期" />
      <input class="field mono" type="time" bind:value={newTime} aria-label="新檢查點時間" />
      <button type="submit" class="btn">新增</button>
    </form>
    {#if addError}
      <p class="error">{addError}</p>
    {/if}
  </div>

  <div class="actions">
    <button type="button" class="btn" onclick={handleMarkDone}>標記完成</button>
    <button type="button" class="btn danger" onclick={handleDelete}>刪除任務</button>
  </div>
</div>

<style>
  /* 浮在時間軸上的卡片:實色 panel 底,輸入框退到較深的 background 做成「凹槽」 */
  .popover {
    --field-bg: var(--background);
    position: fixed;
    left: 8px;
    right: 8px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--border) 80%, var(--muted));
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
    animation: cl-rise 0.2s var(--ease-out);
  }

  .line {
    display: flex;
    gap: 6px;
  }

  .line .field {
    flex: 1 1 0;
  }

  .checkpoints {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .checkpoints .empty {
    margin: 2px 0 4px 0;
  }

  .add-checkpoint {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 6px;
    margin-top: 6px;
  }

  .add-checkpoint .name {
    grid-column: 1 / -1;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
</style>
