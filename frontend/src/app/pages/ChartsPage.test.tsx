import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartsPage } from './ChartsPage';

// Recharts を静的に読み込むと、ホームや台帳しか開かない人にも配ることになる。
// ChartsPage は必ず lazy + Suspense で包む。
vi.mock('../../features/charts/ChartsBoard', () => ({
  ChartsBoard: () => <div data-testid="board" />,
}));

describe('ChartsPage', () => {
  it('ChartsBoard を lazy 読込し、その間フォールバックを出す', async () => {
    render(<ChartsPage />);

    // 最初のフレームではまだ本体が無く、読み込み中が出る
    expect(screen.getByRole('status', { name: 'グラフを読み込み中' })).toBeInTheDocument();
    expect(screen.queryByTestId('board')).toBeNull();

    // 解決後に本体が出る
    expect(await screen.findByTestId('board')).toBeInTheDocument();
  });
});
