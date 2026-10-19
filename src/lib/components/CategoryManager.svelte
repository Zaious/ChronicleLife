<script lang="ts">
  /**
   * 分類管理:清單 + 新增/改名/改色/刪除。
   * 只依賴 stores(不依賴 shell/或 routes/)。
   * 刪除分類時,該分類底下任務的 categoryId 由 store 端(removeCategory)設為 null(PLANNING.md §3.1 F2)。
   */
  import { categories, addCategory, updateCategory, removeCategory } from '../stores/app';
  import ColorPicker from './ColorPicker.svelte';

  const DEFAULT_COLOR = '#4F8EF7';

  let newName = $state('');
  let newColor = $state(DEFAULT_COLOR);

  function handleAdd(event: SubmitEvent): void {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    addCategory({ name: trimmed, color: newColor });
    newName = '';
    newColor = DEFAULT_COLOR;
  }

  function handleRename(id: string, event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    updateCategory(id, { name: value });
  }

  function handleRemove(id: string): void {
    removeCategory(id);
  }
</script>

<div class="category-manager">
  <h4 class="h">分類管理</h4>

  <ul class="category-list">
    {#each $categories as c (c.id)}
      <li>
        <ColorPicker
          value={c.color}
          onchange={(hex) => updateCategory(c.id, { color: hex })}
          ariaLabel="分類顏色"
        />
        <input
          class="field name-input"
          type="text"
          value={c.name}
          onchange={(e) => handleRename(c.id, e)}
          aria-label="分類名稱"
        />
        <button type="button" class="icon-btn" onclick={() => handleRemove(c.id)} aria-label="刪除分類" title="刪除">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </li>
    {:else}
      <li class="empty muted">尚未建立分類</li>
    {/each}
  </ul>

  <form class="add-form" onsubmit={handleAdd}>
    <ColorPicker value={newColor} onchange={(hex) => (newColor = hex)} ariaLabel="新分類顏色" />
    <input class="field name-input" type="text" placeholder="新分類名稱" bind:value={newName} required />
    <button type="submit" class="btn primary">新增</button>
  </form>
</div>

<style>
  .category-manager {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .category-list li {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-form {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .name-input {
    flex: 1 1 140px;
  }
</style>
