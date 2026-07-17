import { Card, Icon } from '../../components/ui';

const REPO_URL = 'https://github.com/shiyow5/yuruwollet';

/**
 * アプリの情報。
 *
 * バージョンとライセンスは **書かない**。package.json は 0.0.0 のままで、
 * LICENSE ファイルも存在しない。事実でない情報を UI に出さない。
 */
export function AppInfoCard() {
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-headline-md text-body-lg font-medium text-custom-text">アプリについて</h3>
      <p className="text-body-md text-custom-text/70">
        ゆるり と しよを の二人だけが使える共同ウォレットです。
      </p>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 text-body-md text-accent-text hover:underline"
      >
        <Icon name="code" size={20} />
        ソースコード（GitHub）
      </a>
    </Card>
  );
}
