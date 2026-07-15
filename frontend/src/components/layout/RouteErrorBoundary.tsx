import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../ui';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * ルート内容（遅延ロードするページ）のレンダリング/読み込みエラーを受け止める（#12）。
 *
 * React.lazy はチャンクの import() が失敗すると **レンダリング中に再スロー**する。
 * <Suspense> は保留中の Promise しか受けず、**失敗（reject）は受けない**。境界が無いと
 * ツリー全体が unmount してナビごと白画面になる。よくある発火:
 *   - デプロイ直後、古い index.html を開いたままの端末が、もう存在しない
 *     ハッシュ付きチャンクを取りに行って 404（本リポジトリは小さな修正を頻繁に出す）
 *   - スマホの回線が遷移中に切れて import() が失敗
 *
 * ナビは出したまま、コンテンツ領域に「再読み込み」を出して復帰できるようにする。
 * AppShell 側で location.pathname を key にしており、別画面へ遷移すれば自動で復帰する。
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 詳細はコンソールへ（本番のログ基盤は無いので最小限）。
    console.error('route render/chunk error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body-md text-body-md text-custom-text/70">
          画面を読み込めませんでした。通信状況を確認して、再読み込みしてください。
        </p>
        <Button onClick={() => window.location.reload()}>再読み込み</Button>
      </div>
    );
  }
}
