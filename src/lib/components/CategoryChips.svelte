<script lang="ts">
  /**
   * 分類選擇:膠囊籤(色點 + 名稱),取代原生下拉。點選即回呼;null = 未分類。
   * 樣式(.chip)在 app.css,與分段控制同一套語言。
   */
  import type { Category } from '../core/types';
  import { UNCATEGORIZED_COLOR } from '../core/types';

  interface Props {
    categories: Category[];
    value: string | null;
    onchange: (categoryId: string | null) => void;
    ariaLabel?: string;
  }

  const { categories, value, onchange, ariaLabel = '分類' }: Props = $props();
</script>

<div class="chips" role="group" aria-label={ariaLabel}>
  <button
    type="button"
    class="chip"
    style:--c={UNCATEGORIZED_COLOR}
    aria-pressed={value === null}
    onclick={() => onchange(null)}
  >
    <i class="dot"></i>未分類
  </button>
  {#each categories as c (c.id)}
    <button
      type="button"
      class="chip"
      style:--c={c.color}
      aria-pressed={value === c.id}
      onclick={() => onchange(c.id)}
    >
      <i class="dot"></i>{c.name}
    </button>
  {/each}
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
</style>
