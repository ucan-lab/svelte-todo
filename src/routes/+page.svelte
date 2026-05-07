<script lang="ts">
  import type { Todo } from '../types/todo';
  import { onMount } from 'svelte';

  type Filter = 'all' | 'active' | 'completed';

  let todos = $state([] as Todo[]);
  let newTodo: string = $state('');
  let isInitialized: boolean = $state(false);
  let filter: Filter = $state('all');

  const filteredTodos = $derived.by(() => {
    if (filter === 'active') return todos.filter((t) => !t.done);
    if (filter === 'completed') return todos.filter((t) => t.done);
    return todos;
  });

  onMount(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTodos = localStorage.getItem('todos');
        if (savedTodos) {
          todos = JSON.parse(savedTodos);
        }
      } catch (e) {
        console.error('Failed to load todos from localStorage:', e);
      } finally {
        isInitialized = true;
      }
    }
  });

  $effect(() => {
    if (isInitialized && typeof window !== 'undefined') {
      try {
        localStorage.setItem('todos', JSON.stringify(todos));
      } catch (e) {
        console.error('Failed to save todos to localStorage:', e);
      }
    }
  });

  function resetInput() {
    newTodo = '';
  }

  function addTodo() {
    if (newTodo.trim()) {
      todos.push({ text: newTodo, done: false });
      resetInput();
    }
  }

  function deleteTodo(todo: Todo) {
    const index = todos.indexOf(todo);
    if (index !== -1) {
      todos.splice(index, 1);
    }
  }
</script>

<main class="min-h-screen bg-gray-100 flex flex-col items-center py-10">
  <h1 class="text-4xl font-bold text-gray-800 mb-8">Todo App</h1>

  <div class="flex items-center gap-4 mb-6">
    <input
      type="text"
      bind:value={newTodo}
      placeholder="New task..."
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.isComposing) {
          addTodo();
        }
      }}
      class="w-64 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
    <button
      onclick={addTodo}
      disabled={!newTodo.trim()}
      class="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
    >
      Add
    </button>
  </div>

  <div class="flex items-center gap-2 mb-4" role="group" aria-label="Filter todos">
    {#each ['all', 'active', 'completed'] as const as f}
      <button
        type="button"
        onclick={() => (filter = f)}
        aria-pressed={filter === f}
        class={`px-3 py-1 rounded-lg text-sm font-medium border ${
          filter === f
            ? 'bg-blue-500 text-white border-blue-500'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed'}
      </button>
    {/each}
  </div>

  <ul class="w-full max-w-md">
    {#each filteredTodos as todo (todo)}
      <li class="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm mb-2">
        <div class="flex items-center gap-3">
          <input
            type="checkbox"
            bind:checked={todo.done}
            class="h-5 w-5 text-blue-500 focus:ring-blue-500 border-gray-300 rounded"
          />
          <span class={`text-lg ${todo.done ? 'line-through text-gray-400' : 'text-gray-700'}`}
            >{todo.text}</span
          >
        </div>
        <button onclick={() => deleteTodo(todo)} class="text-red-500 font-semibold hover:underline">
          Delete
        </button>
      </li>
    {/each}
  </ul>
</main>
