# Khobaib Live AI

MVP وب‌اپ RTL برای تحلیل تصویر و نمایش پاسخ ساختاریافته، گام‌ها و نشانگرهای قابل‌انتخاب روی خود تصویر. تصویر و سؤال فقط از مسیر backend تحلیل می‌شوند؛ هیچ کلید مدلی به مرورگر فرستاده نمی‌شود.

## Requirements

- Node.js 18.18 or later
- npm
- A Gemini API key from Google AI Studio. Google currently offers a limited free tier for selected models, including image input; quotas and terms can change. Free-tier data may be used to improve Google's products.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-2.5-flash
```

Create a free key in [Google AI Studio](https://aistudio.google.com/apikey). Keep it in `.env.local`; never put it in client-side code or share it in chat. Then restart the dev server:

```bash
npm run dev
```

The app is available at `http://localhost:3000`. Run `npm run typecheck` and `npm run build` to validate a production build.

OpenAI remains available as an optional paid provider by setting `AI_PROVIDER=openai` and `OPENAI_API_KEY`.

اگر پورت ۳۰۰۰ مشغول بود، از پورت دیگری استفاده کنید:

```bash
npm run dev -- --port 3002
```

## امکانات MVP

- انتخاب تصویر، drag and drop، و ورودی دوربین موبایل در مرورگرهای پشتیبان `capture="environment"`
- ارسال multipart شامل `image` و `question` به `POST /api/analyze`
- نمایش زندهٔ متن پاسخ با Server-Sent Events؛ متن هنگام تولید مدل به chat می‌رسد و در پایان، گام‌ها و annotationهای ساختاریافته به تصویر وصل می‌شوند
- نگه‌داری تاریخچهٔ محدود گفتگو برای پرسش‌های پی‌درپی دربارهٔ همان تصویر
- بررسی فرمت و محدودیت ۱۰ مگابایتی در مرورگر و backend
- provider سمت سرور با interface مستقل در `src/lib/ai-provider.ts` و پیاده‌سازی OpenAI در `src/lib/openai-provider.ts`
- schema پاسخ با Zod و نمایش تطبیقی گام‌ها و annotationها
- انتخاب marker روی تصویر و اتصال توضیح آن به گام مربوط

## قرارداد مختصات

`x`, `y`, `width`, و `height` نسبت به تصویر اصلی و در مقیاس ۰ تا ۱۰۰۰ هستند. `x` و `y` گوشهٔ بالا-چپ ناحیه‌اند؛ `width` و `height` اندازهٔ آن در همان مقیاس‌اند. کامپوننت `ImageAnnotation` این مقیاس را به درصد تبدیل می‌کند، بنابراین اندازه و نسبت تصویرهای مختلف حفظ می‌شود. مدل در صورت ناتوانی از مکان‌یابی مطمئن باید `annotations: []` برگرداند و عدم قطعیت را در `uncertainty` توضیح دهد.

نمونهٔ پاسخ:

```json
{
  "answer": "پاسخ خلاصه",
  "steps": [
    { "title": "بررسی بخش مرتبط", "description": "توضیح این مرحله", "annotationId": "region-1" }
  ],
  "annotations": [
    { "id": "region-1", "x": 120, "y": 180, "width": 360, "height": 240, "explanation": "این ناحیه را بررسی کنید.", "confidence": 0.91 }
  ],
  "uncertainty": "توضیح اختیاری دربارهٔ محدودیت تشخیص"
}
```

## تعویض AI provider

پیاده‌سازی‌های جدید باید `AIProvider` را پیاده‌سازی کنند و `AnalysisResult` را مطابق `analysisSchema` برگردانند. Provider از route سرور انتخاب/تزریق می‌شود؛ credentialها را فقط در env سرور نگه دارید. در این MVP provider فعال `OpenAIProvider` است.
