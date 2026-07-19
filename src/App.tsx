import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Shell } from "./layouts/Shell";
import { HomePage } from "./pages/HomePage";
import { WorkPage } from "./pages/WorkPage";
import { ProjectPage } from "./pages/ProjectPage";
import { GameArchivePage } from "./pages/GameArchivePage";
import { DEFAULT_LOCALE, isLocale, LocaleProvider, localizePath, readPreferredLocale } from "./locales/LocaleContext";

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

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/:locale" element={<LocaleLayout />}>
          <Route index element={<HomePage />} />
          <Route path="work" element={<WorkPage />} />
          <Route path="work/:slug" element={<ProjectPage />} />
          <Route path="play" element={<GameArchivePage />} />
          <Route path="about" element={<Navigate to=".." replace />} />
          <Route path="contact" element={<Navigate to=".." replace />} />
          <Route path="game-archive" element={<Navigate to="../play" replace />} />
          <Route path="*" element={<Navigate to="work" replace />} />
        </Route>
        <Route path="*" element={<LegacyLocaleRedirect />} />
      </Routes>
    </AnimatePresence>
  );
}
