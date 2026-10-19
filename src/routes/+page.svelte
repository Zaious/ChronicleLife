<script lang="ts">
  /**
   * 組裝層:啟動流程還原視窗位置/停靠、頂部握把(hover 才出現的控制列)、
   * 管理面板(TaskForm / SettingsPanel)、Timeline 主體。
   * 邏輯不寫這裡 — 排序/長度計算在 core,CRUD 在 stores,視窗行為在 shell。
   * 視覺 token 由 core/theme.ts 提供,在這裡依主題與視窗不透明度算成 CSS 變數注入 .shell。
   */
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { invoke } from '@tauri-apps/api/core';
  import { dockTo, setPinned, onWindowMoved, setWindowPos } from '$lib/shell/window';
  import { syncAutostart } from '$lib/shell/autostart';
  import { initStores, settings, updateSettings } from '$lib/stores/app';
  import { degraded } from '$lib/stores/persistence';
  import type { DockSide } from '$lib/core/types';
  import { PALETTES, rgba, capsuleAlpha, backgroundKind } from '$lib/core/theme';
  import Timeline from '$lib/components/Timeline.svelte';
  import TaskForm from '$lib/components/TaskForm.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';

  let ready = $state(false);
  /** 「+」(新增任務)與設定兩個頂部面板互斥,同時只開一個。 */
  let activePanel = $state<'none' | 'add' | 'settings'>('none');
  let unlistenMoved: (() => void) | null = null;
  let systemPrefersLight = $state(false);

  // 用來偵測「使用者變更了設定」而非「啟動時的初始值」,避免啟動流程與 $effect 重複呼叫。
  let previousAlwaysOnTop: boolean | null = null;
  let previousDockSide: DockSide | null = null;

  onMount(() => {
    void (async () => {
      await initStores();
      const s = get(settings);
      if (s.windowPos) {
        await setWindowPos(s.windowPos.x, s.windowPos.y);
      } else {
        await dockTo(s.dockSide);
      }
      await setPinned(s.alwaysOnTop);
      unlistenMoved = await onWindowMoved((pos) => updateSettings({ windowPos: pos }));
      // 開機自啟:讓系統實際登錄狀態追上 settings.autostart(可能因手動改機碼、或上次設定未成功套用而不一致)。
      syncAutostart(s.autostart).catch((err) => {
        console.error('syncAutostart failed', err);
      });
      ready = true;
    })();
  });

  onDestroy(() => {
    unlistenMoved?.();
  });

  // 設定即時生效 (CLAUDE.md 硬規則 5):alwaysOnTop / dockSide 之後的任何變更都同步到實際視窗狀態。
  $effect(() => {
    const alwaysOnTop = $settings.alwaysOnTop;
    if (ready && previousAlwaysOnTop !== null && previousAlwaysOnTop !== alwaysOnTop) {
      void setPinned(alwaysOnTop);
    }
    previousAlwaysOnTop = alwaysOnTop;
  });

  $effect(() => {
    const dockSide = $settings.dockSide;
    if (ready && previousDockSide !== null && previousDockSide !== dockSide) {
      void dockTo(dockSide);
    }
    previousDockSide = dockSide;
  });

  // 主題:system 時跟隨 prefers-color-scheme,並在系統偏好變更時即時反映 (PLANNING.md §6)。
  $effect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    systemPrefersLight = mq.matches;
    const handleChange = (e: MediaQueryListEvent) => {
      systemPrefersLight = e.matches;
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  });

  const effectiveThemeMode = $derived<'dark' | 'light'>(
    $settings.theme === 'system' ? (systemPrefersLight ? 'light' : 'dark') : $settings.theme,
  );

  const palette = $derived(PALETTES[effectiveThemeMode]);
  const windowOpacity = $derived($settings.windowOpacity);
  const bgKind = $derived(backgroundKind(windowOpacity));

  /** 視窗底色隨「視窗不透明度」變透;面板與彈出卡片另用實色底,不隨它變透。 */
  const shellBg = $derived(rgba(palette.background, windowOpacity));
  const shellBorder = $derived(
    bgKind === 'solid' ? palette.border : bgKind === 'semi' ? rgba(palette.border, 0.6) : 'transparent',
  );
  /**
   * 膠囊是文字的底:視窗越透明,膠囊越實(capsuleAlpha),任何桌布或網頁上都讀得清,
   * 取代舊版「每個標籤各墊一塊色塊 + 文字陰影」的補丁。
   */
  const capsuleBg = $derived(rgba(palette.panel, capsuleAlpha(windowOpacity)));
  /** 實底時不需要陰影;用「零陰影」而非 none,才能在 box-shadow 清單裡與其他陰影並列。 */
  const capsuleShadow = $derived(bgKind === 'solid' ? '0 0 0 0 transparent' : `0 1px 3px ${palette.shadow}`);
  /** 膠囊的髮絲外框:讓「軌道」的範圍在實底上也看得出來(膠囊與視窗底只差一點點色差)。 */
  const capsuleRing = $derived(`inset 0 0 0 1px ${rgba(palette.border, bgKind === 'solid' ? 0.9 : 0.55)}`);

  function togglePinned(): void {
    updateSettings({ alwaysOnTop: !$settings.alwaysOnTop });
  }

  function toggleAddPanel(): void {
    activePanel = activePanel === 'add' ? 'none' : 'add';
  }

  function toggleSettingsPanel(): void {
    activePanel = activePanel === 'settings' ? 'none' : 'settings';
  }

  /** 避免點擊握把上的按鈕時,mousedown 冒泡觸發 data-tauri-drag-region 開始拖曳視窗。 */
  function stopDrag(event: MouseEvent): void {
    event.stopPropagation();
  }

  /** 完全退出應用程式(非隱藏)——托盤選單「離開」以外,握把列也提供一個直接入口。 */
  function handleQuit(): void {
    void invoke('quit_app').catch((err) => {
      console.error('quit_app failed', err);
    });
  }
