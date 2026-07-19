import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useLocale } from "../locales/LocaleContext";

export function Shell({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [homeHeaderVisible, setHomeHeaderVisible] = useState(false);
  const location = useLocation();
  const { locale, messages, pathFor } = useLocale();
  const isHome = location.pathname === `/${locale}` || location.pathname === `/${locale}/`;
  const routePath = location.pathname.replace(/^\/(zh|en)(?=\/|$)/, "") || "/";
  const isSectionActive = (section: string) => routePath === section || routePath.startsWith(`${section}/`);
  const navItems = [
    { label: messages.nav.work, to: pathFor("/work"), active: isSectionActive("/work") },
    { label: messages.nav.play, to: pathFor("/play"), active: isSectionActive("/play") },
  ];
  const languageHref = (targetLocale: "zh" | "en") =>
    `${pathFor(location.pathname, targetLocale)}${location.search}${location.hash}`;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isHome) {
      setHomeHeaderVisible(true);
      return undefined;
    }

    const updateHeaderVisibility = () => {
      setHomeHeaderVisible(window.scrollY >= window.innerHeight * 0.96);
    };

    updateHeaderVisibility();
    window.addEventListener("scroll", updateHeaderVisibility, { passive: true });
    window.addEventListener("resize", updateHeaderVisibility);

    return () => {
      window.removeEventListener("scroll", updateHeaderVisibility);
      window.removeEventListener("resize", updateHeaderVisibility);
    };
  }, [isHome]);

  const showHeader = !isHome || homeHeaderVisible || open;

  return (
    <div className="min-h-screen bg-deepIndigo text-softWhite">
      <header
        className={`top-0 z-50 border-b border-softWhite/12 bg-deepIndigo/92 text-softWhite backdrop-blur-xl transition duration-500 ease-out ${
          isHome ? "fixed left-0 right-0" : "sticky"
        } ${showHeader ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-3 opacity-0"}`}
      >
        <nav className="site-container grid h-[68px] grid-cols-2 items-center md:grid-cols-3">
          <Link
            to={pathFor("/")}
            className="group flex min-w-0 items-center gap-3 justify-self-start"
            onClick={() => setOpen(false)}
            aria-label={messages.brand.homeLabel}
          >
            <span className="grid h-11 w-11 place-items-center rounded-[14px] border border-acidGreen/45 bg-archiveBlue font-mono text-lg font-bold text-acidGreen transition group-hover:bg-acidGreen group-hover:text-deepIndigo">
              D.D
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight">{messages.brand.name}</span>
              <span className="block text-[13px] leading-5 text-softWhite/72">{messages.brand.subtitle}</span>
            </span>
          </Link>

          <div className="hidden items-center gap-6 justify-self-center md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={() =>
                  `relative py-2 text-sm font-bold transition ${
                    item.active
                      ? "text-acidGreen after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:rounded-full after:bg-acidGreen"
                      : "text-softWhite/78 hover:text-softWhite"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="hidden justify-self-end md:block">
            <LanguageSwitcher
              label={messages.language.label}
              chinese={messages.language.chinese}
              english={messages.language.english}
              locale={locale}
              zhHref={languageHref("zh")}
              enHref={languageHref("en")}
            />
          </div>

          <button
            type="button"
            className="grid h-11 w-11 place-items-center justify-self-end rounded-[12px] border border-softWhite/20 text-softWhite md:hidden"
            onClick={() => setOpen((current) => !current)}
            aria-label={open ? messages.nav.closeMenu : messages.nav.openMenu}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {open ? (
          <div className="border-t border-softWhite/10 bg-deepIndigo px-4 py-4 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={() =>
                    `rounded-[12px] px-4 py-3 text-sm font-bold ${
                      item.active ? "bg-acidGreen text-deepIndigo" : "bg-softWhite/7 text-softWhite"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <LanguageSwitcher
                label={messages.language.label}
                chinese={messages.language.chinese}
                english={messages.language.english}
                locale={locale}
                zhHref={languageHref("zh")}
                enHref={languageHref("en")}
                mobile
              />
            </div>
          </div>
        ) : null}
      </header>

      {children}

      {!isHome ? (
      <footer className="border-t border-softWhite/10 bg-deepIndigo">
        <div className="site-container grid gap-8 py-14 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="font-display text-4xl text-softWhite">Let’s Make Something Playable</p>
            <p className="mt-3 max-w-2xl text-softWhite/68">
              {messages.footer.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            <a className="pill-link" href="mailto:hello@example.com">
              {messages.footer.email}
            </a>
            <a className="pill-link" href="https://www.behance.net/" target="_blank" rel="noreferrer">
              Behance
            </a>
            <a className="pill-link" href="https://github.com/" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>
      ) : null}
    </div>
  );
}

function LanguageSwitcher({ label, chinese, english, locale, zhHref, enHref, mobile = false }: {
  label: string;
  chinese: string;
  english: string;
  locale: "zh" | "en";
  zhHref: string;
  enHref: string;
  mobile?: boolean;
}) {
  const linkClass = (active: boolean) =>
    `transition ${active ? "text-acidGreen" : "text-softWhite/58 hover:text-softWhite"}`;

  return (
    <div
      className={`${mobile ? "px-4 py-3" : ""} flex items-center gap-2 font-mono text-[13px] font-bold uppercase tracking-[0.1em]`}
      aria-label={label}
    >
      <Link className={linkClass(locale === "zh")} to={zhHref}>{chinese}</Link>
      <span className="text-softWhite/24" aria-hidden="true">|</span>
      <Link className={linkClass(locale === "en")} to={enHref}>{english}</Link>
    </div>
  );
}
