declare module "lucide-react" {
    import type { SVGProps } from "react";

    type IconComponent = (props: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) => React.ReactNode;

    export const AlertCircle: IconComponent;
    export const ArrowDown: IconComponent;
    export const ArrowLeft: IconComponent;
    export const ArrowRight: IconComponent;
    export const Camera: IconComponent;
    export const Check: IconComponent;
    export const ChevronDown: IconComponent;
    export const Crosshair: IconComponent;
    export const ImagePlus: IconComponent;
    export const LoaderCircle: IconComponent;
    export const Mic: IconComponent;
    export const MicOff: IconComponent;
    export const RotateCcw: IconComponent;
    export const Sparkles: IconComponent;
    export const Upload: IconComponent;
    export const Volume2: IconComponent;
    export const X: IconComponent;
}
