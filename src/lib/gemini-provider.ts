import { analysisSchema, type AnalysisResult } from "@/lib/analysis-schema";
import type { AIProvider, AnalyzeImageInput } from "@/lib/ai-provider";

const systemPrompt = `You are a careful visual troubleshooting assistant. Always answer in English. Help identify visible problems and explain exactly which visible part to inspect or adjust, using image annotations when confidently localized. Give one practical, safe step at a time and ask a focused follow-up question when the image is insufficient. Do not guess hidden/internal faults, electrical diagnoses, or machine settings not visible in the image. Warn the user to power off and unplug machinery before touching or adjusting moving/electrical parts; recommend a qualified technician for hazardous or uncertain repairs. Return only JSON matching this structure: {"answer": string, "steps": [{"title": string, "description": string, "annotationId"?: string}], "annotations": [{"id": string, "x": number, "y": number, "width": number, "height": number, "explanation": string, "confidence"?: number}], "uncertainty"?: string}. Annotation coordinates are normalized integers from 0 to 1000, measured from the top-left of the original image; x/y mark the top-left and width/height are extents. Only annotate visible, relevant regions. Use no annotations if you cannot confidently localize a region, and explain uncertainty rather than guessing. Make steps practical and concise. Include a final-answer step.`;

type GeminiResponse = {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export class GeminiProvider implements AIProvider {
    async analyzeImage({ imageDataUrl, question, history }: AnalyzeImageInput, onAnswerDelta?: (delta: string) => void): Promise<AnalysisResult> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not set. Add a free Google AI Studio key to .env.local.");

        const imageMatch = imageDataUrl.match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/);
        if (!imageMatch) throw new Error("The camera image could not be prepared for Gemini.");
        const [, mimeType, imageData] = imageMatch;
        const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
        const contents = [
            ...history.map((message) => ({
                role: message.role === "assistant" ? "model" : "user",
                parts: [{ text: message.content }],
            })),
            {
                role: "user",
                parts: [
                    { text: question },
                    { inlineData: { mimeType, data: imageData } },
                ],
            },
        ];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
            }),
            signal: AbortSignal.timeout(90_000),
        });

        const payload = await response.json().catch(() => null) as GeminiResponse | null;
        if (!response.ok) {
            if (response.status === 429) throw new Error("Gemini free-tier rate limit reached. Wait a little and try again.");
            if (response.status === 401 || response.status === 403) throw new Error("GEMINI_API_KEY is invalid or does not have Gemini API access.");
            throw new Error(payload?.error?.message || "The Gemini image analysis service is unavailable.");
        }

        const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
        if (!text) throw new Error("Gemini returned no answer. The image may have been blocked by a safety filter.");

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error("Gemini returned an unreadable response. Please try again.");
        }

        const result = analysisSchema.safeParse(parsed);
        if (!result.success) throw new Error("Gemini returned an invalid troubleshooting response. Please try again.");
        onAnswerDelta?.(result.data.answer);
        return result.data;
    }
}