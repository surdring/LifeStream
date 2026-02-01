import { ReportType } from '../types.ts';

export function buildReportSystemInstruction(params: {
  type: ReportType;
  periodName: string;
  language: 'en' | 'zh';
}): string {
  const { type, periodName, language } = params;
  const isZh = language === 'zh';

  const cuesTitle = isZh ? '线索区（Cues）' : 'Cues';
  const keywordsTitle = isZh ? '关键词' : 'Keywords';
  const questionsTitle = isZh ? '复盘问题' : 'Review Questions';
  const nextActionsTitle = isZh ? '下一步行动（可执行）' : 'Next Actions (Executable)';
  const evidenceTitle = isZh ? '证据（来自日志）' : 'Evidence (From Logs)';

  return `
    You are an expert personal assistant and life coach. 
    Your task is to analyze a stream of daily journal logs and create a structured summary report.
    
    The report type is: ${type} (${periodName}).
    Language: ${isZh ? 'Chinese (Simplified)' : 'English'}.
    
    Structure the output in Markdown with the following sections (Use ${isZh ? 'Chinese' : 'English'} for headers and content):

    ## ${cuesTitle}
    ### ${keywordsTitle}
    ${isZh ? '- 最多 6 个关键词（无序列表）。' : '- Up to 6 keywords (unordered list).'}

    ### ${questionsTitle}
    ${isZh ? '1. 5-10 个问题（有序列表）。只写问题，不要写答案。' : '1. 5-10 questions (ordered list). Questions only, no answers.'}

    ### ${nextActionsTitle}
    ${isZh ? '- [ ] 3-8 条行动项（任务列表）。每条必须可执行、可在 30-120 分钟内完成或拆成最小下一步。' : '- [ ] 3-8 action items (task list). Each item must be executable within 30-120 minutes or be the smallest next step.'}

    ### ${evidenceTitle}
    ${isZh ? '- 为上面的洞察/行动提供证据（无序列表）。每条必须包含日志时间戳（至少 YYYY-MM-DD）+ 引号内原文片段（10-30 字）。不要编造。' : '- Provide evidence (unordered list). Each item MUST include a log timestamp (at least YYYY-MM-DD) + a quoted snippet (10-30 words). Do not fabricate.'}

    ## ${isZh ? '执行摘要' : 'Executive Summary'}
    ${isZh ? '2-3 句简要概述。' : 'A brief 2-3 sentence overview.'}

    ## ${isZh ? '关键成就与进展' : 'Key Achievements & Progress'}
    ${isZh ? '完成的任务或胜利的要点（可用列表）。' : 'Bullet points of completed tasks or wins.'}

    ## ${isZh ? '话题与主题' : 'Topics & Themes'}
    ${isZh ? '主要关注点。' : 'What occupied the user\'s mind mostly?'}

    ## ${isZh ? '情绪与感受' : 'Mood & Sentiment'}
    ${isZh ? '整体情绪趋势。' : 'General emotional trend.'}

    ## ${isZh ? '下期行动建议' : 'Action Items for Next Period'}
    ${isZh ? '基于未完成事务或模式的建议。建议与线索区的行动项保持一致或进一步解释，但不要改变行动项的表述。' : 'Suggestions based on unfinished business or patterns. Keep consistent with the action items in the Cues section; you may elaborate, but do not change the wording of the action items.'}

    Keep the tone professional yet supportive and introspective.

    Do NOT output any <think> blocks or internal reasoning.
  `;
}

export function buildCuesSystemInstruction(params: {
  periodName: string;
  language: 'en' | 'zh';
}): string {
  const { periodName, language } = params;
  const isZh = language === 'zh';

  const cuesTitle = isZh ? '线索区（Cues）' : 'Cues';
  const keywordsTitle = isZh ? '关键词' : 'Keywords';
  const questionsTitle = isZh ? '复盘问题' : 'Review Questions';
  const nextActionsTitle = isZh ? '下一步行动（可执行）' : 'Next Actions (Executable)';
  const evidenceTitle = isZh ? '证据（来自日志）' : 'Evidence (From Logs)';

  return `
    You are a precise assistant.
    Your task is to read the journal logs for the period and produce ONLY a Cornell-style cues section in Markdown.

    Period: ${periodName}.
    Language: ${isZh ? 'Chinese (Simplified)' : 'English'}.

    Output MUST be valid Markdown and MUST follow this exact structure:

    ## ${cuesTitle}
    ### ${keywordsTitle}
    - ...

    ### ${questionsTitle}
    1. ...

    ### ${nextActionsTitle}
    - [ ] ...

    ### ${evidenceTitle}
    - YYYY-MM-DD ... "..."

    Rules:
    - Do not output any other top-level sections.
    - Questions MUST be questions only; do not include answers.
    - Next actions MUST be actionable and concrete; use - [ ] task list items.
    - Evidence MUST quote from the provided logs with a timestamp (at least YYYY-MM-DD). Do not fabricate.
    - Do NOT output any <think> blocks or internal reasoning.
  `;
}

export function extractCuesSection(markdown: string): string | null {
  if (!markdown) return null;
  const text = stripThinkingFromReport(markdown);

  const patterns = [
    /(^|\n)(##\s*线索区（Cues）\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*线索区\s*\(Cues\)\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*Cues\s*\n[\s\S]*?)(?=\n##\s|$)/m,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && typeof m[2] === 'string') {
      const section = m[2].trim();
      if (section) return section;
    }
  }
  return null;
}

export function extractTextBeforeCuesSection(markdown: string): string {
  if (!markdown) return '';
  const text = stripThinkingFromReport(markdown);

  const patterns = [
    /(^|\n)(##\s*线索区（Cues）\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*线索区\s*\(Cues\)\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*Cues\s*\n[\s\S]*?)(?=\n##\s|$)/m,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (m && typeof m.index === 'number' && typeof m[1] === 'string') {
      const start = m.index + m[1].length;
      return text.slice(0, start).trim();
    }
  }

  return '';
}

export function extractBodyAfterCuesSection(markdown: string): string {
  if (!markdown) return '';
  const text = stripThinkingFromReport(markdown);

  const patterns = [
    /(^|\n)(##\s*线索区（Cues）\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*线索区\s*\(Cues\)\s*\n[\s\S]*?)(?=\n##\s|$)/m,
    /(^|\n)(##\s*Cues\s*\n[\s\S]*?)(?=\n##\s|$)/m,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (m && typeof m.index === 'number' && typeof m[1] === 'string' && typeof m[2] === 'string') {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      return text.slice(end).trim();
    }
  }

  return '';
}

export function extractActionItemsFromMarkdown(markdown: string): string[] {
  if (!markdown) return [];

  const out: string[] = [];
  const re = /^- \[(?: |x|X)\] (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const item = String(m[1] ?? '').trim();
    if (item) out.push(item);
  }
  return out;
}

export function stripThinkingFromReport(text: string): string {
  if (!text) return text;

  let out = text;

  // Remove complete <think>...</think> blocks
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove any dangling <think> without closing tag
  out = out.replace(/<think>[\s\S]*/gi, '');

  // Remove stray closing tags
  out = out.replace(/<\/think>/gi, '');

  return out.trim();
}
