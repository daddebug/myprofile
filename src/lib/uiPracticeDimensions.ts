// Intrinsic pixel dimensions of the optimized UI Practice display assets
// (src/assets/ui-practice-optimized/), keyed by filename stem (no extension)
// so lookups stay valid regardless of source/optimized file extension.
// Used only to set width/height on the rendered <img> to prevent layout shift.
export const UI_PRACTICE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "holopix商单3展示": { width: 1920, height: 1080 },
  "mini世界测试1": { width: 1920, height: 1080 },
  "valorant手游尝试": { width: 1920, height: 1080 },
  "Y3K尝试1": { width: 1920, height: 1080 },
  "Y3K尝试2": { width: 1920, height: 1080 },
  "Y3K尝试3": { width: 1920, height: 1080 },
  "个性化二游练习1": { width: 1920, height: 1080 },
  "个性化二游练习2": { width: 1920, height: 1080 },
  "个性化二游练习3": { width: 1920, height: 1080 },
  "个性化二游练习4": { width: 1920, height: 1080 },
  "主界面2": { width: 1920, height: 1080 },
  "关卡选择": { width: 1960, height: 1103 },
  "局内战斗2": { width: 1920, height: 1080 },
  "稿件初期试稿": { width: 1920, height: 1080 },
  "第一个完整作品集1": { width: 1792, height: 828 },
  "第一个完整作品集2": { width: 1792, height: 828 },
  "第一个完整作品集3": { width: 1792, height: 828 },
  "第一个完整作品集4": { width: 1792, height: 828 },
  "编队界面交互尝试": { width: 1692, height: 952 },
  "诗悦网络测试": { width: 1600, height: 720 },
  "进入战斗": { width: 1920, height: 1080 },
};

export function stemOf(filename: string) {
  return filename.replace(/\.[^./]+$/, "");
}
