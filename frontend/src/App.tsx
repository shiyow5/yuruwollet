import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from './lib/auth/SessionProvider';
import { createQueryClient } from './lib/queryClient';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './app/pages/HomePage';
import { LedgerPage } from './app/pages/LedgerPage';
import { SubscriptionsPage } from './app/pages/SubscriptionsPage';
import { WishlistPage } from './app/pages/WishlistPage';
import { MyPage } from './app/pages/MyPage';
import { ChartsPage } from './app/pages/ChartsPage';
import { NotFoundPage } from './app/pages/NotFoundPage';

const queryClient = createQueryClient();

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="ledger" element={<LedgerPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="mypage" element={<MyPage />} />
              <Route path="charts" element={<ChartsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </SessionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
