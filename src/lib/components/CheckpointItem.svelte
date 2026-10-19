<script lang="ts">
  /**
   * 編輯 popover 內的單一檢查點列:名稱、日期時間、ack 打勾、移除。
   * 日期/時間欄位 blur(focusout)才 commit(避免 <input type="date"> 逐字輸入年份時
   * 每敲一位數字就觸發 change 寫入);commit 前先驗證年份範圍(toLocalIsoValidated),
   * 再通過 isCheckpointTimeValid(現在~截止日)才寫入 store,任一不合法都 inline 顯示錯誤
   * 並還原欄位(PLANNING.md §2.4)。
   */
  import type { Checkpoint } from '../core/types';
  import {
    toLocalIsoValidated,
    isoToLocalParts,
    isCheckpointTimeValid,
    isoToMs,
    MIN_VALID_YEAR,
    MAX_VALID_YEAR,
  } from '../core/timeline';
  import { updateCheckpoint, removeCheckpoint } from '../stores/app';

  interface Props {
    taskId: string;
    checkpoint: Checkpoint;
    /** 目前時間 epoch ms */
    nowMs: number;
    /** 所屬任務的截止日 epoch ms */
    deadlineMs: number;
  }

  const { taskId, checkpoint, nowMs, deadlineMs }: Props = $props();

  let label = $state('');
  let dateStr = $state('');
  let timeStr = $state('');
  let error = $state('');

  /** checkpoint 內容變動(含我方自己 commit 後的回灌)時,重新同步本地編輯緩衝。 */
  $effect(() => {
    label = checkpoint.label;
    const parts = isoToLocalParts(checkpoint.at);
    dateStr = parts.date;
    timeStr = parts.time;
    error = '';
  });

  function resetTime(): void {
    const parts = isoToLocalParts(checkpoint.at);
    dateStr = parts.date;
    timeStr = parts.time;
  }

  function commitLabel(): void {
    const trimmed = label.trim();
    if (!trimmed) {
      label = checkpoint.label;
      return;
    }
    if (trimmed !== checkpoint.label) updateCheckpoint(taskId, checkpoint.id, { label: trimmed });
  }

  function commitTime(): void {
    if (!dateStr || !timeStr) {
      error = '請填寫日期與時間';
      resetTime();
      return;
    }
    const iso = toLocalIsoValidated(dateStr, timeStr);
    if (!iso) {
      error = `年份需介於 ${MIN_VALID_YEAR} ~ ${MAX_VALID_YEAR} 之間`;
      resetTime();
      return;
    }
    const atMs = isoToMs(iso);
    if (!isCheckpointTimeValid(atMs, nowMs, deadlineMs)) {
      error = '檢查點時間須介於現在與截止日之間';
      resetTime();
      return;
    }
    error = '';
    if (iso !== checkpoint.at) updateCheckpoint(taskId, checkpoint.id, { at: iso });
  }

  function handleAckChange(event: Event): void {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    updateCheckpoint(taskId, checkpoint.id, { acked: checked });
  }

  function handleRemove(): void {
    removeCheckpoint(taskId, checkpoint.id);
  }
</script>

<div class="checkpoint-item">
  <div class="row1">
    <input
      type="checkbox"
      checked={checkpoint.acked}
      onchange={handleAckChange}
      aria-label="確認檢查點"
      title="確認"
    />
    <input
      class="field label-input"
      type="text"
      bind:value={label}
      onchange={commitLabel}
      aria-label="檢查點名稱"
    />
    <button type="button" class="icon-btn" onclick={handleRemove} aria-label="移除檢查點" title="移除">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
    </button>
  </div>
  <div class="row2">
    <input class="field mono" type="date" bind:value={dateStr} onblur={commitTime} aria-label="檢查點日期" />
    <input class="field mono" type="time" bind:value={timeStr} onblur={commitTime} aria-label="檢查點時間" />
  </div>
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .checkpoint-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .row1,
  .row2 {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label-input {
    flex: 1 1 auto;
  }

  /* 日期/時間縮排到標籤下方,與勾選框欄對齊 */
  .row2 {
    padding-left: 20px;
  }

  .row2 .field {
    flex: 1 1 0;
  }

  .error {
    padding-left: 20px;
  }
</style>
