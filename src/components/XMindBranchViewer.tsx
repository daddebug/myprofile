import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import type { Locale } from "../locales/types";
import type { SystemMapBranch, SystemMapLocalizedText } from "../data/three-d-character-system-map";

type XMindBranchViewerProps = {
  rootTitle: SystemMapLocalizedText;
  branches: SystemMapBranch[];
  locale: Locale;
};

function localized(value: SystemMapLocalizedText, locale: Locale) {
  return value[locale];
}

export function XMindBranchViewer({ rootTitle, branches, locale }: XMindBranchViewerProps) {
  const shouldReduceMotion = useReducedMotion();
  const [selectedBranchId, setSelectedBranchId] = useState(() => branches[0]?.id ?? "");
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? branches[0],
    [branches, selectedBranchId],
  );

  useEffect(() => {
    if (!branches.some((branch) => branch.id === selectedBranchId)) {
      setSelectedBranchId(branches[0]?.id ?? "");
    }
  }, [branches, selectedBranchId]);

  return (
    <section className="overflow-hidden rounded-[22px] border border-softWhite/10 bg-[#111746]/88 shadow-[0_24px_70px_rgba(3,5,26,0.28),inset_0_1px_0_rgba(244,245,250,0.06)]">
      <div className="border-b border-softWhite/10 px-5 py-5 md:px-7 md:py-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-acidGreen/72">
          {locale === "zh" ? "系统分支" : "System branches"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5" role="tablist" aria-label={localized(rootTitle, locale)}>
          {branches.map((branch) => {
            const selected = branch.id === selectedBranch?.id;
            return (
              <button
                key={branch.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-full px-4 py-2 text-sm font-semibold leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-acidGreen ${
                  selected
                    ? "bg-acidGreen text-deepIndigo shadow-[0_8px_24px_rgba(198,255,66,0.16)]"
                    : "bg-archiveBlue/38 text-softWhite/58 hover:bg-archiveBlue/68 hover:text-softWhite"
                }`}
                onClick={() => setSelectedBranchId(branch.id)}
              >
                {localized(branch.label, locale)}
              </button>
            );
          })}
        </div>
      </div>

      {selectedBranch ? (
        <div className="px-5 py-7 md:px-7 md:py-9">
          <div className="grid min-w-0 items-center gap-5 lg:min-h-[24rem] lg:grid-cols-[minmax(15rem,0.3fr)_2rem_minmax(0,0.7fr)] lg:gap-7">
            <div className="w-full max-w-[20rem] justify-self-center rounded-[14px] bg-acidGreen/10 px-6 py-8 text-center ring-1 ring-inset ring-acidGreen/24">
              <p className="font-display text-lg font-semibold leading-snug text-acidGreen md:text-xl">
                {localized(selectedBranch.label, locale)}
              </p>
            </div>
            <ArrowRight className="mx-auto hidden h-5 w-5 text-[#9FAAD2]/55 lg:block" aria-hidden="true" />
            <ArrowDown className="mx-auto h-5 w-5 text-[#9FAAD2]/55 lg:hidden" aria-hidden="true" />

            <div className="min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedBranch.id}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
                  className="divide-y divide-softWhite/10 border-y border-softWhite/10"
                >
                  {selectedBranch.groups.map((group, groupIndex) => (
                    <div key={group.id} className="grid min-w-0 gap-3 py-5 md:grid-cols-[2rem_minmax(11rem,0.68fr)_minmax(0,1.32fr)] md:gap-5">
                      <span className="font-mono text-[10px] leading-6 text-[#9FAAD2]/52">
                        {String(groupIndex + 1).padStart(2, "0")}
                      </span>
                      <h4 className="font-display text-base font-semibold leading-6 text-softWhite/88">
                        {localized(group.title, locale)}
                      </h4>
                      <ul className="grid min-w-0 gap-2">
                        {group.items.map((item, itemIndex) => (
                          <li key={`${group.id}-${itemIndex}`} className="relative pl-4 text-sm leading-6 text-[#9FAAD2] before:absolute before:left-0 before:top-[0.68rem] before:h-1 before:w-1 before:rounded-full before:bg-acidGreen/68">
                            {localized(item, locale)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-softWhite/50">
          {locale === "zh" ? "暂无可显示的系统分支。" : "No system branches are available."}
        </p>
      )}
    </section>
  );
}
