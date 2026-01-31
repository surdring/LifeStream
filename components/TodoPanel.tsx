import { useState, type FC, type FormEvent } from 'react';
import { Check, Trash2, Plus, ListTodo } from 'lucide-react';
import { useAppState } from '../context/AppStateContext';
import { useLanguage } from '../context/LanguageContext';

export const TodoPanel: FC = () => {
  const { todos, addTodo, toggleTodo, deleteTodo } = useAppState();
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState('');

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    addTodo(inputValue.trim());
    setInputValue('');
  };

  // Sort: Incomplete first, then by creation date
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed === b.completed) return b.createdAt - a.createdAt;
    return a.completed ? 1 : -1;
  });

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl lg:shadow-none">
      <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-indigo-50/30">
        <h2 className="font-bold text-gray-800 flex items-center gap-2">
          <ListTodo size={20} className="text-indigo-600" />
          {t('todo.title')}
        </h2>
        <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-full border border-gray-200">
          {todos.filter(t => !t.completed).length} {t('todo.remaining')}
        </span>
      </div>

      <div className="p-4 border-b border-gray-100 bg-white">
        <form onSubmit={handleAdd} className="relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('todo.placeholder')}
            className="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <Plus size={16} />
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedTodos.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">{t('todo.empty')}</p>
            <p className="text-xs mt-1">{t('todo.stayProductive')}</p>
          </div>
        ) : (
          sortedTodos.map(todo => (
            <div
              key={todo.id}
              className={`group flex items-start gap-3 p-3 rounded-xl transition-all ${
                todo.completed ? 'bg-gray-50' : 'bg-white border border-gray-100 hover:border-indigo-200 hover:shadow-sm'
              }`}
            >
              <button
                onClick={() => toggleTodo(todo.id)}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  todo.completed
                    ? 'bg-indigo-500 border-indigo-500 text-white'
                    : 'border-gray-300 text-transparent hover:border-indigo-400'
                }`}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              
              <div className="flex-1 min-w-0">
                <p 
                  className={`text-sm leading-relaxed break-words transition-all ${
                    todo.completed ? 'text-gray-400 line-through' : 'text-gray-700'
                  }`}
                >
                  {todo.content}
                </p>
                {todo.completed && (
                  <p className="text-[10px] text-gray-400 mt-1 italic">
                    {t('todo.addedToLogs')}
                  </p>
                )}
              </div>

              <button
                onClick={() => deleteTodo(todo.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};