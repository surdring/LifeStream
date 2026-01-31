import { createContext, useContext, useState, type ReactNode, useEffect, type FC } from 'react';

export type Language = 'en' | 'zh';

export const translations = {
  en: {
    common: {
      loading: "Thinking...",
      error: "Something went wrong",
      edit: "Edit",
      save: "Save",
      cancel: "Cancel",
    },
    sidebar: {
      dailyLog: "Daily Log",
      reports: "Insights & Reports",
      proTip: "Pro Tip",
      proTipDesc: "Write naturally. The AI will make sense of the chaos later."
    },
    daily: {
      today: "Today",
      subtitle: "Capture your thoughts as they happen.",
      noEntries: "No entries for this day.",
      startTyping: "Start typing below...",
      placeholder: "What's on your mind? (Shift+Enter for new line)",
      pressEnter: "Press Enter to save",
      completedTask: "✅ Completed task: "
    },
    todo: {
      title: "Tasks",
      remaining: "remaining",
      placeholder: "Add a new task...",
      empty: "No tasks yet.",
      stayProductive: "Stay productive!",
      addedToLogs: "Added to logs"
    },
    reports: {
      title: "Insights & Reports",
      daily: "Daily Report",
      weekly: "Weekly Report",
      monthly: "Monthly Report",
      yearly: "Yearly Report",
      generate: "Generate {type} summary",
      desc: "Analyze your logs and get AI-powered insights for this period.",
      create: "Create Report",
      regenerate: "Regenerate",
      history: "History",
      noHistory: "No reports generated yet.",
      startJournaling: "Start journaling and generate your first insight!",
      generatedOn: "Generated on",
      weekOf: "Week of"
    }
  },
  zh: {
    common: {
      loading: "思考中...",
      error: "出错了",
      edit: "编辑",
      save: "保存",
      cancel: "取消",
    },
    sidebar: {
      dailyLog: "每日日志",
      reports: "洞察与报表",
      proTip: "小贴士",
      proTipDesc: "自然地书写，AI 会帮你理清思绪。"
    },
    daily: {
      today: "今天",
      subtitle: "随时记录你的想法。",
      noEntries: "今天还没有记录。",
      startTyping: "在下方开始输入...",
      placeholder: "你在想什么？(Shift+Enter 换行)",
      pressEnter: "按回车键保存",
      completedTask: "✅ 完成任务："
    },
    todo: {
      title: "待办事项",
      remaining: "剩余",
      placeholder: "添加新任务...",
      empty: "暂无任务。",
      stayProductive: "保持高效！",
      addedToLogs: "已添加到日志"
    },
    reports: {
      title: "洞察与报表",
      daily: "日报",
      weekly: "周报",
      monthly: "月报",
      yearly: "年报",
      generate: "生成{type}总结",
      desc: "分析你的日志并获取 AI 驱动的周期洞察。",
      create: "生成报表",
      regenerate: "重新生成",
      history: "历史记录",
      noHistory: "暂无报表。",
      startJournaling: "开始记录并生成你的第一个洞察！",
      generatedOn: "生成于",
      weekOf: "周起始日"
    }
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('ls_language');
    return (saved === 'zh' || saved === 'en') ? saved : 'en';
  });

  useEffect(() => {
    localStorage.setItem('ls_language', language);
  }, [language]);

  const t = (path: string, params?: Record<string, string>) => {
    const keys = path.split('.');
    let value: any = translations[language];
    
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key as keyof typeof value];
      } else {
        return path;
      }
    }
    
    let result = value as string;
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        result = result.replace(`{${key}}`, val);
      });
    }
    return result || path;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};