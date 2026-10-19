<script lang="ts">
  /**
   * 設定面板(PLANNING.md §6):倒數/外觀/版面/行為設定,全部即時生效(updateSettings 已自動持久化)。
   * 分類管理(CategoryManager)附於底部,與設定面板共用同一個滾動容器。
   * 選項一律用分段控制(.seg),不用原生下拉:風格與 Basesmall / SmalLoL 一致,也不會在透明視窗上叫出系統元件。
   */
  import { settings, updateSettings } from '../stores/app';
  import type { RowSpacing, Theme, DockSide, LabelPosition, OverflowDisplay, OverdueStyle } from '../core/types';
  import { backgroundKind, BACKGROUND_PRESETS, type BackgroundKind } from '../core/theme';
  import { setAutostart } from '../shell/autostart';
  import { APP_AUTHOR, APP_REPO_URL, openExternal } from '../shell/links';
  import CategoryManager from './CategoryManager.svelte';

  function openRepo(event: MouseEvent): void {
    event.preventDefault();
    void openExternal(APP_REPO_URL);
  }

  const THRESHOLD_PRESETS = [12, 24, 48] as const;

  const ROW_SPACING_OPTIONS: { value: RowSpacing; label: string }[] = [
    { value: 'compact', label: '緊湊' },
    { value: 'normal', label: '標準' },
    { value: 'loose', label: '寬鬆' },
  ];
  const BACKGROUND_OPTIONS: { value: BackgroundKind; label: string }[] = [
    { value: 'solid', label: '不透明' },
    { value: 'semi', label: '半透明' },
    { value: 'clear', label: '透明' },
  ];
  const THEME_OPTIONS: { value: Theme; label: string }[] = [
    { value: 'system', label: '跟隨系統' },
    { value: 'dark', label: '深色' },
    { value: 'light', label: '淺色' },
  ];
  const DOCK_OPTIONS: { value: DockSide; label: string }[] = [
    { value: 'left', label: '靠左' },
    { value: 'right', label: '靠右' },
  ];
  const LABEL_OPTIONS: { value: LabelPosition; label: string }[] = [
    { value: 'edge', label: '切邊' },
    { value: 'tail', label: '條尾端' },
  ];
  const OVERFLOW_OPTIONS: { value: OverflowDisplay; label: string }[] = [
    { value: 'full', label: '滿條顯示' },
    { value: 'hidden', label: '隱藏' },
  ];
  const OVERDUE_OPTIONS: { value: OverdueStyle; label: string }[] = [
    { value: 'red', label: '紅' },
    { value: 'gray', label: '灰' },
  ];

  const bgKind = $derived(backgroundKind($settings.windowOpacity));

  function setThreshold(hours: number): void {
    if (hours > 0) updateSettings({ countdownThresholdHours: hours });
  }

  function handleCustomThreshold(event: Event): void {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) updateSettings({ countdownThresholdHours: value });
  }

  function handleBlinkChange(event: Event): void {
    updateSettings({ blinkEnabled: (event.currentTarget as HTMLInputElement).checked });
  }

  function handleBarHeightChange(event: Event): void {
    updateSettings({ barHeightPx: Number((event.currentTarget as HTMLInputElement).value) });
  }

  function handleFontSizeChange(event: Event): void {
    updateSettings({ fontSizePx: Number((event.currentTarget as HTMLInputElement).value) });
  }

  function handleOpacityChange(event: Event): void {
    updateSettings({ windowOpacity: Number((event.currentTarget as HTMLInputElement).value) });
  }

  function handleWindowDaysChange(event: Event): void {
    updateSettings({ windowDays: Number((event.currentTarget as HTMLInputElement).value) });
  }

  function handlePinnedChange(event: Event): void {
    updateSettings({ alwaysOnTop: (event.currentTarget as HTMLInputElement).checked });
  }

  /** 切換開機自啟:先更新設定(即持久化),再讓系統實際登錄狀態追上;plugin 呼叫失敗僅記錄,不影響設定值。 */
  function handleAutostartChange(event: Event): void {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    updateSettings({ autostart: checked });
    void setAutostart(checked).catch((err) => {
      console.error('setAutostart failed', err);
    });
  }
</script>

