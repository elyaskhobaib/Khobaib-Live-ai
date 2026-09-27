import { z } from "zod";

export const annotationSchema = z.object({
    id: z.string(),
    x: z.number().min(0).max(1000),
    y: z.number().min(0).max(1000),
    width: z.number().min(0).max(1000),
    height: z.number().min(0).max(1000),
    explanation: z.string().min(1),
    confidence: z.number().min(0).max(1).optional(),
}).refine((annotation) =>
    annotation.x + annotation.width <= 1000 && annotation.y + annotation.height <= 1000,
    "Annotation must stay within image bounds.");

export const analysisSchema = z.object({
    answer: z.string().min(1),
    steps: z.array(z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        annotationId: z.string().optional(),
    })).min(1),
    annotations: z.array(annotationSchema),
    uncertainty: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;
export type Annotation = z.infer<typeof annotationSchema>;
