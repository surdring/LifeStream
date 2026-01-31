import { GoogleGenAI } from "@google/genai";
import { LogEntry, ReportType } from "../types";
import { buildReportSystemInstruction, stripThinkingFromReport } from "../shared/reportPrompt";

const apiKey = process.env.API_KEY || '';

// Initialize client
const ai = new GoogleGenAI({ apiKey });

export const generateReport = async (
  type: ReportType,
  logs: LogEntry[],
  periodName: string,
  language: 'en' | 'zh'
): Promise<string> => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }

  if (logs.length === 0) {
    return "No logs found for this period to generate a report.";
  }

  // Format logs for the prompt
  const logText = logs.map(log => {
    const date = new Date(log.timestamp).toLocaleString();
    return `[${date}] ${log.content}`;
  }).join("\n");

  const systemInstruction = buildReportSystemInstruction({ type, periodName, language });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Here are the logs for the period:\n\n${logText}`,
      config: {
        systemInstruction,
        temperature: 0.3, // Lower temperature for more factual summaries
      }
    });

    return stripThinkingFromReport(response.text || "Failed to generate text content.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to communicate with AI service.");
  }
};