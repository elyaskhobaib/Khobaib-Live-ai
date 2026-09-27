"use client";

import { Crosshair } from "lucide-react";
import type { Annotation } from "@/lib/analysis-schema";

interface ImageAnnotationProps {
    src: string;
    alt: string;
    annotations: Annotation[];
    activeAnnotationId?: string;
    onSelect: (id: string) => void;
}

export function ImageAnnotation({ src, alt, annotations, activeAnnotationId, onSelect }: ImageAnnotationProps) {
    return (
        <div className="annotated-image">
            <img className="source-image" src={src} alt={alt} />
            {annotations.map((annotation, index) => {
                const active = annotation.id === activeAnnotationId;
                return (
                    <button
                        className={`annotation-box${active ? " is-active" : ""}`}
                        key={annotation.id}
                        type="button"
                        style={{
                            left: `${annotation.x / 10}%`,
                            top: `${annotation.y / 10}%`,
                            width: `${annotation.width / 10}%`,
                            height: `${annotation.height / 10}%`,
                        }}
                        onClick={() => onSelect(annotation.id)}
                        aria-label={`نشانگر ${index + 1}: ${annotation.explanation}`}
                        title={annotation.explanation}
                    >
                        <span className="marker-number">{index + 1}</span>
                    </button>
                );
            })}
            {annotations.length === 0 && (
                <div className="image-hint">
                    <Crosshair size={15} />
                    <span>برای این تصویر ناحیهٔ مشخصی قابل‌تأیید نبود</span>
                </div>
            )}
        </div>
    );
}
