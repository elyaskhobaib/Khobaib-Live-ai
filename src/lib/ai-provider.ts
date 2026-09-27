import type { AnalysisResult } from "@/lib/analysis-schema";

export interface ConversationMessage {
    role: "user" | "assistant";
    content: string;
}

export interface AnalyzeImageInput {
    imageDataUrl: string;
    question: string;
    history: ConversationMessage[];
}

export interface AIProvider {
    analyzeImage(input: AnalyzeImageInput, onAnswerDelta?: (delta: string) => void): Promise<AnalysisResult>;
}
