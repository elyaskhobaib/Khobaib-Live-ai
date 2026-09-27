import { analysisSchema, type AnalysisResult } from "@/lib/analysis-schema";
import type { AIProvider, AnalyzeImageInput } from "@/lib/ai-provider";

const systemPrompt = `You are a careful visual troubleshooting assistant. Always answer in English. Help identify visible problems and explain exactly which visible part to inspect or adjust, using image annotations when confidently localized. Give one practical, safe step at a time and ask a focused follow-up question when the image is insufficient. Do not guess hidden/internal faults, electrical diagnoses, or machine settings not visible in the image. Warn the user to power off and unplug machinery before touching or adjusting moving/electrical parts; recommend a qualified technician for hazardous or uncertain repairs. Return only JSON matching this structure: {"answer": string, "steps": [{"title": string, "description": string, "annotationId"?: string}], "annotations": [{"id": string, "x": number, "y": number, "width": number, "height": number, "explanation": string, "confidence"?: number}], "uncertainty"?: string}. Annotation coordinates are normalized integers from 0 to 1000, measured from the top-left of the ORIGINAL image; x/y mark the top-left and width/height are extents. Only annotate visible, relevant regions. Use no annotations if you cannot confidently localize a region, and explain uncertainty rather than guessing. Make steps practical and concise. Include a final-answer step.`;

function extractPartialJsonStringField(json: string, field: string): string | null {
    const start = json.search(new RegExp(`"${field}"\\s*:\\s*"`));
    if (start < 0) return null;
    const valueStart = json.indexOf('"', json.indexOf(":", start)) + 1;
    let value = "";
    for (let index = valueStart; index < json.length; index += 1) {
        const character = json[index];
        if (character === '"') return value;
        if (character !== "\\") {
            value += character;
            continue;
        }
        const escaped = json[index + 1];
        if (!escaped) return value;
        const escapes: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (escaped === "u") {
            const code = json.slice(index + 2, index + 6);
            if (!/^[\da-f]{4}$/i.test(code)) return value;
            value += String.fromCharCode(Number.parseInt(code, 16));
            index += 5;
        } else if (escaped in escapes) {
            value += escapes[escaped];
            index += 1;
        } else {
            return value;
        }
    }
    return value;
}

export class OpenAIProvider implements AIProvider {
    async analyzeImage({ imageDataUrl, question, history }: AnalyzeImageInput, onAnswerDelta?: (delta: string) => void): Promise<AnalysisResult> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY is not set. Add it to .env.local.");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                temperature: 0.2,
                response_format: { type: "json_object" },
                stream: true,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history,
                    {
                        role: "user",
                        content: [
                            { type: "text", text: question },
                            { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
                        ],
                    },
                ],
            }),
            signal: AbortSignal.timeout(90_000),
        });

        if (!response.ok) {
            const details = await response.json().catch(() => null) as { error?: { message?: string } } | null;
            const message = response.status === 401
                ? "OPENAI_API_KEY is invalid."
                : details?.error?.message || "The image analysis service is unavailable.";
            throw new Error(message);
        }

        if (!response.body) throw new Error("No live response was received from the model service.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        let streamedAnswer = "";
        let finished = false;

        while (!finished) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (data === "[DONE]") {
                    finished = true;
                    break;
                }
                try {
                    const event = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
                    const delta = event.choices?.[0]?.delta?.content;
                    if (!delta) continue;
                    content += delta;
                    const answer = extractPartialJsonStringField(content, "answer");
                    if (answer && answer.startsWith(streamedAnswer)) {
                        const newText = answer.slice(streamedAnswer.length);
                        if (newText) onAnswerDelta?.(newText);
                        streamedAnswer = answer;
                    }
                } catch {
                    continue;
                }
            }
            if (done) break;
        }
        if (!content) throw new Error("The model returned an empty response. Please try again.");

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch {
            throw new Error("The model response could not be read. Please try again.");
        }

        const result = analysisSchema.safeParse(parsed);
        if (!result.success) {
            throw new Error("The model response was invalid. Please try asking another question.");
        }
        return result.data;
    }
}
