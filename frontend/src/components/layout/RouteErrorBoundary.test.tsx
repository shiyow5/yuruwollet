import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteErrorBoundary } from './RouteErrorBoundary';

function Boom(): never {
  throw new Error('chunk load failed');
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    // 境界がエラーを握るので、テスト出力を汚さないよう console.error を黙らせる
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('子が正常なら子を描画する', () => {
    render(
      <RouteErrorBoundary>
        <p>中身</p>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText('中身')).toBeInTheDocument();
  });

  it('子が throw したら白画面にせず再読み込み UI を出す', () => {
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument();
  });
});
