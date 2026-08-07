import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Shell } from "./layouts/Shell";
import { DEFAULT_LOCALE, isLocale, LocaleProvider, localizePath, readPreferredLocale } from "./locales/LocaleContext";
import { AmbientLightBackground } from "./components/AmbientLightBackground";
import { ProjectRouteLoadingLayer, ProjectRouteTransitionCover } from "./components/ProjectEntryGate";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const WorkPage = lazy(() => import("./pages/WorkPage").then((module) => ({ default: module.WorkPage })));
const GameArchivePage = lazy(() => import("./pages/GameArchivePage").then((module) => ({ default: module.GameArchivePage })));
const ProjectRouteShell = lazy(() => import("./pages/ProjectPage").then((module) => ({ default: module.ProjectRouteShell })));

const OwnerMigrationToolsPage = import.meta.env.DEV
  ? lazy(() => import("./pages/OwnerMigrationToolsPage").then((module) => ({ default: module.OwnerMigrationToolsPage })))
  : null;

const OwnerTemplateBuilderPage = import.meta.env.DEV
  ? lazy(() => import("./pages/OwnerTemplateBuilderPage").then((module) => ({ default: module.OwnerTemplateBuilderPage })))
  : null;

const TemplateGalleryPage = import.meta.env.DEV
  ? lazy(() => import("./pages/TemplateGalleryPage").then((module) => ({ default: module.TemplateGalleryPage })))
  : null;

const PortfolioPdfBuilderPage = import.meta.env.DEV
  ? lazy(() => import("./pages/PortfolioPdfBuilderPage").then((module) => ({ default: module.PortfolioPdfBuilderPage })))
  : null;

function LocaleLayout() {
  const { locale } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/${DEFAULT_LOCALE}/`} replace />;

  return (
    <LocaleProvider locale={locale}>
      <Shell><Outlet /></Shell>
    </LocaleProvider>
  );
}

function LegacyLocaleRedirect() {
  const location = useLocation();
  const target = `${localizePath(location.pathname, readPreferredLocale())}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

function PortfolioExportRoute() {
  const { locale } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/${DEFAULT_LOCALE}/`} replace />;
  if (!import.meta.env.DEV || !PortfolioPdfBuilderPage) return <Navigate to={`/${locale}/work`} replace />;
  return <LocaleProvider locale={locale}><Suspense fallback={null}><PortfolioPdfBuilderPage /></Suspense></LocaleProvider>;
}

function OwnerMigrationToolsRoute() {
  const { locale } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/${DEFAULT_LOCALE}/`} replace />;
  if (!import.meta.env.DEV || !OwnerMigrationToolsPage) return <Navigate to={`/${locale}/work`} replace />;
  return <LocaleProvider locale={locale}><Suspense fallback={null}><OwnerMigrationToolsPage /></Suspense></LocaleProvider>;
}

function OwnerTemplateBuilderRoute() {
  const { locale } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/${DEFAULT_LOCALE}/`} replace />;
  if (!import.meta.env.DEV || !OwnerTemplateBuilderPage) return <Navigate to={`/${locale}/work`} replace />;
  return <LocaleProvider locale={locale}><Suspense fallback={null}><OwnerTemplateBuilderPage /></Suspense></LocaleProvider>;
}

function TemplateGalleryRoute() {
  const { locale } = useParams();
  if (!isLocale(locale)) return <Navigate to={`/${DEFAULT_LOCALE}/`} replace />;
  if (!import.meta.env.DEV || !TemplateGalleryPage) return <Navigate to={`/${locale}/work`} replace />;
  return <LocaleProvider locale={locale}><Suspense fallback={null}><TemplateGalleryPage /></Suspense></LocaleProvider>;
}

export default function App() {
  const location = useLocation();
  const projectRouteKey = /^\/(?:zh|en)\/work\/[^/]+\/?$/.test(location.pathname)
    ? `${location.pathname}${location.search}`
    : null;

  return (
    <>
      <AmbientLightBackground />
      {projectRouteKey ? (
        <ProjectRouteTransitionCover key={projectRouteKey} routeKey={projectRouteKey} />
      ) : null}
      <AnimatePresence mode="wait">
        <Suspense fallback={null}>
          <Routes location={location} key={location.pathname}>
            <Route path="/:locale/export" element={<PortfolioExportRoute />} />
            <Route path="/:locale/owner-tools/migrations" element={<OwnerMigrationToolsRoute />} />
            <Route path="/:locale/owner-tools/templates" element={<OwnerTemplateBuilderRoute />} />
            <Route path="/:locale/owner-tools/templates/gallery" element={<TemplateGalleryRoute />} />
            <Route path="/:locale" element={<LocaleLayout />}>
              <Route index element={<HomePage />} />
              <Route path="work" element={<WorkPage />} />
              <Route
                path="work/:slug"
                element={
                  <Suspense fallback={<ProjectRouteLoadingLayer />}>
                    <ProjectRouteShell />
                  </Suspense>
                }
              />
              <Route path="play" element={<GameArchivePage />} />
              <Route path="about" element={<Navigate to=".." replace />} />
              <Route path="contact" element={<Navigate to=".." replace />} />
              <Route path="game-archive" element={<Navigate to="../play" replace />} />
              <Route path="*" element={<Navigate to="work" replace />} />
            </Route>
            <Route path="*" element={<LegacyLocaleRedirect />} />
          </Routes>
        </Suspense>
      </AnimatePresence>
    </>
  );
}