</script>

<main
  class="shell"
  data-bg={bgKind}
  data-panel={activePanel !== 'none' ? activePanel : undefined}
  style:color-scheme={effectiveThemeMode}
  style:color={palette.text}
  style:--background={palette.background}
  style:--panel={palette.panel}
  style:--border={palette.border}
  style:--text={palette.text}
  style:--muted={palette.muted}
  style:--accent={palette.accent}
  style:--accent-fill={palette.accentFill}
  style:--strike={palette.strike}
  style:--shell-bg={shellBg}
  style:--shell-border={shellBorder}
  style:--capsule-bg={capsuleBg}
  style:--capsule-shadow={capsuleShadow}
  style:--capsule-ring={capsuleRing}
>
  <div class="handle" data-tauri-drag-region>
    <span class="wordmark">ChronicleLife</span>
    <div class="actions" role="toolbar" aria-label="視窗操作" tabindex="-1" onmousedown={stopDrag}>
      <button
        type="button"
        class="icon-btn"
        aria-pressed={$settings.alwaysOnTop}
        aria-label={$settings.alwaysOnTop ? '取消置頂' : '置頂'}
        title={$settings.alwaysOnTop ? '取消置頂' : '置頂'}
        onclick={togglePinned}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h9M8 13.5V6M5 8.5l3-3 3 3" /></svg>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-pressed={activePanel === 'add'}
        aria-label={activePanel === 'add' ? '收合新增任務面板' : '新增任務'}
        title={activePanel === 'add' ? '收合新增任務面板' : '新增任務'}
        onclick={toggleAddPanel}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          {#if activePanel === 'add'}
            <path d="M3.5 8h9" />
          {:else}
            <path d="M8 3.5v9M3.5 8h9" />
          {/if}
        </svg>
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-pressed={activePanel === 'settings'}
        aria-label={activePanel === 'settings' ? '收合設定面板' : '設定'}
        title={activePanel === 'settings' ? '收合設定面板' : '設定'}
        onclick={toggleSettingsPanel}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6" />
          <circle cx="10" cy="5" r="1.5" />
          <circle cx="6" cy="11" r="1.5" />
        </svg>
      </button>
      <button type="button" class="icon-btn" aria-label="離開 ChronicleLife" title="離開 ChronicleLife" onclick={handleQuit}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    </div>
  </div>

  {#if $degraded}
    <div class="degraded" role="alert">資料檔讀取失敗,已進入唯讀模式,重啟後重試</div>
  {/if}

  {#if activePanel === 'add'}
    <div class="panel">
      <TaskForm />
    </div>
  {:else if activePanel === 'settings'}
    <div class="panel">
      <SettingsPanel />
    </div>
  {/if}

  <div class="body">
    <Timeline onAdd={() => (activePanel = 'add')} />
  </div>
</main>

<style>
  .shell {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    box-sizing: border-box;
    border: 1px solid var(--shell-border);
    border-radius: 14px;
    background: var(--shell-bg);
    overflow: hidden;
  }

  /* 全透明時邊框平常隱形,hover 才浮出,讓人找得到視窗邊緣 */
  .shell[data-bg='clear']:hover {
    border-color: color-mix(in srgb, var(--muted) 45%, transparent);
  }

  .handle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 6px 0 8px;
    cursor: move;
  }

  /* 名牌本身也是膠囊(全透明時才有可讀的底);pointer-events 關掉,拖曳落在整條握把上 */
  .wordmark {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 9px;
    border-radius: 999px;
    background: var(--capsule-bg);
    box-shadow:
      var(--capsule-ring),
      var(--capsule-shadow);
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.03em;
    pointer-events: none;
  }

  /* 控制列平常隱形(保持安靜),hover / 鍵盤聚焦 / 面板開著時出現 */
  .actions {
    margin-left: auto;
    display: flex;
    gap: 2px;
    padding: 0 2px;
    border-radius: 8px;
    background: var(--capsule-bg);
    box-shadow:
      var(--capsule-ring),
      var(--capsule-shadow);
    opacity: 0;
    pointer-events: none;
    cursor: default;
    transition: opacity 0.15s;
  }

  .shell:hover .actions,
  .handle:focus-within .actions,
  .shell[data-panel] .actions {
    opacity: 1;
    pointer-events: auto;
  }

  .degraded {
    flex: 0 0 auto;
    margin: 0 8px 6px;
    padding: 3px 12px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--strike) 16%, var(--capsule-bg));
    color: var(--strike);
    font-size: 11px;
  }

  /* 管理面板:實色卡片,windowOpacity 只作用於常駐時間軸,面板必須完全可讀 */
  .panel {
    --field-bg: var(--panel);
    flex: 0 0 auto;
    max-height: 52vh;
    margin: 0 6px 6px;
    padding: 10px 12px 12px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--background);
    animation: cl-rise 0.2s var(--ease-out);
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
