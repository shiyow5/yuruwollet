import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from './lib/auth/SessionProvider';
import { createQueryClient } from './lib/queryClient';
import { AppShell } from './components/layout/AppShell';
import { appRoutes } from './app/routes';
import { NotFoundPage } from './app/pages/NotFoundPage';

const queryClient = createQueryClient();

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Routes>
            <Route element={<AppShell />}>
              {/* ルートとナビは appRoutes 由来。ここに直接足すとナビに載らない */}
              {appRoutes.map((route) =>
                route.path === '/' ? (
                  <Route key={route.path} index element={route.element} />
                ) : (
                  <Route key={route.path} path={route.path.slice(1)} element={route.element} />
                ),
              )}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </SessionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