<div class="settings-panel">
  <section>
    <h4 class="h">倒數</h4>
    <div class="row">
      <span class="label">門檻</span>
      <div class="seg">
        {#each THRESHOLD_PRESETS as h (h)}
          <button type="button" aria-pressed={$settings.countdownThresholdHours === h} onclick={() => setThreshold(h)}>
            {h}h
          </button>
        {/each}
      </div>
      <label class="custom">
        <span class="muted">自訂</span>
        <input
          class="field mono num"
          type="number"
          min="1"
          max="720"
          value={$settings.countdownThresholdHours}
          onchange={handleCustomThreshold}
        />
        <span class="muted">h</span>
      </label>
    </div>
    <div class="row">
      <label class="check">
        <input type="checkbox" checked={$settings.blinkEnabled} onchange={handleBlinkChange} />
        閃爍效果
      </label>
    </div>
  </section>

  <section>
    <h4 class="h">外觀</h4>
    <div class="row">
      <span class="label">行距</span>
      <div class="seg">
        {#each ROW_SPACING_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.rowSpacing === o.value} onclick={() => updateSettings({ rowSpacing: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label">條高度</span>
      <input type="range" min="12" max="28" step="1" value={$settings.barHeightPx} oninput={handleBarHeightChange} />
      <span class="value mono">{$settings.barHeightPx}px</span>
    </div>
    <div class="row">
      <span class="label">字體大小</span>
      <input type="range" min="10" max="16" step="1" value={$settings.fontSizePx} oninput={handleFontSizeChange} />
      <span class="value mono">{$settings.fontSizePx}px</span>
    </div>
    <div class="row">
      <span class="label">視窗背景</span>
      <div class="seg">
        {#each BACKGROUND_OPTIONS as o (o.value)}
          <button
            type="button"
            aria-pressed={bgKind === o.value}
            onclick={() => updateSettings({ windowOpacity: BACKGROUND_PRESETS[o.value] })}
          >
            {o.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label" aria-hidden="true"></span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={$settings.windowOpacity}
        oninput={handleOpacityChange}
        aria-label="視窗不透明度"
      />
      <span class="value mono">{Math.round($settings.windowOpacity * 100)}%</span>
    </div>
    <div class="row">
      <span class="label">主題</span>
      <div class="seg">
        {#each THEME_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.theme === o.value} onclick={() => updateSettings({ theme: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h4 class="h">版面</h4>
    <div class="row">
      <span class="label">停靠側</span>
      <div class="seg">
        {#each DOCK_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.dockSide === o.value} onclick={() => updateSettings({ dockSide: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label">標籤位置</span>
      <div class="seg">
        {#each LABEL_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.labelPosition === o.value} onclick={() => updateSettings({ labelPosition: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="label">時間視窗</span>
      <input type="range" min="7" max="90" step="1" value={$settings.windowDays} oninput={handleWindowDaysChange} />
      <span class="value mono">{$settings.windowDays} 天</span>
    </div>
    <div class="row">
      <span class="label">超出視窗</span>
      <div class="seg">
        {#each OVERFLOW_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.overflowDisplay === o.value} onclick={() => updateSettings({ overflowDisplay: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h4 class="h">行為</h4>
    <div class="row">
      <label class="check">
        <input type="checkbox" checked={$settings.alwaysOnTop} onchange={handlePinnedChange} />
        視窗置頂
      </label>
    </div>
    <div class="row">
      <label class="check">
        <input type="checkbox" checked={$settings.autostart} onchange={handleAutostartChange} />
        開機時啟動
      </label>
    </div>
    <div class="row">
      <span class="label">逾期樣式</span>
      <div class="seg">
        {#each OVERDUE_OPTIONS as o (o.value)}
          <button type="button" aria-pressed={$settings.overdueStyle === o.value} onclick={() => updateSettings({ overdueStyle: o.value })}>
            {o.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <CategoryManager />
  </section>

  <section class="about">
    <span class="muted">ChronicleLife · 作者 {APP_AUTHOR}</span>
    <a href={APP_REPO_URL} onclick={openRepo}>原始碼 GitHub</a>
  </section>
</div>

<style>
  .settings-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  section + section {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 26px;
  }

  .label {
    flex: 0 0 64px;
    color: var(--muted);
  }

  .value {
    flex: 0 0 3.6em;
    color: var(--muted);
    font-size: 11.5px;
    text-align: right;
  }

  input[type='range'] {
    flex: 1 1 90px;
    min-width: 70px;
  }

  .custom {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .num {
    width: 58px;
    flex: 0 0 auto;
  }

  .about {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }

  .about a {
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }

  .about a:hover {
    text-decoration: underline;
  }
</style>
